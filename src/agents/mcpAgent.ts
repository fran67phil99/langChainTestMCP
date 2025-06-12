import {
import {
  HumanMessage,
  AIMessage,
  BaseMessage,
  SystemMessage, // Added
} from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai'; // Added
import { StateGraph, END } from '@langchain/langgraph'; // Added
// McpDynamicTool is essentially DynamicTool, which is a type of Tool.
// If specific Tool class features are needed beyond DynamicTool, import Tool from "@langchain/core/tools";
import { MCPAgentState, McpDynamicTool } from '../types'; // Import the state and tool type
import { getAllMcpTools } from '../utils/mcpUtils'; // Added
import { runGeneralAgent } from './generalAgent'; // Added (assuming runGeneralAgent is the entry point)
import * as fs from 'fs/promises'; // For potential file operations, if needed for mocks
import * as path from 'path'; // For potential path operations

// --- Global Variables and LLM Initialization (similar to Python version) ---
let mcpToolsRegistryCache: McpDynamicTool[] = [];
let mcpToolsRegistryLock: Promise<void> | null = null; // Simple lock for async operations

function getLlm(): ChatOpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    throw new Error(
      '⚠️ OPENAI_API_KEY non configurata! Aggiorna il file .env con la tua chiave API OpenAI.',
    );
  }
  return new ChatOpenAI({
    modelName: 'gpt-4o-mini', // Consider making this configurable
    temperature: 0.7,      // Consider making this configurable
    apiKey: apiKey,
  });
}

// --- Agent Nodes ---

async function loadMcpToolsNode(state: MCPAgentState): Promise<Partial<MCPAgentState>> {
  console.log('🛠️ MCP Agent: Loading MCP tools if needed...');

  if (mcpToolsRegistryLock) {
    console.log('🛠️ MCP Agent: Waiting for existing tool loading operation to complete...');
    await mcpToolsRegistryLock;
  }

  let resolveLock: () => void;
  mcpToolsRegistryLock = new Promise(resolve => {
    resolveLock = resolve;
  });

  try {
    if (mcpToolsRegistryCache.length === 0) {
      console.log('🛠️ MCP Agent: MCP tools cache is empty. Attempting to load tools via mcpUtils...');
      try {
        // Simple timeout mechanism for the tool loading
        const timeoutPromise = new Promise<McpDynamicTool[]>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout during MCP tools loading (30s)')), 30000)
        );
        const newlyLoadedTools = await Promise.race([getAllMcpTools(), timeoutPromise]);

        mcpToolsRegistryCache = newlyLoadedTools;

        if (!mcpToolsRegistryCache || mcpToolsRegistryCache.length === 0) {
          console.warn('⚠️ MCP Agent: MCP tools registry is empty after loading attempt.');
          return {
            ...state,
            mcpToolsRegistry: [],
            error: 'MCP tools registry is empty after loading.',
            currentMcpStep: 'error_loading_tools',
          };
        }
        console.log(`✅ MCP Agent: MCP tools registry loaded with ${mcpToolsRegistryCache.length} tools.`);
      } catch (e: any) {
        console.error(`❌ MCP Agent: Exception during MCP tools loading: ${e.message}`, e);
        mcpToolsRegistryCache = []; // Ensure cache is empty on error
        return {
          ...state,
          mcpToolsRegistry: [],
          error: `Exception during MCP tools loading: ${e.message}`,
          currentMcpStep: 'error_loading_tools',
        };
      }
    } else {
      console.log('🛠️ MCP Agent: Using cached MCP tools registry.');
    }

    return {
      ...state,
      mcpToolsRegistry: [...mcpToolsRegistryCache], // Return a copy
      currentMcpStep: 'tools_loaded',
      error: undefined,
    };
  } finally {
    resolveLock!(); // Release the lock
    mcpToolsRegistryLock = null; // Clear the lock promise
  }
}

