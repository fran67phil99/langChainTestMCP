import { ChatOpenAI } from '@langchain/openai';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  BaseMessage,
} from '@langchain/core/messages';
import { OrchestratorState, McpDynamicTool } from '../types';
import { getAllMcpTools } from '../utils/mcpUtils';
import { runGeneralAgent } from './generalAgent';
import { runMcpAgent } from './mcpAgent';

// Cache for MCP tools to avoid reloading them on every single request if not necessary.
// In a real server environment, this might be a more sophisticated cache.
let mcpToolsCache: McpDynamicTool[] | null = null;
let mcpToolsCacheTimestamp: number | null = null;
const MCP_TOOLS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getLlm() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    throw new Error('⚠️ OPENAI_API_KEY not configured!');
  }
  return new ChatOpenAI({ modelName: 'gpt-4o-mini', temperature: 0.7 });
}

// --- Orchestrator Nodes ---

async function loadMcpToolsNode(
  state: OrchestratorState,
): Promise<Partial<OrchestratorState>> {
  console.log('🛠️ Orchestrator: Loading MCP tools if needed...');
  try {
    const now = Date.now();
    if (!mcpToolsCache || !mcpToolsCacheTimestamp || (now - mcpToolsCacheTimestamp > MCP_TOOLS_CACHE_TTL)) {
        console.log('🛠️ Orchestrator: MCP tools cache is empty or expired. Fetching tools...');
        mcpToolsCache = await getAllMcpTools(); // from mcpUtils
        mcpToolsCacheTimestamp = now;
        console.log(`✅ Orchestrator: MCP tools registry loaded with ${mcpToolsCache.length} tools.`);
    } else {
        console.log('🛠️ Orchestrator: Using cached MCP tools registry.');
    }

    return {
      mcpToolsRegistry: mcpToolsCache || [],
      currentOrchestrationStep: 'mcp_tools_loaded',
      loadedMcpTools: true,
      error: undefined,
    };
  } catch (error: any) {
    console.error('❌ Orchestrator: Error loading MCP tools:', error);
    return {
      error: `Failed to load MCP tools: ${error.message}`,
      currentOrchestrationStep: 'error_loading_tools',
      loadedMcpTools: false,
    };
  }
}

