import axios, { AxiosError } from 'axios';
import EventSource from 'eventsource';
import { DynamicTool } from '@langchain/core/tools';
import { McpToolSchema, McpDynamicTool } from '../types';

const MCP_DISCOVERY_ENDPOINT = '/tools'; // Assuming a discovery endpoint

/**
 * Fetches available MCP tool definitions from the MCP server and transforms them
 * into LangChain DynamicTool objects.
 */
export async function getAllMcpTools(): Promise<McpDynamicTool[]> {
  if (process.env.MCP_ENABLE_DISCOVERY !== 'true') {
    console.log('MCP tool discovery is disabled via MCP_ENABLE_DISCOVERY.');
    return [];
  }

  const mcpBaseUrl = process.env.MCP_BASE_URL;
  if (!mcpBaseUrl) {
    console.error('MCP_BASE_URL is not defined in environment variables.');
    return [];
  }

  const discoveryUrl = mcpBaseUrl + MCP_DISCOVERY_ENDPOINT;
  let toolSchemas: McpToolSchema[] = [];

  try {
    console.log(`Fetching MCP tool definitions from: ${discoveryUrl}`);
    // In a real scenario, this would be an HTTP GET request.
    // const response = await axios.get<McpToolSchema[]>(discoveryUrl);
    // toolSchemas = response.data;

    // BEGIN MOCK DATA (Remove when MCP server is available)
    // Simulating a response from the MCP server for now, as we can't actually call it.
    // This structure should match what the real MCP server's /tools endpoint would provide.
    toolSchemas = [
      {
        name: 'get_interns_mcp',
        description: 'Retrieves a list of interns from Mauden via MCP.',
        endpoint_url: `${mcpBaseUrl}/interns`, // Example endpoint
        method: 'GET',
        parameters: {},
      },
      {
        name: 'get_model_summary_mcp',
        description: 'Gets the summary of a specific model from MCP.',
        endpoint_url: `${mcpBaseUrl}/models/{model_name}/summary`, // Example with path param
        method: 'GET',
        parameters: {
          model_name: { type: 'string', description: 'The name of the model', required: true },
        },
      },
      {
        name: 'run_model_inference_mcp',
        description: 'Runs inference on a specific model with given data via MCP.',
        endpoint_url: `${mcpBaseUrl}/models/{model_name}/inference`, // Example
        method: 'POST',
        parameters: {
          model_name: { type: 'string', description: 'The name of the model', required: true },
          input_data: { type: 'object', description: 'The input data for the model', required: true },
        },
      },
      {
        name: 'stream_mcp_data_sse',
        description: 'Streams data from an MCP endpoint using Server-Sent Events.',
        endpoint_url: `${mcpBaseUrl}/stream`, // Example SSE endpoint for general streaming
        method: 'SSE',
        parameters: {
          topic: { type: 'string', description: 'The topic to subscribe to for SSE events', required: true },
        },
        sse_event_name: 'custom_event', // Optional: if your SSE source uses specific event names
      },
    ];
    console.log('Using MOCK MCP tool definitions for development.', toolSchemas);
    // END MOCK DATA

    if (!Array.isArray(toolSchemas) || toolSchemas.length === 0) {
      console.log('No MCP tools found or invalid format from discovery endpoint.');
      return [];
    }

  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      console.error(`Error fetching MCP tool definitions: ${axiosError.message}`, axiosError.response?.data);
    } else {
      console.error(`An unexpected error occurred while fetching MCP tool definitions: ${error}`);
    }
    return [];
  }

  const mcpTools: McpDynamicTool[] = toolSchemas.map((schema) => {
    return new DynamicTool({
      name: schema.name,
      description: schema.description,
      func: async (params: Record<string, any>): Promise<string> => {
        let url = schema.endpoint_url;

        // Replace path parameters in URL
        Object.keys(params).forEach(key => {
          if (url.includes(`{${key}}`)) {
            url = url.replace(`{${key}}`, encodeURIComponent(params[key]));
            delete params[key]; // Remove from params if used in path
          }
        });

        console.log(`MCP Tool '${schema.name}': Invoking ${schema.method} ${url} with params:`, params);

        try {
          if (schema.method === 'GET') {
            const response = await axios.get(url, { params });
            return JSON.stringify(response.data);
          } else if (schema.method === 'POST') {
            const response = await axios.post(url, params);
            return JSON.stringify(response.data);
          } else if (schema.method === 'SSE') {
            return new Promise<string>((resolve, reject) => {
              // Append query parameters for SSE if any are left in 'params'
              const queryParams = new URLSearchParams(params as any).toString();
              const sseUrl = queryParams ? `${url}?${queryParams}` : url;

              console.log(`MCP Tool '${schema.name}': Connecting to SSE URL: ${sseUrl}`);
              const eventSource = new EventSource(sseUrl);
              let lastMessage = '';
              let receivedAny = false;

              eventSource.onopen = () => {
                console.log(`MCP Tool '${schema.name}': SSE connection opened.`);
              };

              const eventToListen = schema.sse_event_name || 'message';
              console.log(`MCP Tool '${schema.name}': Listening for SSE event: '${eventToListen}'`);

              eventSource.addEventListener(eventToListen, (event) => {
                receivedAny = true;
                console.log(`MCP Tool '${schema.name}': SSE event '${eventToListen}' received:`, event.data);
                lastMessage = event.data;
                // For simplicity, we resolve with the last message.
                // In a real scenario, you might accumulate data or handle multiple messages.
                // This example assumes the orchestrator wants a single string response eventually.
              });

              eventSource.onerror = (error) => {
                console.error(`MCP Tool '${schema.name}': SSE error:`, error);
                eventSource.close(); // Close on error
                if (!receivedAny) { // If error before any message, reject
                    reject(`SSE error for ${schema.name}: ${JSON.stringify(error)}`);
                } else { // If error after some messages, resolve with what we got
                    resolve(lastMessage || "SSE stream ended with an error after receiving some data.");
                }
              };

              // How to determine when an SSE stream "ends" naturally if it's not an error?
              // SSE streams are typically long-lived. For a tool, we might need a timeout
              // or a specific "end" message. This mock resolves on the first message
              // or error for simplicity in this example.
              // A more robust solution would be needed for production.
              // For now, if we get a message, we'll resolve after a short delay to simulate closure.
              // This is a simplification. Python's fastmcp might have specific logic.
              if (eventToListen === 'message') { // Default 'message' event might resolve sooner
                 eventSource.onmessage = (event) => {
                    receivedAny = true;
                    console.log(`MCP Tool '${schema.name}': SSE 'message' event received:`, event.data);
                    lastMessage = event.data;
                    // Simplified: resolve after first message for now
                    eventSource.close();
                    resolve(lastMessage);
                 }
              }

              // Add a timeout to prevent hanging indefinitely if no 'end' is clearly defined
              setTimeout(() => {
                if (eventSource.readyState !== EventSource.CLOSED) {
                    console.warn(`MCP Tool '${schema.name}': SSE connection timed out after 30s. Closing.`);
                    eventSource.close();
                    if (receivedAny) resolve(lastMessage || "SSE stream timed out after receiving some data.");
                    else reject("SSE stream timed out without receiving any data.");
                }
              }, 30000); // 30-second timeout
            });
          } else {
            throw new Error(`Unsupported MCP tool method: ${schema.method}`);
          }
        } catch (err) {
          const toolError = err as AxiosError;
          console.error(`MCP Tool '${schema.name}' invocation error: ${toolError.message}`, toolError.response?.data);
          // Return error details as a JSON string so it can be processed by the LLM if needed
          return JSON.stringify({
            error: `Failed to invoke MCP tool ${schema.name}`,
            details: toolError.message,
            responseData: toolError.response?.data
          });
        }
      },
    });
  });

  console.log(`Loaded ${mcpTools.length} MCP tools.`);
  return mcpTools;
}