async function routeQueryNode(state: MCPAgentState): Promise<Partial<MCPAgentState>> {
  console.log('🚦 MCP Agent: Routing user query...');
  const { userQuery, mcpToolsRegistry } = state;

  if (!userQuery) {
    console.error('❌ MCP Agent: No user query provided for routing.');
    return {
      error: 'User query is missing.',
      currentMcpStep: 'error_routing_query',
    };
  }

  if (!mcpToolsRegistry || mcpToolsRegistry.length === 0) {
    console.info('ℹ️ MCP Agent: No MCP tools loaded. Routing to general agent directly.');
    return {
      invokeGeneralAgentDirectly: true,
      currentMcpStep: 'invoke_general_directly',
      error: undefined,
    };
  }

  console.log(`🧠 MCP Agent: Attempting to select MCP tool for query: '${userQuery.substring(0, 100)}...'`);
  const llm = getLlm();

  const toolsDescriptionForPrompt = mcpToolsRegistry
    .map(tool => `- Nome: ${tool.name}, Descrizione: ${tool.description}`)
    .join('\n');

  const promptMessages = [
    new SystemMessage(
      `Sei un assistente AI che deve selezionare lo strumento più appropriato da una lista per rispondere alla richiesta dell'utente.
La tua risposta DEVE essere un oggetto JSON con la chiave 'selected_tool_name' contenente il nome esatto dello strumento scelto, oppure 'none' se nessuno strumento è adatto.
Se uno strumento è adatto, includi anche una chiave 'extracted_params' che è un dizionario di parametri estratti dalla query utente necessari per lo strumento (può essere vuoto {} se non servono parametri o non sono estraibili).
Non aggiungere alcuna spiegazione al di fuori dell'oggetto JSON.

Strumenti disponibili:
${toolsDescriptionForPrompt}`,
    ),
    new HumanMessage(`Richiesta Utente: "${userQuery}"`),
  ];

  try {
    const aiResponse = await llm.invoke(promptMessages);
    let llmOutputContent = aiResponse.content as string; // Assuming content is string
    console.log(`🤖 LLM response for tool selection in MCP Agent: ${llmOutputContent}`);

    // Clean potential markdown code block
    if (llmOutputContent.startsWith('```json')) {
      llmOutputContent = llmOutputContent.substring(7);
      if (llmOutputContent.endsWith('```')) {
        llmOutputContent = llmOutputContent.slice(0, -3);
      }
    } else if (llmOutputContent.startsWith('```')) {
      llmOutputContent = llmOutputContent.substring(3);
      if (llmOutputContent.endsWith('```')) {
        llmOutputContent = llmOutputContent.slice(0, -3);
      }
    }
    llmOutputContent = llmOutputContent.trim();

    try {
      const llmChoice = JSON.parse(llmOutputContent);
      const selectedToolName = llmChoice.selected_tool_name;
      let extractedParams = llmChoice.extracted_params || {};

      if (typeof extractedParams !== 'object' || Array.isArray(extractedParams)) {
        console.warn(`⚠️ MCP Agent: 'extracted_params' from LLM is not a dictionary: ${JSON.stringify(extractedParams)}. Defaulting to empty dict.`);
        extractedParams = {};
      }

      if (selectedToolName && selectedToolName !== 'none') {
        const chosenTool = mcpToolsRegistry.find(tool => tool.name === selectedToolName);
        if (chosenTool) {
          console.log(`✅ MCP Agent: LLM selected MCP tool: ${chosenTool.name} with params:`, extractedParams);
          return {
            selectedToolDetails: { toolToInvoke: chosenTool, toolParams: extractedParams },
            currentMcpStep: 'mcp_tool_selected',
            invokeGeneralAgentDirectly: false,
            error: undefined,
          };
        } else {
          console.warn(`⚠️ MCP Agent: LLM selected tool '${selectedToolName}' but it was not found in the registry. Routing to general agent.`);
        }
      } else {
        console.info('ℹ️ MCP Agent: LLM decided no MCP tool is suitable. Routing to general agent.');
      }
    } catch (jsonError: any) {
      console.error(`❌ MCP Agent: Error decoding JSON from LLM for tool selection: ${jsonError.message}`);
      console.error(`   LLM raw content was: ${aiResponse.content}`);
      // Fallback to general agent
    }
  } catch (llmError: any) {
    console.error(`❌ MCP Agent: Error invoking LLM for tool selection: ${llmError.message}`);
    // Fallback to general agent
  }

  // Default action if MCP tool not selected or error occurred
  return {
    invokeGeneralAgentDirectly: true,
    currentMcpStep: 'invoke_general_directly',
    selectedToolDetails: undefined,
    error: state.error, // Preserve previous error if any, or set new if one occurred here
  };
}