async function routeTaskNode(
  state: OrchestratorState,
): Promise<Partial<OrchestratorState>> {
  console.log('🚦 Orchestrator: Routing task...');
  const { userQuery, mcpToolsRegistry } = state;

  if (!userQuery) {
    return {
      error: 'Nessun messaggio utente fornito per il routing.',
      currentOrchestrationStep: 'error_in_routing',
      selectedAgent: 'general_agent', // Default to general if no query
      taskDescriptionForSpecialist: { query: '' },
    };
  }

  if (!mcpToolsRegistry || mcpToolsRegistry.length === 0) {
    console.log('ℹ️ Orchestrator: No MCP tools available. Routing to general_agent.');
    return {
      selectedAgent: 'general_agent',
      taskDescriptionForSpecialist: { query: userQuery },
      currentOrchestrationStep: 'task_routed',
      error: undefined,
    };
  }

  const llm = getLlm();
  const toolsDescriptionForPrompt = mcpToolsRegistry
    .map(tool => `- Nome: ${tool.name}, Descrizione: ${tool.description}, Parametri: ${JSON.stringify(tool.lc_kwargs?.schema?.properties || tool.schema?.parameters || {})}`)
    .join('\n');

  // console.log("Tools description for LLM prompt:", toolsDescriptionForPrompt); // Debug

  const promptMessages = [
    new SystemMessage(
      `Sei un assistente AI che deve selezionare lo strumento più appropriato da una lista per rispondere alla richiesta dell'utente.
La tua risposta DEVE essere un oggetto JSON con la chiave 'selected_tool_name' contenente il nome esatto dello strumento scelto, oppure 'none' se nessuno strumento è adatto.
Se uno strumento è adatto, includi anche una chiave 'extracted_params' che è un dizionario di parametri estratti dalla query utente necessari per lo strumento (può essere vuoto {} se non servono parametri o non sono estraibili).
Non aggiungere alcuna spiegazione al di fuori dell'oggetto JSON.

Strumenti disponibili:
${toolsDescriptionForPrompt}
`),
    new HumanMessage(`Richiesta Utente: "${userQuery}"`),
  ];

  try {
    const aiResponse = await llm.invoke(promptMessages);
    let llmOutputContent = aiResponse.content.toString();
    console.log(`🤖 LLM response for tool selection: ${llmOutputContent}`);

    // Clean potential markdown code block
    if (llmOutputContent.startsWith("```json")) {
        llmOutputContent = llmOutputContent.substring(7, llmOutputContent.length - 3).trim();
    } else if (llmOutputContent.startsWith("```")) {
        llmOutputContent = llmOutputContent.substring(3, llmOutputContent.length - 3).trim();
    }

    const llmChoice = JSON.parse(llmOutputContent);
    const selectedToolName = llmChoice.selected_tool_name;
    const extractedParams = llmChoice.extracted_params || {};

    if (selectedToolName && selectedToolName !== 'none') {
      const chosenTool = mcpToolsRegistry.find(
        tool => tool.name === selectedToolName,
      );
      if (chosenTool) {
        console.log(`✅ Orchestrator: LLM selected MCP tool: ${chosenTool.name} with params:`, extractedParams);
        return {
          selectedAgent: 'mcp_agent',
          taskDescriptionForSpecialist: {
            toolToInvoke: chosenTool,
            toolParams: extractedParams,
            originalUserQuery: userQuery,
          },
          currentOrchestrationStep: 'task_routed',
          error: undefined,
        };
      } else {
        console.warn(`⚠️ Orchestrator: LLM selected tool '${selectedToolName}' not found in registry.`);
      }
    }
    console.log('ℹ️ Orchestrator: LLM decided no MCP tool is suitable. Routing to general_agent.');
  } catch (error: any) {
    console.error(`❌ Orchestrator: Error during LLM tool selection or parsing: ${error.message}`);
    // Fallback to general_agent on error
  }

  return {
    selectedAgent: 'general_agent',
    taskDescriptionForSpecialist: { query: userQuery },
    currentOrchestrationStep: 'task_routed',
    error: undefined, // Error handled by falling back
  };
}

