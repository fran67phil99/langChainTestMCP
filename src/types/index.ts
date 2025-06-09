import { DynamicTool } from "@langchain/core/tools";

export interface McpToolSchema {
  name: string;
  description: string;
  endpoint_url: string; // Full URL for the tool's operation
  method: 'GET' | 'POST' | 'SSE'; // HTTP method or SSE for streaming
  parameters: { [key: string]: McpToolParameter }; // Define expected parameters
  sse_event_name?: string; // Optional: specific event name for SSE, defaults to 'message'
}

export interface McpToolParameter {
  type: string; // e.g., 'string', 'number', 'boolean'
  description: string;
  required: boolean;
}

// Extend DynamicTool or create a new interface if needed for MCP-specific properties
export type McpDynamicTool = DynamicTool;

import { BaseMessage } from "@langchain/core/messages";

export interface GeneralAgentState {
  messages: BaseMessage[];
  currentStep: string;
  result?: string; // Optional, as it's set by response nodes
  error?: string;  // Optional, as it's set by error node
  userIntent?: string;
  requiresReasoning?: boolean;
  // Potentially add threadId if managed explicitly at this level
  // threadId?: string;
}

// No new import needed for BaseMessage if GeneralAgentState already imported it.
// If not, add: import { BaseMessage } from "@langchain/core/messages";
// import { McpDynamicTool } from './index'; // Assuming McpDynamicTool is in the same file or imported
// McpDynamicTool is already defined in this file.

export interface MCPAgentState {
  messages: BaseMessage[]; // For logging or context, though less critical here
  taskDetails?: { // Details of the task from orchestrator
    toolToInvoke: McpDynamicTool;
    toolParams: Record<string, any>;
    originalUserQuery?: string; // Useful for context if error occurs
  };
  mcpServerResponse?: any; // Raw response from the MCP tool
  finalResult?: string;    // Formatted string result for the orchestrator
  error?: string;
  currentMcpStep: string;
}

// import { BaseMessage } from "@langchain/core/messages"; // Already imported for GeneralAgentState
// import { McpDynamicTool } from "./index"; // McpDynamicTool is already defined in this file

export interface OrchestratorState {
  messages: BaseMessage[]; // Conversation history
  userQuery: string; // The current user query being processed

  mcpToolsRegistry?: McpDynamicTool[];
  loadedMcpTools?: boolean; // Flag to indicate if tools have been loaded in this run

  selectedAgent?: 'general_agent' | 'mcp_agent';
  taskDescriptionForSpecialist?: any; // Could be query for general, or tool details for MCP

  mcpAgentResult?: { // To store raw result from mcpAgent
    mcpServerResponse?: any;
    finalResult?: string; // This is the string (JSON string or error string) from mcpAgent
    error?: string;
  };

  generalAgentResult?: { // To store result from generalAgent
    result?: string;
    error?: string;
    messages?: BaseMessage[]; // To get updated messages after general agent runs
  };

  finalResponse?: string;
  error?: string;
  currentOrchestrationStep: string;
  threadId?: string;
}
