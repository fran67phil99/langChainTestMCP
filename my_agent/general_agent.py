"""
Agente LangGraph intelligente con OpenAI
Un agente conversazionale che può:
- Rispondere a domande generali
- Eseguire analisi e ragionamenti
- Mantenere il contesto della conversazione
- Gestire errori e stati intermedi
"""

import os # os è già importato in orchestrator_agent.py, ma è bene averlo se questo file è eseguito stand-alone
import asyncio # Aggiunto asyncio
from typing import TypedDict, List, Optional, Annotated
from dotenv import load_dotenv
import json # Importato per gestire le richieste di riassunto MCP

from langgraph.graph import StateGraph, END
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

# Rimosso il tentativo di import di AsyncSqliteSaver e la variabile async_checkpointer_available
# perché non sono attivamente utilizzati per il checkpointing persistente nel codice attuale.
# Se si desidera riattivare il checkpointing persistente, sarà necessario ripristinare
# l'import e la logica di configurazione associata.


# Carica le variabili d'ambiente
load_dotenv()

# Funzione helper per preparare i messaggi per il riassunto MCP
def _prepare_mcp_summarization_messages(last_user_message_content: str) -> Optional[List[BaseMessage]]:
    """
    Prepara i messaggi per LLM se rileva una richiesta di riassunto MCP.
    Restituisce una lista di messaggi (solo SystemMessage per il riassunto) o None.
    """
    try:
        mcp_summarization_request = json.loads(last_user_message_content)
        if isinstance(mcp_summarization_request, dict) and mcp_summarization_request.get("action") == "summarize_mcp_data":
            print("ℹ️ General Agent: Detected MCP data summarization request (helper function).")
            original_query = mcp_summarization_request.get("original_query", "Dati ricevuti")
            mcp_data = mcp_summarization_request.get("mcp_data", {})
            
            summarization_system_prompt_content = f"""Sei un assistente AI che deve trasformare dati JSON grezzi in una risposta discorsiva e amichevole in italiano.
L'utente ha originariamente chiesto: '{original_query}'.
I dati JSON ottenuti da uno strumento sono:
{json.dumps(mcp_data, indent=2)}

Basati sulla richiesta originale e sui dati JSON, fornisci una risposta chiara, utile e ben ragionata all'utente.
Interpreta i dati e presentali in modo naturale e logico.
Se i dati sono una lista, descrivi cosa rappresenta e trai delle conclusioni se possibile.
Se sono un oggetto, spiega le sue proprietà principali e il loro significato.
Se i dati sono vuoti o non sembrano utili, informa l'utente in modo appropriato, spiegando perché potrebbero non essere utili.
Rispondi sempre in italiano.
"""
            return [SystemMessage(content=summarization_system_prompt_content)]
    except json.JSONDecodeError:
        # Non è una richiesta JSON valida, quindi non è per il riassunto MCP
        pass
    except Exception as e:
        print(f"⚠️ Errore durante la preparazione dei messaggi di riassunto MCP: {e}")
    return None

# Funzione helper per preparare i messaggi standard con history
def _prepare_standard_llm_messages(state_messages: List[BaseMessage], system_prompt: SystemMessage) -> List[BaseMessage]:
    """
    Prepara la lista standard di messaggi per LLM, includendo la cronologia e il system prompt.
    """
    messages_for_llm = [system_prompt]
    for msg in state_messages:
        if isinstance(msg, dict): # Gestisce i messaggi serializzati da/per checkpointer
            if msg.get('type') == 'human':
                messages_for_llm.append(HumanMessage(content=msg['content']))
            elif msg.get('type') == 'ai':
                messages_for_llm.append(AIMessage(content=msg['content']))
        elif isinstance(msg, BaseMessage): # Gestisce i messaggi BaseMessage diretti
            messages_for_llm.append(msg)
    return messages_for_llm


class AgentState(TypedDict):
    """
    Stato dell'agente che mantiene le informazioni durante l'esecuzione
    """
    messages: Annotated[List[BaseMessage], "Lista dei messaggi della conversazione"]
    current_step: str
    result: Optional[str]
    error: Optional[str]
    user_intent: Optional[str]  # Intenzione dell'utente rilevata
    requires_reasoning: bool    # Se richiede ragionamento complesso