async function invokeSpecialistNode(
  state: OrchestratorState,
): Promise<Partial<OrchestratorState>> {
  console.log(`🔄 Orchestrator: Invoking specialist: ${state.selectedAgent}`);
  const { selectedAgent, taskDescriptionForSpecialist, messages, threadId, userQuery } = state;

  try {
    if (selectedAgent === 'mcp_agent') {
      if (!taskDescriptionForSpecialist || !taskDescriptionForSpecialist.toolToInvoke) {
        throw new Error("Task description for mcp_agent is invalid.");
      }
      const mcpResult = await runMcpAgent(taskDescriptionForSpecialist, threadId);

      if (mcpResult.error) {
        console.error(`❌ Orchestrator: MCP Agent returned an error: ${mcpResult.error}`);
        // Let general agent try to explain the error or respond to original query
        const generalAgentInputForMcpError = [
            ...messages, // maintain history
            new HumanMessage(JSON.stringify({
                action: "summarize_mcp_data",
                original_query: taskDescriptionForSpecialist.originalUserQuery || userQuery,
                mcp_data: { error: mcpResult.error, mcp_response: mcpResult.mcpServerResponse }
            }))
        ];
        const generalAgentResponse = await runGeneralAgent(generalAgentInputForMcpError, threadId);
        return {
            mcpAgentResult: mcpResult, // Store error from MCP
            generalAgentResult: generalAgentResponse, // Store general agent's attempt to explain
            currentOrchestrationStep: 'specialist_invoked',
            error: mcpResult.error, // Propagate MCP error for logging, but general agent provides final response
        };
      }

      // MCP agent success, now pass to General Agent for summarization/conversation
      console.log('ℹ️ Orchestrator: MCP Agent successful. Passing to General Agent for summarization.');

      // The mcpAgent's finalResult is already a string (JSON.stringified data or error).
      // The mcpServerResponse is the parsed data.
      let dataToSummarize = mcpResult.mcpServerResponse;
      if (dataToSummarize === undefined) { // Fallback if mcpServerResponse is not populated
        try {
            dataToSummarize = mcpResult.finalResult ? JSON.parse(mcpResult.finalResult) : "No data from MCP tool.";
        } catch(e) {
            dataToSummarize = mcpResult.finalResult || "Received non-JSON data from MCP tool.";
        }
      }

      const summarizationInputToGeneralAgentMessages = [...messages];
      // Remove the last HumanMessage if it's the raw user query to avoid duplication before summarization request
      if (summarizationInputToGeneralAgentMessages.length > 0 && summarizationInputToGeneralAgentMessages[summarizationInputToGeneralAgentMessages.length-1].content === userQuery) {
        summarizationInputToGeneralAgentMessages.pop();
      }
      summarizationInputToGeneralAgentMessages.push(new HumanMessage(JSON.stringify({
          action: "summarize_mcp_data",
          original_query: taskDescriptionForSpecialist.originalUserQuery || userQuery,
          mcp_data: dataToSummarize
      })));


      const generalAgentSummary = await runGeneralAgent(summarizationInputToGeneralAgentMessages, threadId);
      return {
        mcpAgentResult: mcpResult,
        generalAgentResult: generalAgentSummary,
        currentOrchestrationStep: 'specialist_invoked',
        error: generalAgentSummary.error, // Error from summarization step
      };

    } else if (selectedAgent === 'general_agent') {
      // Ensure taskDescriptionForSpecialist.query is passed
      const queryForGeneral = taskDescriptionForSpecialist?.query || userQuery;
      const generalAgentInput = [...messages];
      // If the last message in history isn't the current query, add it.
      // This handles cases where routing defaults to general_agent without a specific query in taskDescription.
      // Or if the history was cleared/modified before this step.
      if (generalAgentInput.length === 0 || generalAgentInput[generalAgentInput.length-1].content !== queryForGeneral) {
         // Check if queryForGeneral is already in messages to avoid adding it again if it's an older message
        const queryAlreadyInHistory = generalAgentInput.some(msg => msg.content === queryForGeneral);
        if (!queryAlreadyInHistory) {
            generalAgentInput.push(new HumanMessage(queryForGeneral));
        } else if (generalAgentInput[generalAgentInput.length-1].content !== queryForGeneral) {
            // If query is in history but not the last one, it implies a complex conversation.
            // For simple direct Q&A via general agent, ensure it's the last one.
            // This logic might need refinement for more complex conversation flows.
            // For now, if it's not the last, we add it, assuming it's a new turn on an old topic.
             generalAgentInput.push(new HumanMessage(queryForGeneral));
        }
      }


      const generalResult = await runGeneralAgent(generalAgentInput, threadId);
      return {
        generalAgentResult: generalResult,
        currentOrchestrationStep: 'specialist_invoked',
        error: generalResult.error,
      };
    } else {
      throw new Error(`Agente specializzato sconosciuto: ${selectedAgent}`);
    }
  } catch (error: any) {
    console.error(`❌ Orchestrator: Error invoking specialist: ${error.message}`);
    return {
      error: `Failed to invoke specialist: ${error.message}`,
      currentOrchestrationStep: 'error_invoking_specialist',
    };
  }
}

