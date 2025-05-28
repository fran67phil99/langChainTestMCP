import os
import sys
import asyncio
import json # Assicurati che sia importato
import traceback # Assicurati che sia importato
from typing import TypedDict, List, Optional, Dict, Annotated, Any

from langchain_core.tools import Tool # Importa la classe Tool
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage # Assicurati che SystemMessage sia importato
from langgraph.graph import StateGraph, END # MODIFICATO: Aggiunto StateGraph e END
from langchain_openai import ChatOpenAI # AGGIUNTO IMPORT

# Importa da mcp_utils
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from mcp_utils import get_all_mcp_tools

# Importa il checkpointer asincrono se disponibile, altrimenti usa quello sincrono
try:
    from langgraph.checkpoint.aiosqlite import AsyncSqliteSaver
    async_checkpointer_available = True
except ImportError:
    print("Nota: AsyncSqliteSaver non disponibile, verrà utilizzato il checkpointer predefinito.")
    async_checkpointer_available = False

# Importa l'agente generale.
from my_agent import general_agent
from my_agent import mcp_agent # Aggiunto import per mcp_agent

# --- Definizione dello Stato dell'Orchestratore ---
class OrchestratorState(TypedDict):
    """
    Stato dell'agente orchestratore.
    """
    messages: Annotated[List[BaseMessage], "Lista dei messaggi della conversazione originale"]
    task_description: Optional[Dict[str, Any]]  # MODIFICATO: any -> Any
    selected_agent: Optional[str]  
    current_task_result: Optional[str] 
    final_response: Optional[str]
    error: Optional[str]
    current_orchestration_step: str
    mcp_tools_registry: Optional[List[Tool]] # MODIFICATO: da List[Dict[str, any]] a List[Tool]
    # thread_id: Optional[str] 

# --- Registro Globale Strumenti MCP e Lock ---
mcp_tools_registry_cache: List[Tool] = [] # MODIFICATO: da List[Dict[str, any]] a List[Tool]
mcp_tools_registry_lock = asyncio.Lock()
# mcp_discovery_url non è più usato direttamente qui, ma da mcp_utils

# --- Inizializzazione LLM (simile a general_agent) ---
def get_llm():
    """Inizializza e restituisce il modello OpenAI"""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or api_key == "your_openai_api_key_here":
        raise ValueError(
            "⚠️ OPENAI_API_KEY non configurata! "
            "Aggiorna il file .env con la tua chiave API OpenAI."
        )
    return ChatOpenAI(
        model="gpt-4o-mini",
        temperature=0.7,
        api_key=api_key
    )

# --- Nodi dell'Orchestratore ---

async def load_mcp_tools_if_needed(state: OrchestratorState) -> OrchestratorState:
    """
    Carica gli strumenti MCP utilizzando mcp_utils.get_all_mcp_tools()
    se il registro cache è vuoto. Popola state['mcp_tools_registry'].
    """
    global mcp_tools_registry_cache
    async with mcp_tools_registry_lock:
        if not mcp_tools_registry_cache:
            print("🛠️ Orchestrator: MCP tools cache is empty. Attempting to load tools via mcp_utils...")
            try:
                # Aggiungi un timeout per evitare il blocco infinito
                newly_loaded_tools = await asyncio.wait_for(
                    get_all_mcp_tools(), 
                    timeout=30.0  # 30 secondi di timeout
                )
                
                mcp_tools_registry_cache = newly_loaded_tools
                
                if not mcp_tools_registry_cache:
                    print("⚠️ Orchestrator: MCP tools registry is empty after loading attempt via mcp_utils.")
                else:
                    print(f"✅ Orchestrator: MCP tools registry loaded with {len(mcp_tools_registry_cache)} tools via mcp_utils.")
                    # Opzionale: loggare i nomi degli strumenti caricati
                    # for tool_obj in mcp_tools_registry_cache:
                    #     print(f"  -> Tool: {tool_obj.name} - Async: {tool_obj.coroutine is not None}")
            except asyncio.TimeoutError:
                print("❌ Orchestrator: Timeout during MCP tools loading (30s). Server might be unreachable.")
                mcp_tools_registry_cache = [] # Assicura che sia vuoto in caso di timeout
            except Exception as e_load:
                print(f"❌ Orchestrator: Exception during MCP tools loading via mcp_utils: {e_load}")
                traceback.print_exc()
                mcp_tools_registry_cache = [] # Assicura che sia vuoto in caso di errore
        else:
            print("🛠️ Orchestrator: Using cached MCP tools registry.")
            
    return {**state, "mcp_tools_registry": mcp_tools_registry_cache}


