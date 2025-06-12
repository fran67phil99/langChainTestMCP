"""
Agente LangGraph specializzato per interagire con un server MCP (Model Context Protocol).
Questo agente riceverà task specifici dall'orchestratore,
interagirà (simulando per ora) con un server MCP e restituirà i risultati.
"""
import os
import asyncio
import traceback # Aggiunto per il logging degli errori
import json # Added
from typing import TypedDict, List, Optional, Annotated, Dict, Any # Added Dict, Any
from dotenv import load_dotenv
# import httpx # Rimosso, l'oggetto Tool gestirà la chiamata HTTP

from langgraph.graph import StateGraph, END
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage # Added SystemMessage
from langchain_core.tools import Tool # Importa la classe Tool
from langchain_openai import ChatOpenAI # Added

# Importa da mcp_utils
from mcp_utils import get_all_mcp_tools # Added

# Importa l'agente generale
from my_agent import general_agent # Added

load_dotenv()

# --- Registro Globale Strumenti MCP e Lock (Copiato da orchestrator_agent.py) ---
mcp_tools_registry_cache: List[Tool] = []
mcp_tools_registry_lock = asyncio.Lock()

# --- Inizializzazione LLM (Copiato da orchestrator_agent.py) ---
def get_llm():
    """Inizializza e restituisce il modello OpenAI"""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or api_key == "your_openai_api_key_here":
        raise ValueError(
            "⚠️ OPENAI_API_KEY non configurata! "
            "Aggiorna il file .env con la tua chiave API OpenAI."
        )
    return ChatOpenAI(
        model="gpt-4o-mini", # Considera di rendere configurabile il modello
        temperature=0.7, # Considera di rendere configurabile la temperatura
        api_key=api_key
    )

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
    user_query: Optional[str]
    mcp_tools_registry: Optional[List[Tool]]
    selected_tool_details: Optional[Dict[str, Any]]
    invoke_general_agent_for_summarization: bool = False
    invoke_general_agent_directly: bool = False

# --- Nodi dell'Agente MCP ---

async def load_mcp_tools_node(state: MCPAgentState) -> MCPAgentState:
    """
    Carica gli strumenti MCP utilizzando mcp_utils.get_all_mcp_tools()
    se il registro cache è vuoto. Popola state['mcp_tools_registry'].
    Questo nodo è simile a load_mcp_tools_if_needed nell'orchestratore ma per l'agente MCP.
    """
    global mcp_tools_registry_cache
    print("🛠️ MCP Agent: Loading MCP tools if needed...")
    async with mcp_tools_registry_lock:
        if not mcp_tools_registry_cache:
            print("🛠️ MCP Agent: MCP tools cache is empty. Attempting to load tools via mcp_utils...")
            try:
                newly_loaded_tools = await asyncio.wait_for(
                    get_all_mcp_tools(),
                    timeout=30.0  # 30 secondi di timeout
                )
                mcp_tools_registry_cache = newly_loaded_tools
                if not mcp_tools_registry_cache:
                    print("⚠️ MCP Agent: MCP tools registry is empty after loading attempt.")
                    return {
                        **state,
                        "mcp_tools_registry": [],
                        "error": "MCP tools registry is empty after loading.",
                        "current_mcp_step": "error_loading_tools"
                    }
                else:
                    print(f"✅ MCP Agent: MCP tools registry loaded with {len(mcp_tools_registry_cache)} tools.")
            except asyncio.TimeoutError:
                print("❌ MCP Agent: Timeout during MCP tools loading (30s).")
                mcp_tools_registry_cache = []
                return {
                    **state,
                    "mcp_tools_registry": [],
                    "error": "Timeout during MCP tools loading.",
                    "current_mcp_step": "error_loading_tools"
                }
            except Exception as e_load:
                print(f"❌ MCP Agent: Exception during MCP tools loading: {e_load}")
                traceback.print_exc()
                mcp_tools_registry_cache = []
                return {
                    **state,
                    "mcp_tools_registry": [],
                    "error": f"Exception during MCP tools loading: {str(e_load)}",
                    "current_mcp_step": "error_loading_tools"
                }
        else:
            print("🛠️ MCP Agent: Using cached MCP tools registry.")

    return {
        **state,
        "mcp_tools_registry": mcp_tools_registry_cache,
        "current_mcp_step": "tools_loaded",
        "error": None
    }

