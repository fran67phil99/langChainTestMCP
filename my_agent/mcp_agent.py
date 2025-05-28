"""
Agente LangGraph specializzato per interagire con un server MCP (Model Context Protocol).
Questo agente riceverà task specifici dall'orchestratore,
interagirà (simulando per ora) con un server MCP e restituirà i risultati.
"""
import os
import asyncio
import traceback # Aggiunto per il logging degli errori
from typing import TypedDict, List, Optional, Annotated
from dotenv import load_dotenv
# import httpx # Rimosso, l'oggetto Tool gestirà la chiamata HTTP

from langgraph.graph import StateGraph, END
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage # SystemMessage non usato qui
from langchain_core.tools import Tool # Importa la classe Tool

load_dotenv()

# --- Definizione dello Stato dell'Agente MCP ---
class MCPAgentState(TypedDict):
    """
    Stato dell'agente MCP.
    """
    messages: Annotated[List[BaseMessage], "Lista dei messaggi, principalmente per input e output formattato"]
    task_details: Optional[dict]      # Dettagli del task: {'tool_to_invoke': Tool, 'tool_params': dict}
    mcp_server_response: Optional[dict] # Risposta JSON dallo strumento MCP
    final_result: Optional[str]       # Risultato finale formattato per l'orchestratore
    error: Optional[str]
    current_mcp_step: str

# --- Nodi dell'Agente MCP ---

async def process_mcp_request_node(state: MCPAgentState) -> MCPAgentState:
    """
    Nodo che riceve i dettagli del task (un oggetto Tool e i suoi parametri),
    invoca lo strumento e formatta la risposta.
    """
    print("⚙️ MCP Agent: Processing MCP request via Tool object...")
    task_details = state.get("task_details")

    if not task_details or not isinstance(task_details, dict):
        error_msg = "Nessun dettaglio del task fornito o formato non corretto."
        print(f"❌ MCP Agent: {error_msg}")
        return {
            **state,
            "error": error_msg,
            "current_mcp_step": "error_processing_request"
        }

    tool_to_invoke: Optional[Tool] = task_details.get("tool_to_invoke")
    tool_params: Optional[dict] = task_details.get("tool_params")

    if not isinstance(tool_to_invoke, Tool):
        error_msg = f"Dettaglio 'tool_to_invoke' mancante o non è un oggetto Tool. Ricevuto: {type(tool_to_invoke)}"
        print(f"❌ MCP Agent: {error_msg}")
        return {
            **state,
            "error": error_msg,
            "current_mcp_step": "error_processing_request"
        }

    if not isinstance(tool_params, dict):
        # Se tool_params non è un dizionario, lo impostiamo a dizionario vuoto
        # assumendo che lo strumento possa essere chiamato senza parametri.
        # Potrebbe essere meglio generare un errore se i parametri sono cruciali e mancano.
        print(f"⚠️ MCP Agent: 'tool_params' non è un dizionario (ricevuto: {type(tool_params)}). Uso {{}} come parametri.")
        tool_params = {}

    print(f"📦 MCP Agent: Attempting to invoke tool: {tool_to_invoke.name} with params: {tool_params}")

    actual_mcp_response_data = None
    final_agent_result = ""
    error_message = None

    try:
        if tool_to_invoke.coroutine:
            # Strumento asincrono
            print(f"  -> Invoking coroutine for tool {tool_to_invoke.name}")
            actual_mcp_response_data = await tool_to_invoke.coroutine(**tool_params)
        elif tool_to_invoke.func:
            # Strumento sincrono (eseguito in un thread separato per non bloccare il loop asyncio)
            print(f"  -> Invoking func for tool {tool_to_invoke.name} (will run in thread executor)")
            loop = asyncio.get_event_loop()
            actual_mcp_response_data = await loop.run_in_executor(None, tool_to_invoke.func, *tool_params.values()) # Passa i valori se func li prende posizionalmente
            # Se func si aspetta kwargs: await loop.run_in_executor(None, lambda: tool_to_invoke.func(**tool_params))
            # Per semplicità, assumiamo che le func definite in mcp_utils accettino kwargs
            actual_mcp_response_data = await loop.run_in_executor(None, lambda: tool_to_invoke.func(**tool_params))

        else:
            error_message = f"Lo strumento '{tool_to_invoke.name}' non ha né 'func' né 'coroutine' definiti."

        if actual_mcp_response_data is not None:
            # La risposta dovrebbe essere già un dizionario JSON (o una stringa/numero se lo strumento restituisce quello)
            final_agent_result = f"Risposta dallo strumento MCP '{tool_to_invoke.name}': {str(actual_mcp_response_data)[:500]}..."
        elif not error_message:
            error_message = f"L'invocazione dello strumento '{tool_to_invoke.name}' non ha prodotto una risposta."

    except Exception as e:
        error_message = f"Errore durante l'invocazione dello strumento '{tool_to_invoke.name}': {str(e)}"
        print(f"❌ MCP Agent: Exception during tool invocation: {error_message}")
        traceback.print_exc()


    if error_message:
        print(f"❌ MCP Agent: Error during MCP tool processing: {error_message}")
        return {
            **state,
            "error": error_message,
            "current_mcp_step": "error_invoking_tool" # Nuovo step di errore
        }

    print(f"✅ MCP Agent: Tool '{tool_to_invoke.name}' invoked successfully. Response data: {str(actual_mcp_response_data)[:100]}...")
    
    updated_messages = state.get('messages', []).copy()
    # Aggiungiamo la risposta grezza o un sommario ai messaggi per debug/logging
    updated_messages.append(AIMessage(content=f"Tool {tool_to_invoke.name} executed. Result: {final_agent_result}"))


    return {
        **state,
        "messages": updated_messages,
        "mcp_server_response": actual_mcp_response_data, # Questo è il dato grezzo restituito dallo strumento
        "final_result": final_agent_result, # Questa è una stringa formattata per l'orchestratore
        "current_mcp_step": "mcp_request_processed",
        "error": None
    }