async def route_task_node(state: OrchestratorState) -> OrchestratorState:
    """
    Nodo che analizza la richiesta, carica gli strumenti MCP se necessario,
    e decide a quale agente specializzato instradarla (MCP o General).
    Utilizza un LLM per selezionare lo strumento MCP se appropriato.
    Gli strumenti MCP sono ora oggetti Tool di Langchain.
    """
    print("🚦 Orchestrator: Routing task...")
    
    state_with_tools = await load_mcp_tools_if_needed(state)
    current_mcp_tools: List[Tool] = state_with_tools.get("mcp_tools_registry", []) # Ora è List[Tool]

    if not state_with_tools.get('messages'): # Controlla se 'messages' esiste ed è popolato
        print("❌ Orchestrator: No messages in state to route.")
        return {
            **state_with_tools,
            "error": "Nessun messaggio fornito per il routing.",
            "current_orchestration_step": "error_in_routing"
        }
        
    # Estrazione robusta di user_input_content
    user_input_content = ""
    raw_messages = state_with_tools.get('messages', [])

    if raw_messages:
        print(f"ℹ️ Orchestrator: Attempting to extract user query from {len(raw_messages)} messages.")
        for i, msg_data in enumerate(reversed(raw_messages)):
            current_content_value = None
            message_source_type = ""

            if isinstance(msg_data, HumanMessage):
                message_source_type = "HumanMessage object"
                current_content_value = msg_data.content
            elif isinstance(msg_data, dict):
                message_source_type = f"dict (type: {msg_data.get('type')})"
                if msg_data.get("type") == "human":
                    current_content_value = msg_data.get("content")
            else:
                message_source_type = f"unknown (type: {type(msg_data)})"
                print(f"  Message {len(raw_messages)-1-i} ({message_source_type}). Skipping.")
                continue

            print(f"  Message {len(raw_messages)-1-i} ({message_source_type}). Raw content type: {type(current_content_value)}")

            if isinstance(current_content_value, str) and current_content_value.strip():
                user_input_content = current_content_value.strip()
                print(f'✅ Orchestrator: Extracted user query: "{user_input_content[:100]}..."')
                break 
            elif current_content_value is not None:
                print(f"⚠️ Orchestrator: Message content is not a non-empty string (type: {type(current_content_value)}, value: '{str(current_content_value)[:100]}...'). Continuing search.")
        
        if not user_input_content: 
            print("⚠️ Orchestrator: No suitable human-equivalent message with non-empty string content found.")
    else: 
        print("ℹ️ Orchestrator: Message list is empty. user_input_content remains empty.")

    if not user_input_content: # Se ancora vuoto dopo tutti i tentativi
        print("⚠️ Orchestrator: Final user_input_content is empty. Routing to general_agent by default or error if critical.")
        # Potresti voler gestire questo caso in modo più specifico, es. errore o default a general_agent
    else:
        print(f'ℹ️ Orchestrator: Final user_input_content for LLM: "{user_input_content[:100]}..."')
    
    selected_agent = "general_agent" 
    task_description_for_agent: Optional[Dict[str, Any]] = {"query": user_input_content}

    if current_mcp_tools and user_input_content: # Aggiunto controllo che user_input_content non sia vuoto
        print(f"🧠 Orchestrator: Attempting to route to MCP agent using {len(current_mcp_tools)} tools for query: '{user_input_content[:50]}...'")
        llm = get_llm()
        
        tools_description_for_prompt = "\\n".join([
            f"- Nome: {tool.name}, Descrizione: {tool.description}" 
            for tool in current_mcp_tools
        ])
        
        prompt_messages = [
            SystemMessage(content=f"""Sei un assistente AI che deve selezionare lo strumento più appropriato da una lista per rispondere alla richiesta dell'utente.
La tua risposta DEVE essere un oggetto JSON con la chiave 'selected_tool_name' contenente il nome esatto dello strumento scelto, oppure 'none' se nessuno strumento è adatto.
Se uno strumento è adatto, includi anche una chiave 'extracted_params' che è un dizionario di parametri estratti dalla query utente necessari per lo strumento (può essere vuoto {{}} se non servono parametri o non sono estraibili).
Non aggiungere alcuna spiegazione al di fuori dell'oggetto JSON.

Strumenti disponibili:
{tools_description_for_prompt}
"""),
            HumanMessage(content=f'Richiesta Utente: "{user_input_content}"')
        ]
        
        try:
            ai_response = await llm.ainvoke(prompt_messages)
            print(f"🤖 LLM response for tool selection: {ai_response.content}")
            
            llm_output_content = ai_response.content
            
            # Rimuovi i backtick di Markdown e l'eventuale specificatore di lingua "json"
            if isinstance(llm_output_content, str): # Assicurati che sia una stringa prima di processarla
                if llm_output_content.startswith("```json"):
                    llm_output_content = llm_output_content[len("```json"):]

                elif llm_output_content.startswith("```"):
                    llm_output_content = llm_output_content[len("```"):]

                if llm_output_content.endswith("```"):
                    llm_output_content = llm_output_content[:-len("```")]
                
                llm_output_content = llm_output_content.strip()
            else:
                print(f"⚠️ Orchestrator: LLM output content is not a string ({type(llm_output_content)}). Skipping Markdown cleaning.")


            try:
                llm_choice = json.loads(llm_output_content)
                selected_tool_name = llm_choice.get("selected_tool_name")
                extracted_params = llm_choice.get("extracted_params", {})

                if not isinstance(extracted_params, dict):
                    print(f"⚠️ Orchestrator: 'extracted_params' from LLM is not a dictionary: {extracted_params}. Defaulting to empty dict.")
                    extracted_params = {}

                if selected_tool_name and selected_tool_name != "none":
                    chosen_tool: Optional[Tool] = next((tool for tool in current_mcp_tools if tool.name == selected_tool_name), None)
                    
                    if chosen_tool:
                        selected_agent = "mcp_agent"
                        task_description_for_agent = {
                            "tool_to_invoke": chosen_tool, 
                            "tool_params": extracted_params,
                            "original_user_query": user_input_content 
                        }
                        print(f"✅ Orchestrator: LLM selected MCP tool: {chosen_tool.name} with params: {extracted_params}")
                    else:
                        print(f"⚠️ Orchestrator: LLM selected tool '{selected_tool_name}' but it was not found in the registry of Tool objects.")
                else:
                    print("ℹ️ Orchestrator: LLM decided no MCP tool is suitable or no tool name provided. Routing to general_agent.")
            except json.JSONDecodeError as json_err:
                print(f"❌ Orchestrator: Error decoding JSON from LLM for tool selection: {json_err}")
                print(f"   LLM raw content was: {ai_response.content}") # Logga il contenuto grezzo per debug
            except Exception as e_parse:
                print(f"❌ Orchestrator: Error processing LLM response for tool selection: {e_parse}")
                traceback.print_exc()

        except Exception as e:
            print(f"❌ Orchestrator: Error invoking LLM for tool selection: {e}")
            traceback.print_exc()
    elif not user_input_content and current_mcp_tools:
        print("ℹ️ Orchestrator: User input content is empty, but MCP tools are available. Defaulting to general_agent.")
    else: # No MCP tools or user_input_content is empty
        print("ℹ️ Orchestrator: No MCP tools loaded or user input is empty. Defaulting to general_agent.")

    print(f"🚦 Orchestrator: Routing to '{selected_agent}' with task: '{str(task_description_for_agent)[:200]}...'")
    return {
        **state_with_tools,
        "selected_agent": selected_agent,
        "task_description": task_description_for_agent,
        "current_orchestration_step": "task_routed",
        "error": None
    }