async function invokeGeneralAgentNode(state: MCPAgentState): Promise<Partial<MCPAgentState>> {
  console.log('🔄 MCP Agent: Invoking General Agent Node...');
  const {
    userQuery,
    mcpServerResponse,
    invokeGeneralAgentDirectly,
    invokeGeneralAgentForSummarization
  } = state;

  let generalAgentInputMessages: BaseMessage[] = [];
  let errorMessage: string | undefined = undefined;
  let agentResponseContent: string | undefined = undefined;

  if (invokeGeneralAgentDirectly) {
    if (!userQuery) {
      errorMessage = 'User query is missing for direct general agent invocation.';
      console.error(`❌ MCP Agent: ${errorMessage}`);
    } else {
      console.log(`🗣️ MCP Agent: Calling General Agent directly with query: '${userQuery.substring(0, 100)}...'`);
      generalAgentInputMessages = [new HumanMessage(userQuery)];
    }
  } else if (invokeGeneralAgentForSummarization) {
    if (!mcpServerResponse || !userQuery) {
      errorMessage = 'MCP server response or user query is missing for summarization.';
      console.error(`❌ MCP Agent: ${errorMessage}`);
    } else {
      console.log(`🗣️ MCP Agent: Calling General Agent for summarization of MCP data related to query: '${userQuery.substring(0, 100)}...'`);
      const summarizationPromptContent = JSON.stringify({
        action: 'summarize_mcp_data', // Action that general_agent should recognize
        original_query: userQuery,
        mcp_data: mcpServerResponse,
      });
      generalAgentInputMessages = [new HumanMessage(summarizationPromptContent)];
    }
  } else {
    errorMessage = 'Nessuna condizione valida per invocare il general_agent.';
    console.warn(`⚠️ MCP Agent: ${errorMessage}. Neither invokeGeneralAgentDirectly nor invokeGeneralAgentForSummarization is true.`);
  }

  if (errorMessage) {
    return {
      error: errorMessage,
      currentMcpStep: 'error_invoking_general_agent',
      finalResult: `Error before invoking general agent: ${errorMessage}`,
    };
  }

  if (generalAgentInputMessages.length === 0) {
    const emptyInputError = 'Input messages for general agent are empty, likely due to missing query/data.';
    console.error(`❌ MCP Agent: ${emptyInputError}`);
    return {
      error: emptyInputError,
      currentMcpStep: 'error_invoking_general_agent',
      finalResult: 'Could not prepare input for general agent.',
    };
  }

  try {
    console.log(`📨 MCP Agent: Sending to general_agent: ${generalAgentInputMessages[0].content.substring(0,200)}...`);
    // Assuming runGeneralAgent returns a state object similar to Python's general_agent
    // And that it contains a 'result' or 'final_response' field or extracts from messages.
    // For now, let's assume runGeneralAgent is adapted to return the GeneralAgentState,
    // from which we extract the final AI message or a 'result' field.
    const generalAgentResultState = await runGeneralAgent(generalAgentInputMessages, state.threadId); // Pass threadId if available in state

    if (generalAgentResultState?.messages) {
      const lastMessage = generalAgentResultState.messages[generalAgentResultState.messages.length - 1];
      if (lastMessage instanceof AIMessage) {
        agentResponseContent = lastMessage.content as string;
      }
    }
    // Fallback or primary way if generalAgentResultState has a 'result' field
    if (!agentResponseContent && generalAgentResultState?.result) {
        agentResponseContent = generalAgentResultState.result;
    }

    if (!agentResponseContent) {
      agentResponseContent = 'Il General Agent non ha fornito una risposta valida.';
      console.warn(`⚠️ MCP Agent: ${agentResponseContent}`);
    }

    console.log(`💬 MCP Agent: General Agent response: '${agentResponseContent.substring(0, 200)}...'`);
    return {
      finalResult: agentResponseContent,
      currentMcpStep: 'general_agent_invoked',
      error: undefined,
      invokeGeneralAgentDirectly: false, // Reset flags
      invokeGeneralAgentForSummarization: false,
    };
  } catch (e: any) {
    const errorMsg = `Errore durante l'invocazione del General Agent: ${e.message}`;
    console.error(`❌ MCP Agent: ${errorMsg}`, e);
    return {
      error: errorMsg,
      finalResult: `Fallimento nell'ottenere una risposta dal General Agent: ${errorMsg}`,
      currentMcpStep: 'error_invoking_general_agent',
      invokeGeneralAgentDirectly: false, // Reset flags
      invokeGeneralAgentForSummarization: false,
    };
  }
}