# Funzione helper per aggiungere messaggi di history
def _append_history_messages(state_messages: List[BaseMessage], messages_for_llm: List[BaseMessage]):
    """Aggiunge i messaggi della cronologia alla lista dei messaggi per l'LLM."""
    for msg in state_messages:
        if isinstance(msg, dict):
            if msg.get('type') == 'human':
                messages_for_llm.append(HumanMessage(content=msg['content']))
            elif msg.get('type') == 'ai':
                messages_for_llm.append(AIMessage(content=msg['content']))
        elif isinstance(msg, BaseMessage): # Assicurati che sia un BaseMessage
            messages_for_llm.append(msg)


# Inizializza il modello OpenAI
def get_llm():
    """Inizializza e restituisce il modello OpenAI"""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or api_key == "your_openai_api_key_here":
        raise ValueError(
            "⚠️ OPENAI_API_KEY non configurata! "
            "Aggiorna il file .env con la tua chiave API OpenAI."
        )
    
    return ChatOpenAI(
        model="gpt-4o-mini",  # Modello più economico ma potente
        temperature=0.7,
        api_key=api_key
    )


async def analyze_intent_node(state: AgentState) -> AgentState: # Modificato in async def
    """
    Nodo che analizza l'intenzione dell'utente e determina il tipo di elaborazione
    """
    print("🧠 General Agent: Analizzando l'intenzione dell'utente...")
    
    try:
        # Estrae l'ultimo messaggio dell'utente
        last_message = state['messages'][-1]
        if isinstance(last_message, dict):
            user_input = last_message.get('content', '')
        else:
            user_input = last_message.content if hasattr(last_message, 'content') else str(last_message)
        
        # Semplice analisi dell'intenzione basata su parole chiave
        user_input_lower = user_input.lower()
        
        if any(word in user_input_lower for word in ['calcola', 'risolvi', 'analizza', 'ragiona', 'spiega perché']):
            intent = "reasoning"
            requires_reasoning = True
        elif any(word in user_input_lower for word in ['ciao', 'salve', 'buongiorno', 'come stai']):
            intent = "greeting"
            requires_reasoning = False
        elif any(word in user_input_lower for word in ['cosa', 'come', 'quando', 'dove', 'perché']):
            intent = "question"
            requires_reasoning = True
        else:
            intent = "general"
            requires_reasoning = False
        
        print(f"💡 Intenzione rilevata: {intent} (Ragionamento richiesto: {requires_reasoning})")
        
        return {
            **state,
            "current_step": "intent_analyzed",
            "user_intent": intent,
            "requires_reasoning": requires_reasoning,
            "error": None
        }
    except Exception as e:
        return {
            **state,
            "current_step": "error",
            "error": f"Errore nell'analisi dell'intenzione: {str(e)}"
        }


async def simple_response_node(state: AgentState) -> AgentState: # Modificato in async def
    """
    Nodo per risposte semplici che non richiedono ragionamento complesso
    """
    print("💬 General Agent: Generando risposta semplice...")
    
    try:
        llm = get_llm()
        
        # System prompt di default per risposte semplici
        default_system_prompt = SystemMessage(content="""
Sei un assistente AI amichevole e utile. Rispondi in modo naturale e conversazionale.
Mantieni le risposte concise ma informative. Usa un tono cordiale e professionale.
Rispondi sempre in italiano.
""")
        
        messages_for_llm = []
        
        # Controlla se l'ultimo messaggio dell'utente è una richiesta di riassumere dati MCP
        last_user_message_content = ""
        if state['messages']:
            last_message_obj = state['messages'][-1]
            # Assicurati che sia un HumanMessage e abbia contenuto stringa
            if isinstance(last_message_obj, HumanMessage) and isinstance(last_message_obj.content, str):
                last_user_message_content = last_message_obj.content
            elif isinstance(last_message_obj, dict) and last_message_obj.get('type') == 'human' and isinstance(last_message_obj.get('content'), str):
                 last_user_message_content = last_message_obj['content']

        # Prova a preparare i messaggi per il riassunto MCP
        mcp_summary_messages = _prepare_mcp_summarization_messages(last_user_message_content)
        
        if mcp_summary_messages:
            messages_for_llm = mcp_summary_messages
        else:
            # Non è una richiesta di riassunto MCP, procedi normalmente con la history
            # Aggiungi il system prompt di default prima della history
            messages_for_llm.append(default_system_prompt) 
            _append_history_messages(state['messages'], messages_for_llm)
        
        # Genera la risposta
        response = await llm.ainvoke(messages_for_llm) # Modificato in await llm.ainvoke
        ai_message = AIMessage(content=response.content)
        
        # Aggiorna lo stato
        updated_messages = state['messages'].copy()
        updated_messages.append(ai_message)
        
        print(f"✅ Risposta generata: {response.content[:100]}...")
        
        return {
            **state,
            "messages": updated_messages,
            "current_step": "simple_response_complete",
            "result": response.content,
            "error": None
        }
    except Exception as e:
        return {
            **state,
            "current_step": "error",
            "error": f"Errore nella generazione della risposta: {str(e)}"
        }


