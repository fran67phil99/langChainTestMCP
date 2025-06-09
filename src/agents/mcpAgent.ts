import {
  HumanMessage,
  AIMessage,
  BaseMessage,
} from '@langchain/core/messages';
import { MCPAgentState, McpDynamicTool } from '../types'; // Import the state and tool type

// --- Agent Nodes ---

async function processMcpRequestNode(
  state: MCPAgentState,
): Promise<Partial<MCPAgentState>> {
  console.log('⚙️ MCP Agent: Processing MCP request...');
  const taskDetails = state.taskDetails;

  if (!taskDetails || !taskDetails.toolToInvoke) {
    const errorMsg = 'Nessun dettaglio del task fornito o tool_to_invoke mancante.';
    console.error(`❌ MCP Agent: ${errorMsg}`);
    return {
      error: errorMsg,
      currentMcpStep: 'error_processing_request',
      finalResult: JSON.stringify({ error: errorMsg }),
    };
  }

  const { toolToInvoke, toolParams } = taskDetails;
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

    // Check if the parsed response indicates an error from the tool itself (as structured in mcpUtils)
    if (typeof parsedResponseData === 'object' && parsedResponseData !== null && parsedResponseData.error) {
        console.error(`❌ MCP Agent: Tool '${toolToInvoke.name}' returned an error:`, parsedResponseData.details);
        return {
            messages: [
                ...(state.messages || []),
                new AIMessage(`Tool ${toolToInvoke.name} execution failed. Error: ${parsedResponseData.details}`),
            ],
            mcpServerResponse: parsedResponseData, // Store the structured error
            finalResult: rawMcpResponseData, // Return the raw error string for orchestrator
            error: `Tool Error: ${parsedResponseData.details || parsedResponseData.error}`,
            currentMcpStep: 'mcp_request_processed_with_tool_error',
        };
    }

    return {
      messages: [
        ...(state.messages || []),
        new AIMessage(`Tool ${toolToInvoke.name} executed. Result (first 100 chars): ${rawMcpResponseData.substring(0,100)}...`),
      ],
      mcpServerResponse: parsedResponseData, // Store the actual data
      finalResult: rawMcpResponseData, // For orchestrator, this is the direct string output from the tool
      currentMcpStep: 'mcp_request_processed',
      error: undefined,
    };
  } catch (e: any) {
    const errorMsg = `Errore durante l'invocazione dello strumento '${toolToInvoke.name}': ${e.message}`;
    console.error(`❌ MCP Agent: ${errorMsg}`, e);
    return {
      error: errorMsg,
      currentMcpStep: 'error_invoking_tool',
      finalResult: JSON.stringify({ error: errorMsg, details: e.stack }),
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
    finalResult: state.finalResult || JSON.stringify({error: userFriendlyError}), // Ensure finalResult has the error
    currentMcpStep: 'mcp_error_handled',
    // error field is already set
  };
}

export async function runMcpAgent(
  taskDetails: {
    toolToInvoke: McpDynamicTool;
    toolParams: Record<string, any>;
    originalUserQuery?: string;
  },
  threadId?: string, // For logging or future stateful operations
): Promise<MCPAgentState> {
  console.log(
    `🏃 MCP Agent: Running with task for tool '${taskDetails.toolToInvoke.name}' and thread_id: ${threadId}`,
  );

  let currentState: MCPAgentState = {
    messages: [
      new HumanMessage(
        `Richiesta MCP ricevuta per tool: ${taskDetails.toolToInvoke.name}`,
      ),
    ],
    taskDetails: taskDetails,
    currentMcpStep: 'initial',
  };

  // 1. Process MCP Request
  const processingResult = await processMcpRequestNode(currentState);
  currentState = { ...currentState, ...processingResult };

  // 2. Handle Error if any
  if (currentState.error && currentState.currentMcpStep !== 'mcp_error_handled') {
    // If processMcpRequestNode itself returned an error, or if a tool error was identified
    if (currentState.currentMcpStep === 'mcp_request_processed_with_tool_error' ||
        currentState.currentMcpStep === 'error_invoking_tool' ||
        currentState.currentMcpStep === 'error_processing_request') {
      // These errors are already formatted by processMcpRequestNode or are specific internal errors
      // We might just ensure the state is correctly set for the orchestrator
      console.log(`MCP Agent: Tool or invocation error occurred: ${currentState.error}`);
      // finalResult should already be set by processMcpRequestNode in these cases
    } else {
      // For other types of errors, call the dedicated error node
      const errorState = await mcpErrorNode(currentState);
      currentState = { ...currentState, ...errorState };
    }
  }

  if (!currentState.finalResult && currentState.error) {
    // Ensure finalResult is populated if an error occurred and wasn't a tool-returned error
     currentState.finalResult = JSON.stringify({ error: currentState.error });
  }


  console.log(
    `🏁 MCP Agent: Graph execution finished. Final result (first 100 chars): ${currentState.finalResult?.substring(0,100)}...`,
  );
  return currentState;
}

