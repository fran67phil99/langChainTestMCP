# Conceptual Testing Plan

This document outlines the testing strategy for the Node.js Agent project. As automated test execution is not part of the current phase, this serves as a guide for future test implementation.

## Unit Tests

Unit tests will focus on isolating and verifying individual functions and modules. Mocks will be used extensively for external dependencies like LLM calls, HTTP requests, and inter-agent communications.

### 1. MCP Utilities (`src/utils/mcpUtils.ts`)

-   **`getAllMcpTools()`**:
    -   Mock `axios.get` (for the discovery endpoint).
    -   Verify correct transformation of raw schema from the (mocked) MCP server into LangChain.js `DynamicTool` objects.
    -   Test behavior when `MCP_ENABLE_DISCOVERY` is `false`.
    -   Test behavior when the discovery endpoint returns errors or empty/invalid data.
-   **`DynamicTool` Instances (created by `getAllMcpTools`)**:
    -   For each tool method (`GET`, `POST`, `SSE`):
        -   Mock `axios.get/post` or `EventSource` constructors/methods.
        -   Verify correct URL construction (path parameters, query parameters).
        -   Verify correct request body and headers for `POST`.
        -   Verify parameters are passed correctly to SSE `EventSource` URLs.
        -   Verify successful responses are correctly processed (e.g., `JSON.stringify` output).
        -   Verify error responses from `axios` or `EventSource` are handled and returned as structured error strings.
    -   Test parameter validation (if any is added to the tool's `func`).

### 2. General Agent (`src/agents/generalAgent.ts`)

-   **`getLlm()`**:
    -   Verify it throws an error if `OPENAI_API_KEY` is missing.
-   **`analyzeIntentNode()`**:
    -   Test with various user inputs to ensure correct intent classification (e.g., `greeting`, `question`, `reasoning`, `summarize_mcp_data`).
    -   Verify `requiresReasoning` flag is set correctly.
-   **`responseNode()`**:
    -   Mock `ChatOpenAI.invoke()`.
    -   Verify the correct system prompt (default, reasoning, MCP summarization) is selected based on `userIntent` and `requiresReasoning` from the state.
    -   For `summarize_mcp_data` intent:
        -   Provide mock MCP data in the input message.
        -   Verify the `mcpSummarizationSystemPromptTemplate` is used and populated correctly.
        -   Verify that only the summarization prompt (and not full history) is passed to the LLM if that's the desired behavior.
    -   Verify conversation history (`messages` from state) is correctly passed to the LLM for other intents.
    -   Verify LLM response is correctly transformed into an `AIMessage`.
-   **`errorNode()`**:
    -   Verify it correctly formats an error message into an `AIMessage`.
-   **`runGeneralAgent()`**:
    -   Test the overall execution flow for different intents.
    -   Mock LLM calls to control outputs and verify state transitions (`currentStep`, `result`, `error`, `messages`).
    -   Ensure conversation history is correctly maintained in the output state.

### 3. MCP Agent (`src/agents/mcpAgent.ts`)

-   **`processMcpRequestNode()`**:
    -   Mock the `toolToInvoke.call()` method (which is the `func` of a `DynamicTool`).
    -   Verify that `toolParams` from the state are correctly passed to `toolToInvoke.call()`.
    -   Test handling of successful string (JSON) responses from the tool: ensure `finalResult` (string) and `mcpServerResponse` (parsed object) are populated.
    -   Test handling of string (JSON) error responses from the tool: ensure `error` is set and `finalResult` contains the error string.
    -   Test error handling if `toolToInvoke.call()` itself throws an exception.
-   **`mcpErrorNode()`**:
    -   Verify it correctly formats an error message.
-   **`runMcpAgent()`**:
    -   Test the overall execution flow.
    -   Mock tool calls and verify state transitions and outputs (`finalResult`, `mcpServerResponse`, `error`).

### 4. Orchestrator Agent (`src/agents/orchestratorAgent.ts`)

-   **`loadMcpToolsNode()`**:
    -   Mock `getAllMcpTools()` from `mcpUtils.ts`.
    -   Verify tools are loaded into the state.
    -   Test caching logic: tools are fetched on the first call or after TTL, otherwise served from cache.
-   **`routeTaskNode()`**:
    -   Mock `ChatOpenAI.invoke()` (for the tool selection LLM call).
    -   Provide a mock `mcpToolsRegistry` in the state.
    -   Test with various user queries:
        -   Query that should select an MCP tool: verify `selectedAgent` is `'mcp_agent'` and `taskDescriptionForSpecialist` contains the correct tool and extracted parameters.
        -   Query that should result in `'none'` from the LLM: verify `selectedAgent` is `'general_agent'`.
        -   Behavior when `mcpToolsRegistry` is empty or `null`.
    -   Test parsing of the LLM's JSON response (including malformed or unexpected JSON).
    -   Test fallback to `general_agent` if LLM call fails.
-   **`invokeSpecialistNode()`**:
    -   Mock `runMcpAgent()` and `runGeneralAgent()`.
    -   If `selectedAgent` is `'mcp_agent'`:
        -   Verify `runMcpAgent()` is called with correct parameters.
        -   If `runMcpAgent` returns success: Verify its `finalResult` (stringified JSON) and `mcpServerResponse` (parsed object) are used to construct the input for `runGeneralAgent` (for summarization), ensuring the `action: "summarize_mcp_data"` structure.
        -   If `runMcpAgent` returns an error: Verify this error is also passed to `runGeneralAgent` for summarization/explanation.
    -   If `selectedAgent` is `'general_agent'`: Verify `runGeneralAgent()` is called with the appropriate query.
-   **`compileResponseNode()`**:
    -   Verify it correctly constructs the `finalResponse` string from `generalAgentResult.result`.
    -   Test how it handles states where `generalAgentResult.result` is missing but an error exists elsewhere (e.g., `state.error` or `state.mcpAgentResult.error`).
    -   Verify `messages` in the output state are updated correctly.
-   **`orchestratorErrorNode()`**:
    -   Verify it correctly formats an error message.
-   **`runOrchestrator()`**:
    -   Test the end-to-end orchestration flow for various scenarios:
        -   Successful MCP tool path (route -> mcp_agent -> general_agent for summary -> compile).
        -   MCP tool path with tool error (route -> mcp_agent fails -> general_agent for error summary -> compile).
        -   Direct general agent path (route -> general_agent -> compile).
        -   Orchestrator internal error at each step.
    -   Mock underlying agent calls (`runGeneralAgent`, `runMcpAgent`) and LLM calls (`ChatOpenAI.invoke`) to control behavior and verify interactions.
    -   Test with and without `existingMessages` to verify conversation history management.

### 5. Server (`src/server.ts`)

-   **Socket.IO Event Handlers**:
    -   Mock `runOrchestrator()`.
    -   Simulate `socket.io` client connections and `user_query` events.
    -   Verify that `runOrchestrator` is called with the correct query, `threadId`, and conversation history.
    -   Verify that the server emits the correct events (`agent_response`, `system_message`, `error_message`) to the client based on `runOrchestrator`'s output.
    -   Verify `conversationHistories` object is updated correctly after each interaction.
    -   Test `threadId` generation/retrieval.
    -   Test multiple client connections and ensure history isolation.

## Integration Tests

Integration tests will verify interactions between different parts of the system, but still with some mocks for external services like live LLMs or the actual MCP server.

-   **Orchestrator -> MCP Agent -> General Agent Flow**:
    -   Setup: `mcpUtils.getAllMcpTools()` returns mock `DynamicTool` instances whose `call()` methods are mocked to return predefined success/error strings. The LLM in `orchestratorAgent.routeTaskNode` is mocked to select an MCP tool.
    -   Action: Call `runOrchestrator` with a query designed for an MCP tool.
    -   Verification:
        -   Assert `runMcpAgent` was called (mock verification).
        -   Assert `runGeneralAgent` was called with the "summarize_mcp_data" action and the output from the (mocked) `runMcpAgent`.
        -   Assert the `finalResponse` from `runOrchestrator` is the summarized, conversational version of the MCP tool's mock output.
-   **Full Server-Agent Flow (WebSocket to Orchestrator and back)**:
    -   Setup: Run the application server (`src/server.ts`). Mock `ChatOpenAI.invoke` in all agents and `mcpUtils.getAllMcpTools` (and the tool's `call` methods) to control the agent's behavior without actual LLM/HTTP calls.
    -   Action: Use a WebSocket client (e.g., `socket.io-client`) to:
        1.  Connect to the server with a specific `threadId`.
        2.  Send a `user_query` message.
        3.  Receive `agent_response` / `error_message`.
        4.  Send another `user_query` on the same `threadId`.
        5.  Receive another response.
    -   Verification:
        -   Check that the received WebSocket messages match the expected outputs based on the mocked agent logic.
        -   Verify that the conversation history was correctly passed to `runOrchestrator` on the second call by inspecting mock call arguments.

## End-to-End (E2E) Tests (Conceptual)

E2E tests would involve running the entire system with minimal mocks, ideally against a real (or faithfully mocked) MCP server and potentially even real LLM services (though this can be costly and non-deterministic).

-   **Scenario 1: Successful MCP Tool Interaction via WebSocket**
    1.  Start the Node.js server.
    2.  (Requires a mock MCP server running at `http://localhost:8080` that responds to discovery calls from `mcpUtils.ts` and to the specific tool endpoint calls).
    3.  Connect a WebSocket client.
    4.  Send a query that should trigger a specific (mocked) MCP tool.
    5.  Verify the client receives a conversational response that accurately reflects the (mocked) data from the MCP tool, after being processed by the General Agent.
-   **Scenario 2: General Conversation via WebSocket**
    1.  Start the Node.js server.
    2.  Connect a WebSocket client.
    3.  Send a query that should be handled by the General Agent directly (e.g., "Hello, how are you?").
    4.  Verify the client receives an appropriate conversational response.
-   **Scenario 3: Conversation Continuity**
    1.  Perform Scenario 2.
    2.  Send a follow-up question that relies on the context of the first query/response.
    3.  Verify the General Agent (via Orchestrator) uses the history to provide a relevant answer.

This plan provides a structured approach to ensuring the quality and correctness of the application through comprehensive testing.