// Example usage (for testing this file directly)
async function testGetAllMcpTools() {
  // Set up mock env vars for testing if not present
  if (!process.env.MCP_BASE_URL) {
    process.env.MCP_BASE_URL = 'http://localhost:8080'; // Mock for local test
  }
  if (process.env.MCP_ENABLE_DISCOVERY === undefined) {
    process.env.MCP_ENABLE_DISCOVERY = 'true';
  }

  console.log("--- Testing getAllMcpTools ---");
  const tools = await getAllMcpTools();
  if (tools.length > 0) {
    console.log("\n--- Found Tools ---");
    tools.forEach(tool => {
      console.log(`Name: ${tool.name}`);
      console.log(`Description: ${tool.description}`);
    });

    // Example of invoking a mock tool (if one exists and is GET with no params)
    const firstTool = tools.find(t => t.name === 'get_interns_mcp');
    if (firstTool) {
      console.log(`\n--- Testing invocation of '${firstTool.name}' ---`);
      try {
        // This will fail if the mock server isn't running, but it tests the structure.
        // const result = await firstTool.call({});
        // console.log("Invocation result:", result);
        console.log("Invocation test skipped as it requires a running MCP mock server or live HTTP calls to be mocked via msw/nock.");
      } catch (e) {
        console.error("Error during test invocation:", e);
      }
    }
  } else {
    console.log("No tools found or loaded.");
  }
}

// Uncomment to run test when executing this file directly:
// if (require.main === module) {
//   require('dotenv').config(); // Load .env for direct execution
//   testGetAllMcpTools().catch(console.error);
// }