async def invoke_specialist_node(state: OrchestratorState) -> OrchestratorState:
    """
    Invoca l'agente specializzato selezionato (General o MCP) per eseguire il task.
    """
    print(f"🔄 Orchestrator: Invoking specialist node for agent: {state.get('selected_agent')}")
    # task_description = state.get("current_task_description") # CHIAVE SBAGLIATA, deve essere "task_description"
    task_details_for_specialist = state.get("task_description") # CORRETTO
    selected_agent = state.get("selected_agent")
    
    # Gestione thread_id per i checkpointer (se necessario e disponibile)
    thread_id_for_config = None
    if async_checkpointer_available and state.get('messages'): # Assumiamo che thread_id sia legato alla conversazione
        # Potresti voler generare/recuperare un thread_id univoco per la conversazione qui
        # Per ora, usiamo un placeholder o lo deriviamo se possibile
        # Se l'orchestratore stesso ha un thread_id nella sua config, potremmo passarlo
        # Questo dipende da come `run_orchestrator` gestisce i thread_id
        # Ad esempio, se `run_orchestrator` riceve un `thread_id` e lo mette nello stato,
        # potremmo recuperarlo da lì.
        # Per ora, lo lasciamo a None o a un default se non specificato.
        # thread_id_for_config = state.get("thread_id", f"specialist_thread_{hash(state['messages'][0].content[:20])}")
        # Semplifichiamo: se l'orchestratore ha un thread_id, lo usiamo.
        # Questo richiede che `run_orchestrator` passi il suo `thread_id` nella config iniziale.
        # Oppure, se ogni specialista gestisce i propri thread indipendentemente, non serve passarlo.
        # Per ora, assumiamo che `run_general_agent` e `run_mcp_agent` possano prenderlo opzionalmente.
        # Se l'orchestratore è chiamato con un thread_id, lo passiamo.
        # Questo deve essere gestito nella chiamata a `orchestrator_graph.ainvoke` in `run_orchestrator`.
        # Se `state` contiene `thread_id` (messo da `run_orchestrator` via config), usalo.
        # Per ora, non lo passiamo esplicitamente qui, lasciando che gli agenti usino il loro default se necessario.
        pass


    # updated_messages = state.get('messages', []).copy() # Non necessario qui, lo fa compile_response
    agent_response_content = "Nessuna risposta dall'agente specializzato."

    try:
        if selected_agent == "general_agent":
            print(f"🗣️ Orchestrator: Calling General Agent with task: {task_details_for_specialist}")
            
            # Il general_agent si aspetta una lista di messaggi.
            # task_details_for_general_agent per general_agent è {"query": user_input_content}
            query_for_general_agent = task_details_for_specialist.get("query", "")
            if not query_for_general_agent:
                 query_for_general_agent = str(task_details_for_specialist) # Fallback

            general_agent_input_messages = [HumanMessage(content=query_for_general_agent)]
            
            # run_general_agent(input_messages: List[BaseMessage], thread_id: Optional[str] = None)
            general_agent_response_state = await general_agent.run_general_agent(
                general_agent_input_messages, 
                # thread_id=thread_id_for_config # Opzionale
            )

            if general_agent_response_state and general_agent_response_state.get('messages'):
                for msg in reversed(general_agent_response_state['messages']):
                    if isinstance(msg, AIMessage):
                        agent_response_content = msg.content
                        break
            else:
                agent_response_content = "Il General Agent non ha fornito una risposta strutturata."
            print(f"💬 General Agent response: {agent_response_content}")

        elif selected_agent == "mcp_agent":
            print(f"🤖 Orchestrator: Calling MCP Agent with task details: {task_details_for_specialist}")
            if not isinstance(task_details_for_specialist, dict):
                print("❌ Orchestrator: Errore - task_description per mcp_agent deve essere un dizionario.")
                return {
                    **state,
                    "error": "Formato task non valido per mcp_agent.",
                    "current_orchestration_step": "error_invoking_specialist"
                }
            
            # run_mcp_agent(task_details_from_orchestrator: dict, thread_id: Optional[str] = None)
            mcp_agent_final_state = await mcp_agent.run_mcp_agent(
                task_details_for_specialist, 
                # thread_id=thread_id_for_config # Opzionale
            )
            
            if mcp_agent_final_state.get("error"):
                agent_response_content = f"Errore dall'MCP Agent: {mcp_agent_final_state.get('final_result', mcp_agent_final_state.get('error'))}"
                print(f"❌ Orchestrator: Error from MCP Agent: {agent_response_content}")
                # Propaghiamo l'errore.
                return {
                    **state,
                    "current_task_result": agent_response_content, 
                    "error": agent_response_content, 
                    "current_orchestration_step": "specialist_invoked" 
                }
            else:
                mcp_raw_output = mcp_agent_final_state.get("mcp_server_response")
                original_user_query = task_details_for_specialist.get("original_user_query", "") # Assicurati che sia passato a mcp_agent
                
                print(f"ℹ️ Orchestrator: MCP Agent completed. Raw output: {str(mcp_raw_output)[:200]}...")
                print(f"ℹ️ Orchestrator: Now calling General Agent to make MCP output conversational.")

                # Prepara l'input per il general_agent
                # Usiamo un HumanMessage con un JSON strutturato che general_agent dovrà interpretare.
                summarization_prompt_content = json.dumps({
                    "action": "summarize_mcp_data",
                    "original_query": original_user_query,
                    "mcp_data": mcp_raw_output
                })
                
                general_agent_input_messages = [
                    HumanMessage(content=summarization_prompt_content)
                ]

                print(f"🗣️ Orchestrator: Calling General Agent for summarization with: {str(general_agent_input_messages)[:200]}...")
                
                general_agent_response_state = await general_agent.run_general_agent(
                    general_agent_input_messages,
                    # thread_id=thread_id_for_config # Opzionale
                )

                agent_response_content = None # Resetta per sicurezza
                if general_agent_response_state and general_agent_response_state.get('messages'):
                    for msg in reversed(general_agent_response_state['messages']):
                        if isinstance(msg, AIMessage):
                            agent_response_content = msg.content
                            break
                
                # Fallback se AIMessage non ha contenuto o non è presente, ma c'è un 'result'
                if not agent_response_content and general_agent_response_state and general_agent_response_state.get('result'):
                     agent_response_content = general_agent_response_state.get('result')
                
                if not agent_response_content: # Se ancora vuoto dopo tutti i controlli
                    agent_response_content = "Il General Agent non ha fornito una risposta adeguata per i dati MCP."
                    print("⚠️ Orchestrator: General Agent did not provide a structured response for MCP data.")
                
                print(f"💬 General Agent (after MCP) response: {str(agent_response_content)[:200]}...")
            
            # agent_response_content è ora il risultato della chiamata a general_agent (o l'errore da mcp_agent)
            # Il resto del nodo popolerà lo stato dell'orchestratore con questo.

        else:
            agent_response_content = f"Agente '{selected_agent}' non riconosciuto o non implementato."
            print(f"⚠️ Orchestrator: {agent_response_content}")
            return {
                **state,
                "error": agent_response_content,
                "current_orchestration_step": "error_invoking_specialist"
            }

        return {
            **state,
            "current_task_result": agent_response_content, 
            "current_orchestration_step": "specialist_invoked",
            "error": None
        }

    except Exception as e:
        print(f"❌ Orchestrator: Exception during specialist invocation: {e}")
        import traceback
        traceback.print_exc()
        return {
            **state,
            "error": f"Eccezione durante l'invocazione dell'agente specializzato: {str(e)}",
            "current_orchestration_step": "error_invoking_specialist"
        }