// Existing processMcpRequestNode will be modified later.
// For now, let's keep it to avoid breaking the file structure immediately.
async function processMcpRequestNode(
  state: MCPAgentState,
): Promise<Partial<MCPAgentState>> {
  console.log('⚙️ MCP Agent: Processing MCP request (from selectedToolDetails)...');
  const { selectedToolDetails } = state;

  if (!selectedToolDetails || !selectedToolDetails.toolToInvoke) {
    const errorMsg = 'Nessun dettaglio del tool selezionato fornito o tool_to_invoke mancante.';
    console.error(`❌ MCP Agent: ${errorMsg}`);
    return {
      error: errorMsg,
      currentMcpStep: 'error_processing_request', // Generic error for this phase
      // finalResult will be set by error handler or subsequent nodes if error occurs
    };
  }

  const { toolToInvoke, toolParams } = selectedToolDetails;
  console.log(
    `📦 MCP Agent: Attempting to invoke tool: ${toolToInvoke.name} with params:`,
    toolParams,
  );

  try {
    // The func in DynamicTool is expected to be async and return a string.
    const rawMcpResponseData = await toolToInvoke.call(toolParams);

    // Attempt to parse the raw response data if it's a JSON string.
    // The tool's func in mcpUtils is designed to return JSON.stringify(data) or JSON.stringify(error)
    let parsedResponseData;
    try {
        parsedResponseData = JSON.parse(rawMcpResponseData);
    } catch (e) {
        // If parsing fails, it might be a plain string (e.g. from a simple SSE message) or an unintended format.
        console.warn(`MCP Agent: Tool '${toolToInvoke.name}' response was not valid JSON. Using raw string. Response: ${rawMcpResponseData.substring(0,100)}...`);
        parsedResponseData = rawMcpResponseData;
    }

    console.log(
      `✅ MCP Agent: Tool '${toolToInvoke.name}' invoked successfully. Parsed response (first 100 chars): ${JSON.stringify(parsedResponseData).substring(0,100)}...`,
    );

    // Check if the parsed response indicates an error from the tool itself
    if (typeof parsedResponseData === 'object' && parsedResponseData !== null && parsedResponseData.error) {
        const toolErrorMsg = `Tool '${toolToInvoke.name}' returned an error: ${parsedResponseData.details || parsedResponseData.error}`;
        console.error(`❌ MCP Agent: ${toolErrorMsg}`);
        return {
            messages: [
                ...(state.messages || []),
                new AIMessage(`Tool ${toolToInvoke.name} execution failed. Error: ${parsedResponseData.details || parsedResponseData.error}`),
            ],
            mcpServerResponse: parsedResponseData, // Store the structured error from the tool
            error: toolErrorMsg, // Set a descriptive error message for the agent's state
            currentMcpStep: 'error_invoking_tool', // Consistent error step
            // finalResult is not set here, error handler or summarizer will deal with it
        };
    }

    // Success case
    console.log(`✅ MCP Agent: Tool '${toolToInvoke.name}' invoked successfully. Raw data stored for summarization.`);
    return {
      messages: [
        ...(state.messages || []),
        new AIMessage(`Tool ${toolToInvoke.name} executed successfully. Raw data stored.`),
      ],
      mcpServerResponse: parsedResponseData, // Store the actual data for summarization
      invokeGeneralAgentForSummarization: true, // Set for the next step
      currentMcpStep: 'mcp_request_processed_summarize', // New step
      error: undefined,
      finalResult: undefined, // finalResult will be set by the general agent node
    };
  } catch (e: any) {
    const errorMsg = `Errore durante l'invocazione dello strumento '${toolToInvoke.name}': ${e.message}`;
    console.error(`❌ MCP Agent: ${errorMsg}`, e);
    // Log stack trace for more details on the error
    // console.error(e.stack);
    return {
      error: errorMsg,
      currentMcpStep: 'error_invoking_tool',
      // finalResult is not set here, error handler will deal with it
    };
  }
}