async def route_query_node(state: MCPAgentState) -> MCPAgentState:
    """
    Analizza user_query, utilizza l'LLM per selezionare un tool MCP o per instradare al general_agent.
    Popola selected_tool_details o imposta invoke_general_agent_directly.
    """
    print("🚦 MCP Agent: Routing user query...")
    user_query = state.get("user_query")
    mcp_tools = state.get("mcp_tools_registry", [])

    if not user_query:
        print("❌ MCP Agent: No user query provided for routing.")
        return {
            **state,
            "error": "User query is missing.",
            "current_mcp_step": "error_routing_query"
        }

    if not mcp_tools:
        print("ℹ️ MCP Agent: No MCP tools loaded. Routing to general agent directly.")
        return {
            **state,
            "invoke_general_agent_directly": True,
            "current_mcp_step": "invoke_general_directly",
            "error": None
        }

    print(f"🧠 MCP Agent: Attempting to select MCP tool for query: '{user_query[:100]}...'")
    llm = get_llm()

    tools_description_for_prompt = "\\n".join([
        f"- Nome: {tool.name}, Descrizione: {tool.description}"
        for tool in mcp_tools
    ])

    prompt_messages = [
        SystemMessage(content=f"""Sei un assistente AI che deve selezionare lo strumento più appropriato da una lista per rispondere alla richiesta dell'utente.
La tua risposta DEVE essere un oggetto JSON con la chiave 'selected_tool_name' contenente il nome esatto dello strumento scelto, oppure 'none' se nessuno strumento è adatto.
Se uno strumento è adatto, includi anche una chiave 'extracted_params' che è un dizionario di parametri estratti dalla query utente necessari per lo strumento (può essere vuoto {{}} se non servono parametri o non sono estraibili).
Non aggiungere alcuna spiegazione al di fuori dell'oggetto JSON.

Strumenti disponibili:
{tools_description_for_prompt}
"""),
        HumanMessage(content=f'Richiesta Utente: "{user_query}"')
    ]

    try:
        ai_response = await llm.ainvoke(prompt_messages)
        print(f"🤖 LLM response for tool selection in MCP Agent: {ai_response.content}")

        llm_output_content = ai_response.content
        if isinstance(llm_output_content, str):
            if llm_output_content.startswith("```json"):
                llm_output_content = llm_output_content[len("```json"):]
            elif llm_output_content.startswith("```"):
                llm_output_content = llm_output_content[len("```"):]
            if llm_output_content.endswith("```"):
                llm_output_content = llm_output_content[:-len("```")]
            llm_output_content = llm_output_content.strip()
        else:
            print(f"⚠️ MCP Agent: LLM output content is not a string ({type(llm_output_content)}).")
            # Consider how to handle this - perhaps error or default to general. For now, proceed and let json.loads fail.

        try:
            llm_choice = json.loads(llm_output_content)
            selected_tool_name = llm_choice.get("selected_tool_name")
            extracted_params = llm_choice.get("extracted_params", {})

            if not isinstance(extracted_params, dict):
                print(f"⚠️ MCP Agent: 'extracted_params' from LLM is not a dictionary: {extracted_params}. Defaulting to empty dict.")
                extracted_params = {}

            if selected_tool_name and selected_tool_name != "none":
                chosen_tool: Optional[Tool] = next((tool for tool in mcp_tools if tool.name == selected_tool_name), None)
                if chosen_tool:
                    print(f"✅ MCP Agent: LLM selected MCP tool: {chosen_tool.name} with params: {extracted_params}")
                    return {
                        **state,
                        "selected_tool_details": {"tool_to_invoke": chosen_tool, "tool_params": extracted_params},
                        "current_mcp_step": "mcp_tool_selected",
                        "invoke_general_agent_directly": False,
                        "error": None
                    }
                else:
                    print(f"⚠️ MCP Agent: LLM selected tool '{selected_tool_name}' but it was not found in the registry. Routing to general agent.")
            else:
                print("ℹ️ MCP Agent: LLM decided no MCP tool is suitable or no tool name provided. Routing to general agent.")

        except json.JSONDecodeError as json_err:
            print(f"❌ MCP Agent: Error decoding JSON from LLM for tool selection: {json_err}")
            print(f"   LLM raw content was: {ai_response.content}")
            # Fallback to general agent in case of JSON error
        except Exception as e_parse:
            print(f"❌ MCP Agent: Error processing LLM response for tool selection: {e_parse}")
            traceback.print_exc()
            # Fallback to general agent

    except Exception as e:
        print(f"❌ MCP Agent: Error invoking LLM for tool selection: {e}")
        traceback.print_exc()
        # Fallback to general agent in case of LLM invocation error

    # Default action if MCP tool not selected or error occurred in selection
    return {
        **state,
        "invoke_general_agent_directly": True,
        "current_mcp_step": "invoke_general_directly",
        "selected_tool_details": None, # Ensure this is cleared
        "error": state.get("error") # Preserve previous error if any, or set new if one occurred here
    }