async def mcp_error_node(state: MCPAgentState) -> MCPAgentState:
    """
    Nodo di gestione errori per l'agente MCP.
    """
    error_msg = state.get('error', 'Errore sconosciuto nell\'agente MCP')
    print(f"❌ MCP Agent Error Handler: {error_msg}")
    
    user_friendly_error = f"Si è verificato un problema nell'agente MCP: {error_msg}"
    
    updated_messages = state.get('messages', []).copy()
    updated_messages.append(AIMessage(content=user_friendly_error))

    return {
        **state,
        "messages": updated_messages,
        "final_result": user_friendly_error,
        "current_mcp_step": "mcp_error_handled"
        # Non cancellare l'errore qui, l'orchestratore potrebbe volerlo vedere
    }

# --- Logica di Routing dell'Agente MCP ---
def should_continue_mcp(state: MCPAgentState) -> str:
    """
    Decide il prossimo nodo da eseguire nel grafo dell'agente MCP.
    """
    current_step = state.get("current_mcp_step", "")
    has_error = state.get("error") is not None

    if has_error and current_step != "mcp_error_handled":
        # Aggiungi il nuovo step di errore alla logica di routing
        if current_step in ["error_processing_request", "error_invoking_tool"]: # Aggiornato
             return "error_handler_mcp"
        return "error_handler_mcp" 

    if current_step == "mcp_request_processed":
        return END
    elif current_step == "mcp_error_handled":
        return END
    # Rimuovi il blocco 'else' che gestiva "error_simulating_mcp" come sconosciuto
    # perché ora abbiamo "error_interacting_with_mcp"
    elif current_step == "initial": # Se è lo step iniziale, vai a processare
        return "process_mcp_request"
    else: 
        print(f"⚠️ MCP Agent: Unknown step '{current_step}', routing to error handler.")
        state["error"] = f"Stato imprevisto nell'agente MCP: {current_step}"
        return "error_handler_mcp"