async function mcpErrorNode(
  state: MCPAgentState,
): Promise<Partial<MCPAgentState>> {
  const errorMsg = state.error || 'Errore sconosciuto nell\'agente MCP';
  console.log(`❌ MCP Agent Error Handler: ${errorMsg}`);
  const userFriendlyError = `Si è verificato un problema nell'agente MCP: ${errorMsg}`;

  return {
    messages: [
      ...(state.messages || []),
      new AIMessage(userFriendlyError),
    ],
    // Ensure finalResult is a user-friendly string.
    // If state.finalResult is already set (e.g., by a failing node that still produced some output),
    // we might prefer to use that, but typically for an error path, we override with the error.
    finalResult: userFriendlyError,
    currentMcpStep: 'mcp_error_handled',
    // error field (state.error) is already set and propagated
  };
}

// --- Graph Logic ---

function shouldContinueMcp(state: MCPAgentState): string {
  const currentStep = state.currentMcpStep;
  const hasError = !!state.error; // Convert error string to boolean

  console.log(`🚦 MCP Agent: Routing logic from step: '${currentStep}', error: '${state.error}'`);

  if (hasError && currentStep !== 'mcp_error_handled' && currentStep !== 'error_handler_mcp') {
    console.warn(`⚠️ MCP Agent: Error '${state.error}' at step '${currentStep}'. Routing to error_handler_mcp.`);
    return 'error_handler_mcp';
  }

  switch (currentStep) {
    case 'initial_mcp': // Initial step for the new flow
      return 'load_mcp_tools';
    case 'tools_loaded':
      return 'route_query';
    case 'mcp_tool_selected':
      return 'process_mcp_request';
    case 'invoke_general_directly': // After route_query, if going to general agent
      return 'invoke_general_agent';
    case 'mcp_request_processed_summarize': // After process_mcp_request, for summarization
      return 'invoke_general_agent';
    case 'general_agent_invoked': // After general_agent invocation
      return END;
    case 'mcp_error_handled': // After error handler has processed the error
      return END;
    case 'error_loading_tools': // Specific error steps can also be explicitly routed if needed, but caught by hasError too
    case 'error_routing_query':
    case 'error_processing_request':
    case 'error_invoking_tool':
    case 'error_invoking_general_agent':
        // These are error states; the generic error check above should route them.
        // If not already routed by the generic check (e.g. error was cleared but step remains an error step), force to error handler.
        console.warn(` MCP Agent: Explicit error step '${currentStep}' encountered. Routing to error_handler_mcp.`);
        return 'error_handler_mcp';
    default:
      console.warn(`⚠️ MCP Agent: Unknown or unhandled step '${currentStep}'. Routing to error handler as a precaution.`);
      // Ensure an error is set in state if we reach here unexpectedly.
      // Note: Modifying state in a conditional edge function is not ideal.
      // This should ideally be handled by the node that produced the unknown step.
      // However, as a safeguard:
      if (!hasError) {
          // This part of the logic is tricky in TS LangGraph as direct state modification
          // in conditional functions is discouraged. The node itself should set an error.
          // For now, we rely on nodes setting errors appropriately.
          console.error("  Critical: Unhandled step with no error set. Graph logic might be flawed.");
      }
      return 'error_handler_mcp';
  }
}