async def compile_response_node(state: OrchestratorState) -> OrchestratorState:
    """
    Nodo che compila la risposta finale basata sul risultato dell'agente specializzato.
    Il risultato è atteso in state['current_task_result'] come stringa.
    """
    print("📝 Orchestrator: Compiling final response...")
    # specialist_result = state.get("result_from_specialist") # CHIAVE VECCHIA
    current_task_output = state.get("current_task_result")

    # if not specialist_result or not isinstance(specialist_result, dict) or 'messages' not in specialist_result:
    if current_task_output is None: # Modificato per controllare current_task_result
        error_msg = "Risultato nullo o mancante dall'agente specializzato (current_task_result)."
        print(f"❌ Orchestrator: {error_msg}")
        final_response = "Mi dispiace, non sono riuscito a ottenere una risposta strutturata dall'agente specializzato."
    else:
        # Assumiamo che current_task_result sia già la stringa di risposta finale dall'agente
        final_response = str(current_task_output) 

    updated_messages = state.get('messages', []).copy()
    updated_messages.append(AIMessage(content=final_response)) # Aggiungi la risposta finale ai messaggi

    print(f"✅ Orchestrator: Final response compiled: '{final_response[:100]}...'")
    return {
        **state,
        "messages": updated_messages,
        "final_response": final_response,
        "current_orchestration_step": "response_compiled",
        "error": None # Resetta l'errore se la compilazione ha successo
    }