// Example Usage (for testing this file directly)
// This requires mcpUtils to be working and providing mock tools.
async function testMcpAgent() {
    console.log("--- Test MCP Agent ---");
    // Need to get tools from mcpUtils first
    const { getAllMcpTools } = await import('../utils/mcpUtils'); // Dynamic import for test
    const tools = await getAllMcpTools();

    const getInternsTool = tools.find(t => t.name === 'get_interns_mcp');
    if (getInternsTool) {
        console.log("\n--- Test 1: get_interns_mcp (GET tool) ---");
        const result1 = await runMcpAgent({ toolToInvoke: getInternsTool, toolParams: {}, originalUserQuery: "Get interns" }, "mcp-test-1");
        console.log("Result for get_interns_mcp:", result1.finalResult);
        if (result1.error) console.error("Error:", result1.error);
        console.log("Full state:", result1.mcpServerResponse);
    } else {
        console.log("Skipping get_interns_mcp test: tool not found in mock setup.");
    }

    const runInferenceTool = tools.find(t => t.name === 'run_model_inference_mcp');
    if (runInferenceTool) {
        console.log("\n--- Test 2: run_model_inference_mcp (POST tool) ---");
        const task2Params = { model_name: "beta", input_data: { text: "Hello world" } };
        const result2 = await runMcpAgent({ toolToInvoke: runInferenceTool, toolParams: task2Params, originalUserQuery: "Run beta model" }, "mcp-test-2");
        console.log("Result for run_model_inference_mcp:", result2.finalResult);
        if (result2.error) console.error("Error:", result2.error);
        console.log("Full state:", result2.mcpServerResponse);
    } else {
        console.log("Skipping run_model_inference_mcp test: tool not found in mock setup.");
    }

    const streamTool = tools.find(t => t.name === 'stream_mcp_data_sse');
    if (streamTool) {
        console.log("\n--- Test 3: stream_mcp_data_sse (SSE tool) ---");
        const task3Params = { topic: "test_topic" };
        // Note: SSE test will try to connect to the mock SSE endpoint defined in mcpUtils.
        // This will likely timeout or fail if no server is actually serving SSE on that path.
        // The mcpUtils has a timeout for SSE connections.
        try {
            const result3 = await runMcpAgent({ toolToInvoke: streamTool, toolParams: task3Params, originalUserQuery: "Stream test topic" }, "mcp-test-3");
            console.log("Result for stream_mcp_data_sse:", result3.finalResult);
            if (result3.error) console.error("Error:", result3.error);
            console.log("Full state:", result3.mcpServerResponse);
        } catch(e) {
             console.error("Error running SSE tool test (expected if mock server not running):", e);
        }
    } else {
        console.log("Skipping stream_mcp_data_sse test: tool not found in mock setup.");
    }
}

// Uncomment to run test when executing this file directly:
// if (require.main === module) {
//   require('dotenv').config(); // Load .env for direct execution
//   // Need to ensure .env has MCP_BASE_URL and MCP_ENABLE_DISCOVERY for mcpUtils
//   if (!process.env.MCP_BASE_URL) process.env.MCP_BASE_URL = "http://localhost:8080"; // Mock for test
//   if (process.env.MCP_ENABLE_DISCOVERY === undefined) process.env.MCP_ENABLE_DISCOVERY = "true";

//   testMcpAgent().catch(console.error);
// }