async def reasoning_response_node(state: AgentState) -> AgentState: # Modificato in async def
    """
    Nodo per risposte che richiedono ragionamento complesso
    """
    print("🤔 General Agent: Elaborando risposta con ragionamento...")
    
    try:
        llm = get_llm()
        
        # System prompt di default per ragionamento
        default_system_prompt = SystemMessage(content="""
Sei un assistente AI esperto in analisi e ragionamento. Quando ricevi una domanda:

1. Analizza attentamente la richiesta
2. Scomponi il problema in parti più piccole se necessario
3. Applica il ragionamento logico passo dopo passo
4. Fornisci spiegazioni chiare e dettagliate
5. Concludi con una risposta completa e ben strutturata

Usa sempre il seguente formato per le risposte complesse:

**Analisi:**
[La tua analisi del problema]

**Ragionamento:**
[I passaggi logici del tuo ragionamento]

**Conclusione:**
[La risposta finale chiara e concisa]

Rispondi sempre in italiano.
""")
        
        messages_for_llm = []

        # Controlla se l'ultimo messaggio dell'utente è una richiesta di riassumere dati MCP
        last_user_message_content = ""
        if state['messages']:
            last_message_obj = state['messages'][-1]
            # Assicurati che sia un HumanMessage e abbia contenuto stringa
            if isinstance(last_message_obj, HumanMessage) and isinstance(last_message_obj.content, str):
                last_user_message_content = last_message_obj.content
            elif isinstance(last_message_obj, dict) and last_message_obj.get('type') == 'human' and isinstance(last_message_obj.get('content'), str):
                 last_user_message_content = last_message_obj['content']

        # Prova a preparare i messaggi per il riassunto MCP
        mcp_summary_messages = _prepare_mcp_summarization_messages(last_user_message_content)

        if mcp_summary_messages:
            # È una richiesta di riassunto MCP, usa i messaggi specifici.
            # Anche se questo assicura che se il routing manda qui una richiesta di summarization, venga gestita.
            messages_for_llm = mcp_summary_messages
            print("ℹ️ General Agent (Reasoning Node): Using MCP summarization prompt via helper.")
        else:
            # Non è una richiesta di riassunto MCP, procedi normalmente con la history e il prompt di ragionamento
            # Aggiungi il system prompt di default prima della history
            messages_for_llm.append(default_system_prompt)
            _append_history_messages(state['messages'], messages_for_llm)

        # Genera la risposta con ragionamento
        response = await llm.ainvoke(messages_for_llm) # Modificato in await llm.ainvoke
        ai_message = AIMessage(content=response.content)
        
        # Aggiorna lo stato
        updated_messages = state['messages'].copy()
        updated_messages.append(ai_message)
        
        print(f"✅ Risposta con ragionamento generata: {response.content[:100]}...")
        
        return {
            **state,
            "messages": updated_messages,
            "current_step": "reasoning_response_complete",
            "result": response.content,
            "error": None
        }
    except Exception as e:
        return {
            **state,
            "current_step": "error",
            "error": f"Errore nel ragionamento: {str(e)}"
        }


async def error_node(state: AgentState) -> AgentState: # Modificato in async def
    """
    Nodo di gestione errori con logging migliorato
    """
    error_msg = state.get('error', 'Errore sconosciuto')
    print(f"❌ General Agent: Gestione errore: {error_msg}")
    
    # Crea un messaggio di errore user-friendly
    user_friendly_error = """
Mi dispiace, si è verificato un problema durante l'elaborazione della tua richiesta. 

Possibili cause:
• Problema di connessione con OpenAI
• Chiave API non configurata correttamente
• Errore temporaneo del servizio

Puoi riprovare la tua richiesta. Se il problema persiste, verifica la configurazione nell'file .env.
"""
    
    error_message = AIMessage(content=user_friendly_error.strip())
    
    # Aggiorna lo stato
    updated_messages = state['messages'].copy()
    updated_messages.append(error_message)
    
    return {
        **state,
        "messages": updated_messages,
        "current_step": "error_handled",
        "result": user_friendly_error.strip()
    }