async def orchestrator_error_node(state: OrchestratorState) -> OrchestratorState: # Modificato in async def
    """
    Nodo di gestione errori per l'orchestratore.
    """
    error_msg = state.get('error', 'Errore sconosciuto nell\'orchestrazione')
    print(f"❌ Orchestrator Error Handler: {error_msg}")
    
    user_friendly_error = f"Mi dispiace, si è verificato un problema durante l'orchestrazione. Dettagli: {error_msg}"
    
    # Aggiunge un messaggio di errore alla lista dei messaggi per LangGraph Dev
    updated_messages = state.get('messages', []).copy()
    updated_messages.append(AIMessage(content=user_friendly_error))

    return {
        **state,
        "messages": updated_messages, # Cruciale per la visibilità in LangGraph Dev
        "final_response": user_friendly_error,
        "current_orchestration_step": "orchestration_error_handled"
    }

# --- Logica di Routing dell'Orchestratore ---
# La logica di routing rimane sincrona perché restituisce solo una stringa
def should_continue_orchestrator(state: OrchestratorState) -> str:
    """
    Decide il prossimo nodo da eseguire nel grafo dell'orchestratore.
    """
    current_step = state.get("current_orchestration_step", "")
    has_error = state.get("error") is not None

    if has_error and current_step != "orchestration_error_handled": # Evita loop se error_node stesso fallisce
        print(f"⚠️ Orchestrator: Error detected at step '{current_step}', routing to error handler.")
        return "error_handler"

    if current_step == "task_routed":
        return "invoke_specialist"
    elif current_step == "specialist_invoked": # Corretto per gestire questo step
        return "compile_response"
    elif current_step == "response_compiled":
        return END
    elif current_step == "orchestration_error_handled":
        return END
    # Rimuoviamo il blocco else che terminava per step sconosciuti
    # se uno step non è gestito esplicitamente, è un errore di logica
    # e dovrebbe essere corretto, non terminare silenziosamente.
    # Tuttavia, per ora, se arriva uno step non previsto, lo manderemo all'error handler.
    else:
        print(f"⚠️ Orchestrator: Unknown step '{current_step}', routing to error handler.")
        state["error"] = f"Stato di orchestrazione imprevisto: {current_step}"
        return "error_handler"