async function compileResponseNode(
  state: OrchestratorState,
): Promise<Partial<OrchestratorState>> {
  console.log('📝 Orchestrator: Compiling final response...');
  let finalAns = "Mi dispiace, non sono riuscito a elaborare la tua richiesta.";
  let newMessages = state.generalAgentResult?.messages || [...state.messages]; // Start with messages from general agent if available

  if (state.generalAgentResult && state.generalAgentResult.result) {
    finalAns = state.generalAgentResult.result;
    // generalAgentResult.messages should ideally contain the full history including the new AI response.
    // If generalAgentResult.messages is not populated, we at least add its result as an AIMessage.
    if (!state.generalAgentResult.messages && state.messages.length > 0 && state.messages[state.messages.length-1].content !== finalAns) {
        newMessages.push(new AIMessage(finalAns));
    } else if (!state.generalAgentResult.messages) {
        newMessages = [...state.messages, new AIMessage(finalAns)];
    }
  } else if (state.error) { // Orchestrator or unhandled specialist error
    finalAns = `Si è verificato un errore: ${state.error}`;
    if (newMessages.length === 0 || newMessages[newMessages.length-1].content !== finalAns) {
        newMessages.push(new AIMessage(finalAns));
    }
  } else if(state.mcpAgentResult && state.mcpAgentResult.error && !state.generalAgentResult?.result) {
    // MCP agent had an error, and general agent didn't provide a summary/alternative
    finalAns = `Errore durante l'esecuzione dello strumento MCP: ${state.mcpAgentResult.error}`;
    if (newMessages.length === 0 || newMessages[newMessages.length-1].content !== finalAns) {
        newMessages.push(new AIMessage(finalAns));
    }
  }
  // If no specific condition met, finalAns remains the default apology.
  // Ensure it's added to messages if not already there.
  else if (newMessages.length === 0 || newMessages[newMessages.length-1].content !== finalAns) {
     if(!(newMessages[newMessages.length-1] instanceof AIMessage && newMessages[newMessages.length-1].content === finalAns))
        newMessages.push(new AIMessage(finalAns));
  }


  return {
    finalResponse: finalAns,
    messages: newMessages, // Update messages with the latest from general agent or error
    currentOrchestrationStep: 'response_compiled',
    error: state.error // Preserve any existing error for logging
  };
}

async function orchestratorErrorNode(
  state: OrchestratorState,
): Promise<Partial<OrchestratorState>> {
  const errorMsg = state.error || 'Errore sconosciuto nell\'orchestrazione';
  console.error(`❌ Orchestrator Error Handler: ${errorMsg}`);
  const userFriendlyError = `Mi dispiace, si è verificato un problema: ${errorMsg}`;

  const finalMessages = [...state.messages];
  if(finalMessages.length === 0 || !(finalMessages[finalMessages.length-1] instanceof AIMessage && finalMessages[finalMessages.length-1].content === userFriendlyError) ){
    finalMessages.push(new AIMessage(userFriendlyError));
  }

  return {
    finalResponse: userFriendlyError,
    messages: finalMessages,
    currentOrchestrationStep: 'orchestration_error_handled',
  };
}

// --- Main Orchestrator Function ---
export async function runOrchestrator(
  userInput: string,
  threadId?: string,
  existingMessages?: BaseMessage[], // Allow passing existing history
): Promise<OrchestratorState> {
  console.log(`🚀 Orchestrator: Starting run for query: "${userInput}" on threadId: ${threadId}`);

  let currentMessages = existingMessages ? [...existingMessages] : [];
  // Add current user query to messages if not already the last message
  if (currentMessages.length === 0 || currentMessages[currentMessages.length-1].content !== userInput || !(currentMessages[currentMessages.length-1] instanceof HumanMessage) ) {
      currentMessages.push(new HumanMessage(userInput));
  }

  let currentState: OrchestratorState = {
    messages: currentMessages,
    userQuery: userInput,
    currentOrchestrationStep: 'initial',
    threadId: threadId,
  };


  // Node Execution Flow
  let nextStep = await loadMcpToolsNode(currentState);
  currentState = { ...currentState, ...nextStep };
  if (currentState.error) {
    nextStep = await orchestratorErrorNode(currentState);
    return { ...currentState, ...nextStep };
  }

  nextStep = await routeTaskNode(currentState);
  currentState = { ...currentState, ...nextStep };
  if (currentState.error && currentState.currentOrchestrationStep === 'error_in_routing') { // Specific error from routing
    nextStep = await orchestratorErrorNode(currentState);
    return { ...currentState, ...nextStep };
  }
  // If routing fell back to general_agent due to LLM error, error is cleared by routeTaskNode

  nextStep = await invokeSpecialistNode(currentState);
  currentState = { ...currentState, ...nextStep };
   // If specialist invocation itself had a critical error (not a tool error handled by general_agent)
  if (currentState.error && currentState.currentOrchestrationStep === 'error_invoking_specialist') {
    nextStep = await orchestratorErrorNode(currentState);
    return { ...currentState, ...nextStep };
  }
  // Errors from specialists (e.g., mcpAgentResult.error) are now part of the state
  // and passed to compileResponseNode. generalAgentResult might contain a summary of this error.

  nextStep = await compileResponseNode(currentState);
  currentState = { ...currentState, ...nextStep };
  // compileResponseNode itself doesn't generate errors that stop the flow here.
  // It incorporates existing errors into the finalResponse.

  console.log(`🏁 Orchestrator: Run completed. Final response: "${currentState.finalResponse?.substring(0,100)}..."`);
  console.log("Final message history:", currentState.messages.map(m => ({type: m._getType(), content: m.content.substring(0,100)})));
  return currentState;
}