async def finalize_node(state: AgentState) -> AgentState: # Modificato in async def
    """
    Nodo finale che prepara la risposta per l'output
    """
    print("✅ General Agent: Finalizzando la conversazione...")
    
    return {
        **state,
        "current_step": "completed"
    }


def should_continue(state: AgentState) -> str: # Rimane sincrona
    """
    Funzione di routing intelligente che decide il prossimo nodo
    """
    current_step = state.get("current_step", "")
    
    # Routing basato sullo stato corrente
    if current_step == "intent_analyzed":
        if state.get("requires_reasoning", False):
            return "reasoning_response"
        else:
            return "simple_response"
    elif current_step in ["simple_response_complete", "reasoning_response_complete"]:
        return "finalize"
    elif current_step == "error":
        return "error_handler"
    else:
        return END


def create_agent_graph() -> StateGraph: # Rimane sincrona
    """
    Crea e configura il grafo dell'agente intelligente
    """
    # Inizializza il grafo con lo stato
    workflow = StateGraph(AgentState)
    
    # Aggiungi i nodi
    workflow.add_node("analyze_intent", analyze_intent_node)
    workflow.add_node("simple_response", simple_response_node)
    workflow.add_node("reasoning_response", reasoning_response_node)
    workflow.add_node("error_handler", error_node)
    workflow.add_node("finalize", finalize_node)
    
    # Definisci il punto di ingresso
    workflow.set_entry_point("analyze_intent")
    
    # Aggiungi le transizioni condizionali
    workflow.add_conditional_edges(
        "analyze_intent", # Nodo da cui partono gli edge condizionali
        should_continue,
        {
            "simple_response": "simple_response",
            "reasoning_response": "reasoning_response",
            "error_handler": "error_handler", # Assicurati che error_handler sia un nodo
            END: END 
        }
    )

    # Aggiungi edge dagli altri nodi a "finalize" o "error_handler"
    workflow.add_edge("simple_response", "finalize")
    workflow.add_edge("reasoning_response", "finalize")
    workflow.add_edge("error_handler", END) # L'error handler potrebbe terminare il grafo
    workflow.add_edge("finalize", END) # Il nodo finalize termina il grafo

    return workflow


# --- Funzione principale per eseguire il grafo dell'agente generale ---
async def run_general_agent(initial_messages: List[BaseMessage], thread_id: Optional[str] = None) -> AgentState:
    """
    Esegue il grafo dell'agente generale con i messaggi iniziali e un thread_id.
    """
    # Crea la definizione del grafo dell'agente
    agent_graph_definition = create_agent_graph()

    # Compila il grafo per renderlo eseguibile
    agent_graph_runnable = agent_graph_definition.compile()

    # Configura il checkpointer se thread_id è fornito
    config = {}
    if thread_id:
        # LangGraph usa thread_id per la gestione dello stato (es. in memoria se non diversamente specificato)
        # L'uso di AsyncSqliteSaver per checkpointing persistente era commentato e la logica semplificata.
        config = {"configurable": {"thread_id": thread_id}}
    # Rimosso il blocco `elif thread_id` ridondante e la gestione di `async_checkpointer_available`

    # Prepara lo stato iniziale
    # Il primo step dovrebbe essere quello di analisi dell'intento
    initial_state = AgentState(
        messages=initial_messages,
        current_step="initial", # Lo stato iniziale prima che il primo nodo (analyze_intent) venga eseguito
        result=None,
        error=None,
        user_intent=None,
        requires_reasoning=False
    )

    print(f"🚀 General Agent: Invoking graph with initial state: {initial_state}, config: {config}")
    
    # Invoca il grafo compilato
    # Nota: l'entry point è "analyze_intent", quindi il primo nodo eseguito sarà analyze_intent_node
    final_state = await agent_graph_runnable.ainvoke(initial_state, config=config if config else None)
    
    print(f"🏁 General Agent: Graph execution finished. Final state: {final_state}")
    return final_state


# Esporta il grafo compilato per LangGraph
graph = create_agent_graph().compile()