# --- Creazione del Grafo dell'Orchestratore ---
def create_orchestrator_graph() -> StateGraph:
    """
    Crea e configura il grafo dell'agente orchestratore.
    """
    workflow = StateGraph(OrchestratorState)

    # Aggiungi i nodi al grafo
    # workflow.add_node("load_tools", load_mcp_tools_if_needed) # Potrebbe essere un nodo iniziale o chiamato da route_task
    workflow.add_node("route_task", route_task_node)
    workflow.add_node("invoke_specialist", invoke_specialist_node)
    workflow.add_node("compile_response", compile_response_node)
    workflow.add_node("error_handler", orchestrator_error_node)

    # Definisci il punto di ingresso
    workflow.set_entry_point("route_task")

    # Aggiungi le transizioni condizionali
    workflow.add_conditional_edges(
        "route_task",
        should_continue_orchestrator,
        {
            "invoke_specialist": "invoke_specialist",
            "error_handler": "error_handler"
        }
    )
    workflow.add_conditional_edges(
        "invoke_specialist",
        should_continue_orchestrator,
        {
            "compile_response": "compile_response",
            "error_handler": "error_handler"
        }
    )
    workflow.add_conditional_edges(
        "compile_response",
        should_continue_orchestrator,
        {
            END: END, # Transizione normale alla fine
            "error_handler": "error_handler" # Se compile_response stesso segnala un errore
        }
    )
    
    # Transizione finale dal gestore di errori
    workflow.add_edge("error_handler", END)

    return workflow

# Compila il grafo dell'orchestratore
# Rimuoviamo l'istanza esplicita di MemorySaver e la passiamo a builder.compile()
# affidandoci al checkpointer di default di LangGraph.
# if async_checkpointer_available:
#     # Usa il checkpointer asincrono se disponibile
#     memory_orchestrator = AsyncSqliteSaver.sqlite(":memory:")
#     orchestrator_graph = create_orchestrator_graph().compile(checkpointer=memory_orchestrator)
# else:
#     # Altrimenti, usa il compilatore standard
#     orchestrator_graph = create_orchestrator_graph().compile()

orchestrator_graph = create_orchestrator_graph().compile() # Lasciamo che LangGraph gestisca il checkpointer di default