async def process_mcp_request_node(state: MCPAgentState) -> MCPAgentState:
    """
    Nodo che riceve i dettagli del tool selezionato (un oggetto Tool e i suoi parametri) da state.selected_tool_details,
    invoca lo strumento e, in caso di successo, imposta lo stato per la successiva sumarizzazione.
    """
    print("⚙️ MCP Agent: Processing MCP request via Tool object (from selected_tool_details)...")
    selected_tool_details = state.get("selected_tool_details")

    if not selected_tool_details or not isinstance(selected_tool_details, dict):
        error_msg = "Nessun dettaglio del tool selezionato fornito o formato non corretto."
        print(f"❌ MCP Agent: {error_msg}")
        return {
            **state,
            "error": error_msg,
            "current_mcp_step": "error_processing_request" # Step di errore generico per questa fase
        }

    tool_to_invoke: Optional[Tool] = selected_tool_details.get("tool_to_invoke")
    tool_params: Optional[dict] = selected_tool_details.get("tool_params")

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
    # Non mettiamo più final_agent_result qui, sarà gestito dal nodo di sumarizzazione/general agent
    updated_messages.append(AIMessage(content=f"Tool {tool_to_invoke.name} executed successfully. Raw data stored."))


    return {
        **state,
        "messages": updated_messages,
        "mcp_server_response": actual_mcp_response_data, # Dato grezzo per la sumarizzazione
        # "final_result": None, # Non impostiamo final_result qui
        "invoke_general_agent_for_summarization": True, # Imposta per il prossimo step
        "current_mcp_step": "mcp_request_processed_summarize", # Nuovo step
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

    # Assicura che final_result sia sempre impostato in caso di errore gestito
    # Questo è importante se il grafo termina dopo questo nodo.
    if not state.get("final_result"):
        state["final_result"] = user_friendly_error

    return {
        **state,
        "messages": updated_messages,
        "final_result": state["final_result"], # Assicura che sia passato
        "current_mcp_step": "mcp_error_handled"
        # Non cancellare l'errore qui, l'orchestratore potrebbe volerlo vedere
    }

async def invoke_general_agent_node(state: MCPAgentState) -> MCPAgentState:
    """
    Invoca l'agente generale, o per una query diretta o per riassumere la risposta MCP.
    Il risultato viene memorizzato in final_result.
    """
    print("🔄 MCP Agent: Invoking General Agent Node...")
    user_query = state.get("user_query")
    mcp_response_data = state.get("mcp_server_response")
    invoke_directly = state.get("invoke_general_agent_directly", False)
    invoke_for_summarization = state.get("invoke_general_agent_for_summarization", False)

    general_agent_input_messages: List[BaseMessage] = []
    error_message = None
    agent_response_content = None

    if invoke_directly:
        if not user_query:
            error_message = "User query is missing for direct general agent invocation."
            print(f"❌ MCP Agent: {error_message}")
        else:
            print(f"🗣️ MCP Agent: Calling General Agent directly with query: '{user_query[:100]}...'")
            general_agent_input_messages = [HumanMessage(content=user_query)]

    elif invoke_for_summarization:
        if not mcp_response_data or not user_query:
            error_message = "MCP server response or user query is missing for summarization."
            print(f"❌ MCP Agent: {error_message}")
        else:
            print(f"🗣️ MCP Agent: Calling General Agent for summarization of MCP data related to query: '{user_query[:100]}...'")
            summarization_prompt_content = json.dumps({
                "action": "summarize_mcp_data", # Azione che il general_agent dovrebbe riconoscere
                "original_query": user_query,
                "mcp_data": mcp_response_data
            })
            general_agent_input_messages = [HumanMessage(content=summarization_prompt_content)]
    else:
        error_message = "Nessuna condizione valida per invocare il general_agent."
        print(f"⚠️ MCP Agent: {error_message}. Neither invoke_directly nor invoke_for_summarization is true.")
        # Questo non dovrebbe accadere se la logica del grafo è corretta

    if error_message:
        return {
            **state,
            "error": error_message,
            "current_mcp_step": "error_invoking_general_agent",
            "final_result": "Error before invoking general agent."
        }

    if not general_agent_input_messages:
        # Questo caso potrebbe verificarsi se invoke_directly o invoke_for_summarization erano True
        # ma l'input necessario (user_query o mcp_response_data) mancava, e l'errore è già stato loggato.
        # Si ritorna uno stato di errore.
         return {
            **state,
            "error": "Input messages for general agent are empty, likely due to missing query/data.",
            "current_mcp_step": "error_invoking_general_agent",
            "final_result": "Could not prepare input for general agent."
        }

    try:
        # Esegui il general_agent
        # Assumiamo che run_general_agent possa prendere un thread_id, ma per ora non lo passiamo
        # Se necessario, il thread_id dovrebbe essere parte dello stato MCPAgentState e passato qui.
        print(f"📨 MCP Agent: Sending to general_agent: {general_agent_input_messages[0].content[:200]}...")
        general_agent_response_state = await general_agent.run_general_agent(input_messages=general_agent_input_messages)

        if general_agent_response_state and general_agent_response_state.get('messages'):
            for msg in reversed(general_agent_response_state['messages']):
                if isinstance(msg, AIMessage) and msg.content:
                    agent_response_content = str(msg.content)
                    break

        if not agent_response_content and general_agent_response_state and general_agent_response_state.get('result'):
            # Fallback se 'messages' non ha prodotto contenuto ma 'result' esiste (come in alcuni esempi di general_agent)
            agent_response_content = str(general_agent_response_state.get('result'))

        if not agent_response_content:
            agent_response_content = "Il General Agent non ha fornito una risposta valida."
            print(f"⚠️ MCP Agent: {agent_response_content}")
            # Potrebbe essere considerato un errore parziale, ma per ora lo trattiamo come una risposta.

        print(f"💬 MCP Agent: General Agent response: '{agent_response_content[:200]}...'")
        return {
            **state,
            "final_result": agent_response_content,
            "current_mcp_step": "general_agent_invoked",
            "error": None,
            # Resetta i flag di invocazione
            "invoke_general_agent_directly": False,
            "invoke_general_agent_for_summarization": False
        }

    except Exception as e:
        error_msg = f"Errore durante l'invocazione del General Agent: {str(e)}"
        print(f"❌ MCP Agent: {error_msg}")
        traceback.print_exc()
        return {
            **state,
            "error": error_msg,
            "final_result": f"Fallimento nell'ottenere una risposta dal General Agent: {error_msg}",
            "current_mcp_step": "error_invoking_general_agent",
            # Resetta i flag di invocazione
            "invoke_general_agent_directly": False,
            "invoke_general_agent_for_summarization": False
        }

# --- Logica di Routing dell'Agente MCP ---
def should_continue_mcp(state: MCPAgentState) -> str:
    """
    Decide il prossimo nodo da eseguire nel grafo dell'agente MCP.
    """
    current_step = state.get("current_mcp_step", "")
    error_message = state.get("error") # Usiamo direttamente il messaggio di errore per il controllo
    print(f"🚦 MCP Agent: Routing logic from step: '{current_step}', error: '{error_message}'")

    # Gestione centralizzata degli errori: se c'è un errore e non siamo già nell'handler, vai all'handler.
    # Escludiamo "mcp_error_handled" per evitare loop se l'error handler stesso causasse un errore (improbabile ma sicuro).
    if error_message and current_step not in ["mcp_error_handled", "error_handler_mcp"]: # Aggiunto "error_handler_mcp" per sicurezza
        # Log specific error steps that lead here
        print(f"⚠️ MCP Agent: Error '{error_message}' at step '{current_step}'. Routing to error_handler_mcp.")
        # Non è necessario mappare ogni singolo step di errore qui, l'handler è generico.
        # Gli step di errore specifici (es. "error_loading_tools") sono informativi nello stato.
        return "error_handler_mcp"

    # Flusso normale
    if current_step == "initial_mcp": # Step iniziale per caricare gli strumenti
        return "load_mcp_tools"
    elif current_step == "tools_loaded":
        return "route_query"
    elif current_step == "mcp_tool_selected":
        return "process_mcp_request"
    elif current_step == "invoke_general_directly": # Dopo la route_query, se si va al general
        return "invoke_general_agent"
    elif current_step == "mcp_request_processed_summarize": # Dopo process_mcp_request, per la sumarizzazione
        return "invoke_general_agent"
    elif current_step == "general_agent_invoked": # Dopo l'invocazione del general_agent (diretta o per sumarizzazione)
        return END
    elif current_step == "mcp_error_handled": # Dopo che l'error handler ha gestito l'errore
        return END

    # Fallback per stati non riconosciuti (dovrebbe indicare un errore di logica nel grafo o nello stato)
    else:
        print(f"⚠️ MCP Agent: Unknown or unhandled step '{current_step}'. Routing to error handler as a precaution.")
        # Imposta un errore generico se non già presente, per assicurare che l'error handler sia invocato correttamente.
        if not error_message:
            state["error"] = f"Stato imprevisto o non gestito nell'agente MCP: {current_step}"
        return "error_handler_mcp"

# --- Creazione del Grafo dell'Agente MCP ---
def create_mcp_agent_graph() -> StateGraph:
    """
    Crea e configura il grafo dell'agente MCP.
    """
    workflow = StateGraph(MCPAgentState)

    # Aggiungi i nuovi nodi e quelli esistenti
    workflow.add_node("load_mcp_tools", load_mcp_tools_node)
    workflow.add_node("route_query", route_query_node)
    workflow.add_node("process_mcp_request", process_mcp_request_node)
    workflow.add_node("invoke_general_agent", invoke_general_agent_node)
    workflow.add_node("error_handler_mcp", mcp_error_node)

    # Definisci il nuovo punto di ingresso
    workflow.set_entry_point("load_mcp_tools")

    # Definizione degli archi condizionali e diretti

    # Da load_mcp_tools: va a route_query o a error_handler_mcp
    workflow.add_conditional_edges(
        "load_mcp_tools",
        should_continue_mcp,
        {
            "route_query": "route_query",
            "error_handler_mcp": "error_handler_mcp"
            # END non dovrebbe essere una destinazione da qui
        }
    )

    # Da route_query: va a process_mcp_request, invoke_general_agent, o error_handler_mcp
    workflow.add_conditional_edges(
        "route_query",
        should_continue_mcp,
        {
            "process_mcp_request": "process_mcp_request",
            "invoke_general_agent": "invoke_general_agent", # Per invoke_general_directly
            "error_handler_mcp": "error_handler_mcp"
            # END non dovrebbe essere una destinazione da qui
        }
    )

    # Da process_mcp_request: va a invoke_general_agent (per summarize) o error_handler_mcp
    workflow.add_conditional_edges(
        "process_mcp_request",
        should_continue_mcp,
        {
            "invoke_general_agent": "invoke_general_agent", # Per mcp_request_processed_summarize
            "error_handler_mcp": "error_handler_mcp"
            # END non dovrebbe essere una destinazione da qui
        }
    )

    # Da invoke_general_agent: va a END o error_handler_mcp
    workflow.add_conditional_edges(
        "invoke_general_agent",
        should_continue_mcp,
        {
            END: END, # general_agent_invoked porta a END
            "error_handler_mcp": "error_handler_mcp"
        }
    )
    
    # Arco dall'error_handler_mcp a END
    workflow.add_edge("error_handler_mcp", END)
    
    return workflow

# Compila il grafo MCP (opzionale qui, può essere fatto in run_mcp_agent o globalmente)
# mcp_agent_graph = create_mcp_agent_graph().compile()

# --- Esecuzione e Interfaccia per l'Agente MCP (ora agisce come un mini-orchestratore) ---
async def run_mcp_agent(user_input: str, thread_id: Optional[str] = None) -> Optional[str]: # Modificato tipo di ritorno
    """
    Esegue il flusso completo dell'agente MCP a partire da una query utente.
    Questo ora include il caricamento degli strumenti, il routing, l'esecuzione MCP (se scelto),
    e l'eventuale invocazione del general_agent.
    Restituisce la stringa del risultato finale.
    """
    print(f"🏃 MCP Agent: Running with user_input: '{user_input[:200]}...' and thread_id: {thread_id}")

    initial_messages = [HumanMessage(content=user_input)]

    initial_state = MCPAgentState(
        messages=initial_messages,
        user_query=user_input, # Imposta la user_query
        task_details=None, # Non più passato direttamente
        mcp_tools_registry=None, # Sarà popolato da load_mcp_tools_node
        selected_tool_details=None, # Sarà popolato da route_query_node
        mcp_server_response=None,
        final_result=None,
        error=None,
        invoke_general_agent_directly=False,
        invoke_general_agent_for_summarization=False,
        current_mcp_step="initial_mcp" # Nuovo step iniziale per caricare gli strumenti
    )

    # Compila il grafo se non è già stato globalmente o se si preferisce una compilazione per esecuzione
    # In un'applicazione più grande, potresti volerlo fare una volta all'avvio.
    # Per semplicità, assumiamo che sia compilato una volta e importato o definito globalmente.
    # Se si usa un checkpointer, la configurazione va qui.
    
    # Ottieni il grafo compilato (potrebbe essere definito globalmente o importato)
    # Per ora, lo creiamo e compiliamo qui per assicurarci che sia disponibile.
    mcp_graph_definition = create_mcp_agent_graph()
    
    # Considera l'uso di un checkpointer se la persistenza dello stato è necessaria.
    # from langgraph.checkpoint.aiosqlite import AsyncSqliteSaver
    # memory_mcp = AsyncSqliteSaver.sqlite(":memory:") # o un file db persistente
    # compiled_mcp_graph = mcp_graph_definition.compile(checkpointer=memory_mcp)
    compiled_mcp_graph = mcp_graph_definition.compile() # Senza checkpointer per ora

    config = {}
    if thread_id:
        config = {"configurable": {"thread_id": thread_id}}

    print(f"📨 MCP Agent: Invoking graph with initial state: {initial_state} and config: {config}")
    
    final_state = await compiled_mcp_graph.ainvoke(initial_state, config=config) # config può essere vuoto
    
    print(f"🏁 MCP Agent: Graph execution finished. Final state: {final_state}")

    # Restituisci il risultato finale, che dovrebbe essere una stringa
    return final_state.get("final_result")


if __name__ == '__main__':
    # Esempio di esecuzione diretta per testare il nuovo flusso dell'agente MCP
    async def test_mcp_agent_new_flow():
        print("--- Test MCP Agent New Flow ---")
        
        # Queries di test
        test_queries = [
            "chi sono gli stagisti di mauden?", # Dovrebbe provare a usare MCP
            "Qual è il summary del modello 'alpha'?", # Dovrebbe provare a usare MCP
            "Raccontami una barzelletta", # Dovrebbe andare al general_agent direttamente
            "Qualcosa che sicuramente non è un tool MCP", # Dovrebbe andare al general_agent
            # Aggiungi qui una query che potrebbe causare un errore nel tool MCP, se ne hai uno fittizio
            # che può fallire, per testare il percorso di errore e sumarizzazione dell'errore.
        ]

        # Per testare, assicurati che mcp_utils.get_all_mcp_tools() possa restituire
        # strumenti fittizi o reali, altrimenti il registry sarà vuoto e andrà sempre al general_agent.
        # Puoi mockare get_all_mcp_tools o configurare mcp_servers.json con tool di test.

        # Esempio di come mockare get_all_mcp_tools se necessario per il test:
        # (Questo è solo un esempio, dovresti adattarlo o assicurarti che i tuoi tool siano caricabili)
        # original_get_all_mcp_tools = get_all_mcp_tools
        # async def mock_get_tools():
        #     from langchain_core.tools import Tool
        #     def dummy_func_stagisti(query: str): return f"Risposta dummy stagisti per '{query}'"
        #     def dummy_func_summary(model_name: str): return f"Risposta dummy summary per '{model_name}'"
        #     return [
        #         Tool(name="get_mauden_interns", func=dummy_func_stagisti, description="Ottieni informazioni sugli stagisti di Mauden"),
        #         Tool(name="get_model_summary", func=dummy_func_summary, description="Ottieni il sommario di un modello AI specificato con 'model_name'")
        #     ]
        # import mcp_utils # Assicurati sia importato
        # mcp_utils.get_all_mcp_tools = mock_get_tools # Sovrascrivi temporaneamente

        for i, query in enumerate(test_queries):
            print(f"\n--- Query {i+1}: \"{query}\" ---")
            # Genera un thread_id univoco per ogni query di test per isolare gli stati se usi un checkpointer
            test_thread_id = f"mcp_test_thread_{i}_{os.urandom(2).hex()}"

            final_result_string = await run_mcp_agent(query, thread_id=test_thread_id)

            print(f"\n--- Risultato Finale Stringa per Query {i+1} ---")
            print(final_result_string)
            print("------------------------------------")

        # Ripristina la funzione originale se l'hai mockata
        # mcp_utils.get_all_mcp_tools = original_get_all_mcp_tools


    asyncio.run(test_mcp_agent_new_flow())