function createMcpAgentGraph(): StateGraph<MCPAgentState> {
  const workflow = new StateGraph<MCPAgentState>({
    channels: {
      // Define channels for MCPAgentState fields.
      // This is the new way in LangGraph.js to define the state schema.
      // Each key in MCPAgentState must be a channel.
      messages: { value: (x, y) => (x && y ? x.concat(y) : x ?? y ?? []), default: () => [] },
      taskDetails: { value: (x,y) => y ?? x, default: () => undefined }, // Not used in new flow directly
      userQuery: { value: (x,y) => y ?? x, default: () => "" },
      mcpToolsRegistry: { value: (x,y) => y ?? x, default: () => [] },
      selectedToolDetails: { value: (x,y) => y ?? x, default: () => undefined },
      mcpServerResponse: { value: (x,y) => y ?? x, default: () => undefined },
      finalResult: { value: (x,y) => y ?? x, default: () => undefined },
      error: { value: (x,y) => y ?? x, default: () => undefined },
      currentMcpStep: { value: (x,y) => y ?? x, default: () => "initial_mcp" },
      invokeGeneralAgentForSummarization: { value: (x,y) => y ?? x, default: () => false },
      invokeGeneralAgentDirectly: { value: (x,y) => y ?? x, default: () => false },
      threadId: { value: (x,y) => y ?? x, default: () => undefined } // Added threadId to state schema
    }
  });

  // Add nodes
  workflow.addNode('load_mcp_tools', loadMcpToolsNode);
  workflow.addNode('route_query', routeQueryNode);
  workflow.addNode('process_mcp_request', processMcpRequestNode);
  workflow.addNode('invoke_general_agent', invokeGeneralAgentNode);
  workflow.addNode('error_handler_mcp', mcpErrorNode);

  // Set entry point
  workflow.setEntryPoint('load_mcp_tools');

  // Add conditional edges
  workflow.addConditionalEdges('load_mcp_tools', shouldContinueMcp, {
    route_query: 'route_query',
    error_handler_mcp: 'error_handler_mcp',
  });

  workflow.addConditionalEdges('route_query', shouldContinueMcp, {
    process_mcp_request: 'process_mcp_request',
    invoke_general_agent: 'invoke_general_agent',
    error_handler_mcp: 'error_handler_mcp',
  });

  workflow.addConditionalEdges('process_mcp_request', shouldContinueMcp, {
    invoke_general_agent: 'invoke_general_agent',
    error_handler_mcp: 'error_handler_mcp',
  });

  workflow.addConditionalEdges('invoke_general_agent', shouldContinueMcp, {
    [END]: END,
    error_handler_mcp: 'error_handler_mcp',
  });

  // Add edge from error handler to END
  workflow.addEdge('error_handler_mcp', END);

  return workflow;
}

// Compile the graph once
const mcpAgentGraph = createMcpAgentGraph().compile();

export async function runMcpAgent(
  userInput: string, // Changed from taskDetails
  threadId?: string,
): Promise<string | undefined> { // Return type changed to final string or undefined
  console.log(
    `🏃 MCP Agent: Running with user input: "${userInput.substring(0,100)}..." and thread_id: ${threadId}`,
  );

  const initialMessages: BaseMessage[] = [new HumanMessage(userInput)];

  const initialState: MCPAgentState = {
    messages: initialMessages,
    userQuery: userInput, // Set userQuery from input
    taskDetails: undefined, // No longer passed directly
    mcpToolsRegistry: [],   // Will be populated by loadMcpToolsNode
    selectedToolDetails: undefined, // Will be populated by routeQueryNode
    mcpServerResponse: undefined,
    finalResult: undefined,
    error: undefined,
    invokeGeneralAgentDirectly: false,
    invokeGeneralAgentForSummarization: false,
    currentMcpStep: 'initial_mcp', // Starting step for the new graph flow
    threadId: threadId, // Store threadId in state
  };

  console.log('📨 MCP Agent: Invoking graph with initial state:', initialState);

  const config = threadId ? { configurable: { thread_id: threadId } } : {};

  try {
    const finalState = await mcpAgentGraph.invoke(initialState, config);
    console.log('🏁 MCP Agent: Graph execution finished. Final state:', finalState);
    return finalState.finalResult;
  } catch (e:any) {
    console.error(`❌ MCP Agent: Critical error during graph invocation: ${e.message}`, e);
    return `Si è verificato un errore critico nell'agente MCP: ${e.message}`;
  }
}