# --- Creazione del Grafo dell'Agente MCP ---
def create_mcp_agent_graph() -> StateGraph:
    """
    Crea e configura il grafo dell'agente MCP.
    """
    workflow = StateGraph(MCPAgentState)

    workflow.add_node("process_mcp_request", process_mcp_request_node)
    workflow.add_node("error_handler_mcp", mcp_error_node) # Nome univoco

    workflow.set_entry_point("process_mcp_request") # L'input iniziale andrà qui

    # Definiamo lo stato iniziale che run_mcp_agent passerà al grafo
    # Questo non è più necessario qui, la definizione del grafo è separata dall'esecuzione.
    # initial_state_setup = {
    #     "current_mcp_step": "initial" 
    # }
    # workflow.set_initial_state(initial_state_setup)


    workflow.add_conditional_edges(
        "process_mcp_request",
        should_continue_mcp,
        {
            END: END,
            "error_handler_mcp": "error_handler_mcp",
            # "process_mcp_request": "process_mcp_request" # Rimosso per evitare loop se should_continue non gestisce bene "initial"
        } 
    )
    
    # Aggiungiamo un edge dall'error_handler_mcp a END
    workflow.add_edge("error_handler_mcp", END)
    
    # Il codice per inizializzare lo stato, invocare il grafo e gestire la configurazione
    # è stato rimosso da qui poiché appartiene alla funzione run_mcp_agent o
    # a un blocco di esecuzione specifico, non alla definizione del grafo.
    # La funzione create_mcp_agent_graph deve restituire l'oggetto workflow.
    
    return workflow

# Compila il grafo MCP (opzionale qui, può essere fatto in run_mcp_agent o globalmente)
# mcp_agent_graph = create_mcp_agent_graph().compile()

# --- Esecuzione e Interfaccia per l'Agente MCP ---
# Questa funzione è cruciale per l'integrazione con l'orchestratore
async def run_mcp_agent(task_details_from_orchestratore: dict, thread_id: Optional[str] = None) -> MCPAgentState:
    """
    Esegue l'agente MCP con i dettagli del task forniti dall'orchestratore.
    """
    print(f"🏃 MCP Agent: Running with task_details: {str(task_details_from_orchestratore)[:200]} and thread_id: {thread_id}")

    # Prepara lo stato iniziale per l'invocazione del grafo MCP
    # L'input dell'utente originale non è direttamente passato qui, ma i task_details sì.
    # Creiamo un HumanMessage fittizio se necessario per la struttura dei messaggi,
    # ma il contenuto principale è in task_details.
    initial_messages = [HumanMessage(content=f"Richiesta MCP ricevuta: {str(task_details_from_orchestratore)}")]

    initial_state = MCPAgentState(
        messages=initial_messages,
        task_details=task_details_from_orchestratore, # Questo è l'input chiave
        mcp_server_response=None,
        final_result=None,
        error=None,
        current_mcp_step="initial" # Lo stato iniziale per il routing interno di MCP
    )

    # Compila il grafo se non è già stato globalmente o se si preferisce una compilazione per esecuzione
    # Per semplicità, assumiamo che sia compilato una volta e importato o definito globalmente.
    # Se si usa un checkpointer, la configurazione va qui.
    
    # Ottieni il grafo compilato (potrebbe essere definito globalmente o importato)
    # Per ora, lo creiamo e compiliamo qui per assicurarci che sia disponibile.
    # In un'applicazione più grande, potresti volerlo fare una volta all'avvio.
    mcp_graph_definition = create_mcp_agent_graph()
    
    # Considera l'uso di un checkpointer se la persistenza dello stato è necessaria per l'agente MCP
    # from langgraph.checkpoint.aiosqlite import AsyncSqliteSaver
    # memory_mcp = AsyncSqliteSaver.sqlite(":memory:")
    # compiled_mcp_graph = mcp_graph_definition.compile(checkpointer=memory_mcp)
    compiled_mcp_graph = mcp_graph_definition.compile()


    config = {}
    if thread_id: #  and checkpointer_is_configured_for_mcp_graph
        config = {"configurable": {"thread_id": thread_id}}

    print(f"📨 MCP Agent: Invoking graph with initial state: {initial_state} and config: {config}")
    
    # Esegui il grafo con lo stato iniziale
    # final_state = await mcp_agent_graph.ainvoke(initial_state, config=config if config else None)
    final_state = await compiled_mcp_graph.ainvoke(initial_state, config=config if config else None)
    
    print(f"🏁 MCP Agent: Graph execution finished. Final state: {final_state}")
    return final_state