# --- Esecuzione e Interfaccia Chat per l'Orchestratore ---
async def run_orchestrator(user_input: str, thread_id: Optional[str] = None) -> dict: # thread_id reso opzionale
    """
    Esegue l'agente orchestratore con un input specifico.
    """
    human_message = HumanMessage(content=user_input)
    initial_state = OrchestratorState(
        messages=[human_message],
        current_orchestration_step="initial", 
        task_description=None,
        selected_agent=None,
        current_task_result=None, 
        final_response=None,
        error=None,
        mcp_tools_registry=None, 
    )
    
    print(f"🚀 Orchestrator: Invoking graph with initial state for thread '{thread_id}': {initial_state}")
    
    config = {}
    if async_checkpointer_available and thread_id: # Configura il thread_id per il checkpointer
        config = {"configurable": {"thread_id": thread_id}} # CORRETTA INDENTAZIONE
    
    final_state_after_run = await orchestrator_graph.ainvoke(initial_state, config=config if config else None) 
    
    print(f"🏁 Orchestrator: Graph execution finished for thread '{thread_id}'. Final state: {final_state_after_run}")
    return final_state_after_run

# --- Main di Test (Esempio) ---
async def main_test():
    print("--- Test Orchestrator --- ")
    
    test_queries = [
        "Ciao, come stai?",
        "chi sono gli stagisti di mauden?", # Dovrebbe usare MCP se lo strumento è disponibile
        "Qual è il summary del modello 'alpha'?", # Dovrebbe usare MCP
        "Esegui inferenza sul modello 'beta' con dati {'input': 'test'}", # Dovrebbe usare MCP
        "Raccontami una barzelletta"
    ]

    # Creare un thread_id univoco per questa sessione di test, se si usa il checkpointer
    test_session_thread_id = f"test_session_{os.urandom(4).hex()}"
    print(f"Test session thread_id: {test_session_thread_id}")

    for i, query in enumerate(test_queries):
        print(f"\n--- Query {i+1}: {query} ---")
        # Passa lo stesso thread_id per mantenere la conversazione se il checkpointer è attivo
        # e se gli agenti sono progettati per usare la history dei messaggi dal checkpointer.
        # Per ora, ogni `run_orchestrator` è una nuova interazione con stato iniziale pulito (tranne per il registro strumenti).
        # Se si vuole una conversazione continua, `initial_state` in `run_orchestrator` dovrebbe caricare
        # i messaggi precedenti dal checkpointer per il `thread_id` dato.
        # La nostra implementazione attuale di `run_orchestrator` non lo fa, inizia sempre con un solo HumanMessage.
        
        # Per testare la continuità con checkpointer, dovresti modificare `run_orchestrator`
        # per recuperare lo stato precedente o almeno i messaggi.
        # Qui, per semplicità, ogni query è trattata come l'inizio di una nuova "esecuzione" del grafo
        # ma all'interno dello stesso `thread_id` se il checkpointer è usato.
        
        # Se il checkpointer è usato, lo stato viene salvato e ripristinato tra le chiamate ainvoke sullo stesso thread_id.
        # La nostra `initial_state` in `run_orchestrator` sovrascrive lo stato all'inizio di ogni chiamata,
        # il che non è ideale per la continuità della conversazione tramite checkpointer.
        # Tuttavia, il checkpointer è utile per la resilienza e l'osservabilità.

        # Per questo test, passiamo un thread_id diverso per ogni query per simulare interazioni separate
        # ma mantenendo la cache degli strumenti MCP.
        query_thread_id = f"query_thread_{i}_{os.urandom(2).hex()}"

        result = await run_orchestrator(query, thread_id=query_thread_id)
        print(f"\n--- Risultato Finale per Query {i+1} ---")
        if result.get("error"):
            print(f"Errore: {result.get('error')}")
        print(f"Risposta: {result.get('final_response')}")
        # print(f"Stato completo: {result}") # Decommenta per debug dettagliato
        print("------------------------")

if __name__ == "__main__":
    # Configura il logger per LangSmith se la chiave API è presente
    langsmith_api_key = os.getenv("LANGCHAIN_API_KEY")
    if langsmith_api_key:
        os.environ["LANGCHAIN_TRACING_V2"] = "true"
        os.environ["LANGCHAIN_ENDPOINT"] = "https://api.smith.langchain.com"
        os.environ["LANGCHAIN_PROJECT"] = "MyLangGraphProgettoProva" # Nome del progetto su LangSmith
        print("✅ LangSmith tracing abilitato.")
    else:
        print("ℹ️ LangSmith tracing non abilitato (LANGCHAIN_API_KEY non trovata).")

    # Esegui il loop degli eventi asyncio
    if sys.platform == "win32" and sys.version_info >= (3, 8):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main_test())