// Example Usage (for testing this file directly)
// This requires mcpUtils to be working and providing mock tools,
// and generalAgent.ts to be runnable.
async function testMcpAgentNewFlow() {
    console.log("--- Test MCP Agent New Flow ---");

    const testQueries = [
        "chi sono gli stagisti di mauden?", // Should try to use MCP
        "Qual è il summary del modello 'alpha'?", // Should try to use MCP
        "Raccontami una barzelletta", // Should go to general_agent directly
        "Traduci 'hello world' in italiano", // Should use general_agent for translation via special task
        "Qualcosa che sicuramente non è un tool MCP", // Should go to general_agent
    ];

    // Ensure necessary env vars for getLlm and potentially mcpUtils/generalAgent
    // For example, OPENAI_API_KEY must be set in .env
    // process.env.OPENAI_API_KEY = "sk-..."; // Or ensure it's in .env

    // Mocking getAllMcpTools for testing if mcpUtils is not fully set up for direct run:
    // (This is more involved in TS due to module caching, but for concept:)
    // import * as mcpUtils from '../utils/mcpUtils';
    // const originalGetAllMcpTools = mcpUtils.getAllMcpTools;
    // (mcpUtils as any).getAllMcpTools = async () => {
    //   console.log("Using MOCKED getAllMcpTools for testMcpAgentNewFlow");
    //   return [
    //     new DynamicTool({ name: "get_mauden_interns_mcp", description: "Ottieni informazioni sugli stagisti di Mauden", func: async (q) => JSON.stringify({interns: ["Alice", "Bob"]})}),
    //     new DynamicTool({ name: "get_model_summary_mcp", description: "Ottieni il sommario di un modello AI specificato con 'model_name'", func: async (p) => JSON.stringify({summary: `Summary for ${(p as any).model_name}`})}),
    //   ];
    // };


    for (let i = 0; i < testQueries.length; i++) {
        const query = testQueries[i];
        console.log(`\n--- Query ${i + 1}: "${query}" ---`);
        const testThreadId = `mcp_test_thread_new_${i}_${Date.now()}`;

        try {
            const finalResultString = await runMcpAgent(query, testThreadId);
            console.log(`\n--- Risultato Finale Stringa per Query ${i + 1} ---`);
            console.log(finalResultString);
        } catch (error: any) {
            console.error(`\n--- Errore durante il test della Query ${i + 1} ---`);
            console.error(error.message);
        }
        console.log("------------------------------------");
    }

    // Restore mocks if any
    // (mcpUtils as any).getAllMcpTools = originalGetAllMcpTools;
}

// Uncomment to run test when executing this file directly:
// if (require.main === module) { // In Node.js environment
//   (async () => {
//     require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }); // Load .env from root

//     // Ensure OPENAI_API_KEY is loaded for getLlm()
//     if (!process.env.OPENAI_API_KEY) {
//       console.error("OPENAI_API_KEY is not set. Please set it in your .env file.");
//       process.exit(1);
//     }
//     // Mock or ensure MCP_BASE_URL if mcpUtils needs it for non-discovery mode
//     // if (!process.env.MCP_BASE_URL && process.env.MCP_ENABLE_DISCOVERY !== "true") {
//     //   process.env.MCP_BASE_URL = "http://localhost:8080"; // Example mock
//     //   console.warn("MCP_BASE_URL not set, using default mock for test if discovery is not enabled.");
//     // }
//     // if (process.env.MCP_ENABLE_DISCOVERY === undefined) {
//     //    process.env.MCP_ENABLE_DISCOVERY = "true"; // Default to discovery if not set
//     // }


//     await testMcpAgentNewFlow();
//   })().catch(e => {
//     console.error("Unhandled error in test execution:", e);
//     process.exit(1);
//   });
// }