if __name__ == '__main__':
    # Esempio di esecuzione diretta per testare l'agente MCP
    async def test_mcp_agent():
        print("--- Test MCP Agent ---")
        
        # Per testare mcp_agent direttamente ora, dovremmo creare un oggetto Tool fittizio.
        # Questo è più complesso. I test di integrazione attraverso l'orchestratore
        # saranno più significativi una volta che l'orchestratore passa i veri Tool.

        # Esempio di come potrebbe essere un task_details (richiede un Tool fittizio)
        class MockTool:
            def __init__(self, name, description, is_async=False):
                self.name = name
                self.description = description
                self.coroutine = None
                self.func = None
                if is_async:
                    self.coroutine = self._async_func
                else:
                    self.func = self._sync_func

            async def _async_func(self, **kwargs):
                print(f"MockTool (async) '{self.name}' called with {kwargs}")
                await asyncio.sleep(0.1)
                return {"status": "success_async", "tool_name": self.name, "params": kwargs}

            def _sync_func(self, **kwargs):
                print(f"MockTool (sync) '{self.name}' called with {kwargs}")
                return {"status": "success_sync", "tool_name": self.name, "params": kwargs}

        mock_async_tool = MockTool("mock_async_tool", "A mock async tool", is_async=True)
        mock_sync_tool = MockTool("mock_sync_tool", "A mock sync tool", is_async=False)

        print("\\n--- Test 1: Async Mock Tool ---")
        task1 = {
            "tool_to_invoke": mock_async_tool,
            "tool_params": {"param1": "value1", "param2": 123}
        }
        result1 = await run_mcp_agent(task1, "mcp_test_thread_mock_async")
        print(f"Result for Async Mock Tool: {result1.get('final_result')}")
        if result1.get('error'):
            print(f"Error: {result1.get('error')}")

        print("\\n--- Test 2: Sync Mock Tool ---")
        task2 = {
            "tool_to_invoke": mock_sync_tool,
            "tool_params": {"data": "some_data"}
        }
        result2 = await run_mcp_agent(task2, "mcp_test_thread_mock_sync")
        print(f"Result for Sync Mock Tool: {result2.get('final_result')}")
        if result2.get('error'):
            print(f"Error: {result2.get('error')}")

        print("\\n--- Test 3: Tool non valido ---")
        task3 = {
            "tool_to_invoke": "non_un_tool_object", # Non un oggetto Tool
            "tool_params": {}
        }
        result3 = await run_mcp_agent(task3, "mcp_test_thread_invalid_tool")
        print(f"Result for Invalid Tool: {result3.get('final_result')}")
        if result3.get('error'):
            print(f"Error: {result3.get('error')}")

        print("\\n--- Test 4: Task details mancanti ---")
        # result4 = await run_mcp_agent(None, "mcp_test_thread_missing_details") # type: ignore
        # print(f"Result for Missing Details: {result4.get('final_result')}")
        # if result4.get('error'):
        #     print(f"Error: {result4.get('error')}")
        # Commentato perché il type checker si lamenterebbe giustamente di None

        print("\\n--- Test 5: Tool senza func/coroutine (richiede modifica a MockTool o un nuovo mock) ---")
        class BrokenMockTool(Tool): # type: ignore
            def __init__(self, name, description):
                super().__init__(name=name, func=None, description=description, coroutine=None) # type: ignore

        broken_tool = BrokenMockTool("broken_tool", "A tool with no executable function")
        task5 = {
            "tool_to_invoke": broken_tool,
            "tool_params": {}
        }
        result5 = await run_mcp_agent(task5, "mcp_test_thread_broken_tool")
        print(f"Result for Broken Tool: {result5.get('final_result')}")
        if result5.get('error'):
            print(f"Error: {result5.get('error')}")


    asyncio.run(test_mcp_agent())