// Example Usage (for testing this file directly)
async function testOrchestrator() {
    console.log("--- Test Orchestrator ---");
    // Ensure MCP_BASE_URL is set for mcpUtils loading, even if mocked
    if (!process.env.MCP_BASE_URL) process.env.MCP_BASE_URL = "http://localhost:8080";
    if (process.env.MCP_ENABLE_DISCOVERY === undefined) process.env.MCP_ENABLE_DISCOVERY = "true";
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "your_openai_api_key_here") {
        console.error("OPENAI_API_KEY is not configured. LLM-dependent tests will fail.");
        // return; // Stop if no API key, as routing depends on it
    }


    const testQueries = [
        { query: "Ciao, come stai?", id: "greeting" },
        { query: "chi sono gli stagisti di mauden?", id: "mcp_interns" }, // Should go to MCP Agent (get_interns_mcp)
        { query: "Qual è il summary del modello 'alpha'?", id: "mcp_summary_alpha" }, // Should (try to) go to MCP (get_model_summary_mcp)
        { query: "Raccontami una barzelletta", id: "joke" },
        { query: "Esegui inferenza sul modello 'beta' con dati {'input': 'test'}", id: "mcp_inference_beta" }, // Should try MCP (run_model_inference_mcp)
        { query: "Qualcosa che sicuramente non è uno strumento.", id: "non_tool_query"}
    ];

    let conversationHistory: BaseMessage[] = [];

    for (const test of testQueries) {
        console.log(`\n--- Testing Query: "${test.query}" (ID: ${test.id}) ---`);
        const result = await runOrchestrator(test.query, `test-orch-${test.id}-${Date.now()}`, conversationHistory);
        console.log("Orchestrator Final Response:", result.finalResponse);
        if (result.error && result.currentOrchestrationStep !== 'response_compiled' && result.currentOrchestrationStep !== 'orchestration_error_handled') {
            console.error("Orchestrator Error:", result.error, "at step", result.currentOrchestrationStep);
        }
        // Update history for next turn
        conversationHistory = result.messages;
        console.log("Updated Conversation History (last 3):", conversationHistory.slice(-3).map(m => ({type: m._getType(), content: m.content.substring(0,70) })));
        console.log("--------------------");
    }

    // Test a follow-up question to see if history is maintained
    console.log(`\n--- Testing Follow-up Query ---`);
    const followupQuery = "E cosa fanno questi stagisti?"; // Assuming previous query was about interns
    const followupResult = await runOrchestrator(followupQuery, `test-orch-followup-${Date.now()}`, conversationHistory);
    console.log("Orchestrator Follow-up Response:", followupResult.finalResponse);
    if (followupResult.error && followupResult.currentOrchestrationStep !== 'response_compiled' && followupResult.currentOrchestrationStep !== 'orchestration_error_handled') {
        console.error("Orchestrator Error:", followupResult.error, "at step", followupResult.currentOrchestrationStep);
    }
    conversationHistory = followupResult.messages;
    console.log("Updated Conversation History (last 3):", conversationHistory.slice(-3).map(m => ({type: m._getType(), content: m.content.substring(0,70) })));
    console.log("--------------------");


}

// Uncomment to run test when executing this file directly:
// if (require.main === module) {
//   require('dotenv').config();
//   testOrchestrator().catch(console.error);
// }
