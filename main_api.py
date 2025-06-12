from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
import json # Aggiunto per coerenza con le modifiche precedenti
from dotenv import load_dotenv # Importa load_dotenv

# Assicurati che i percorsi siano corretti per importare da my_agent
# Questo potrebbe richiedere aggiustamenti a sys.path se main_api.py è nella root
# e my_agent è una sottocartella.
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__))) # Aggiunge la directory corrente a sys.path

# from my_agent.orchestrator_agent import run_orchestrator, OrchestratorState # Rimosso
from my_agent.mcp_agent import run_mcp_agent # Aggiunto

app = FastAPI()

# Configurazione CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Per sviluppo; in produzione, restringi questo
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {} # thread_id -> WebSocket

    async def connect(self, websocket: WebSocket, thread_id: str):
        await websocket.accept()
        self.active_connections[thread_id] = websocket

    def disconnect(self, thread_id: str):
        if thread_id in self.active_connections:
            del self.active_connections[thread_id]

    async def send_personal_message(self, message: str, thread_id: str):
        if thread_id in self.active_connections:
            await self.active_connections[thread_id].send_text(message)

manager = ConnectionManager()

@app.websocket("/ws/{thread_id}")
async def websocket_endpoint(websocket: WebSocket, thread_id: str):
    await manager.connect(websocket, thread_id)
    print(f"INFO: WebSocket {thread_id}: Frontend connesso.")
    try:
        while True:
            user_query = await websocket.receive_text()
            print(f"INFO: WebSocket {thread_id}: Ricevuto messaggio: \"{user_query}\"")
            
            # Invia messaggio di elaborazione usando thread_id
            await manager.send_personal_message(f"Elaborazione: \"{user_query}\"...", thread_id)

            _final_response_to_send = ""
            try:
                # Esegui il mcp_agent refactored con l'input dell'utente e il thread_id
                # run_mcp_agent ora restituisce Optional[str]
                mcp_agent_result: Optional[str] = await run_mcp_agent(user_query, thread_id=thread_id)
                
                if mcp_agent_result is not None:
                    _final_response_to_send = mcp_agent_result
                else:
                    # Se run_mcp_agent restituisce None, significa che c'è stato un problema
                    # o nessuna risposta è stata generata.
                    _final_response_to_send = "Nessuna risposta disponibile o si è verificato un errore interno."
            
            except Exception as e_process: # Cattura eccezioni durante la chiamata a run_mcp_agent o la gestione del risultato
                print(f"ERROR: WebSocket {thread_id}: Eccezione durante l'elaborazione del messaggio con mcp_agent: {e_process}")
                import traceback
                traceback.print_exc() # Stampa lo stack trace completo per un debug più approfondito
                _final_response_to_send = f"Errore interno del server durante l'elaborazione: {str(e_process)}"
            
            print(f"INFO: WebSocket {thread_id}: Invio risposta: \"{_final_response_to_send}\"")
            # Invia risposta finale usando thread_id
            await manager.send_personal_message(_final_response_to_send, thread_id)

    except WebSocketDisconnect:
        print(f"INFO: WebSocket {thread_id}: Frontend disconnesso.")
        # manager.disconnect è gestito da finally, non è necessario qui esplicitamente.
    except Exception as e_ws:
        # Log a più dettagliato errore per il debug lato server
        import traceback
        print(f"ERROR: WebSocket {thread_id}: Errore imprevisto nella connessione: {e_ws}\\n{traceback.format_exc()}")
        # Invia un errore generico al client se la connessione è ancora abbastanza aperta per farlo
        try:
            # Invia messaggio di errore usando thread_id
            await manager.send_personal_message("Errore: Si è verificato un problema con la connessione WebSocket.", thread_id)
        except Exception as e_send_error:
            print(f"ERROR: WebSocket {thread_id}: Impossibile inviare messaggio di errore WebSocket al client: {e_send_error}")
    finally:
        print(f"INFO: WebSocket {thread_id}: Chiusura connessione e pulizia.")
        manager.disconnect(thread_id)

if __name__ == "__main__":
    # Carica le variabili d'ambiente dal file .env
    load_dotenv() # Chiamata a load_dotenv()

    # Configura LangSmith come fai in orchestrator_agent.py
    LANGCHAIN_API_KEY = os.getenv("LANGCHAIN_API_KEY")
    if LANGCHAIN_API_KEY:
        os.environ["LANGCHAIN_TRACING_V2"] = "true"
        os.environ["LANGCHAIN_ENDPOINT"] = "https://api.smith.langchain.com"
        # Usa un nome di progetto diverso per distinguere le tracce API da quelle dei test diretti
        os.environ["LANGCHAIN_PROJECT"] = os.getenv("LANGCHAIN_PROJECT_API", "MyLangGraphProgetto-API") 
        print("✅ LangSmith tracing abilitato per l\'API FastAPI.")
    else:
        print("ℹ️ LangSmith tracing non abilitato per l\'API FastAPI (LANGCHAIN_API_KEY non trovata).")
    
    print("Avvio server FastAPI con Uvicorn su http://localhost:8001")
    print("Endpoint WebSocket disponibile su ws://localhost:8001/ws/{thread_id}")
    uvicorn.run(app, host="0.0.0.0", port=8001)

