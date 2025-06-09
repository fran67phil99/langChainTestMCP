import dotenv from 'dotenv';
dotenv.config(); // Load .env variables at the very beginning

import express from 'express';
import http from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import cors from 'cors'; // Added for CORS configuration
import { runOrchestrator } from './agents/orchestratorAgent'; // Adjusted path
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';

// LangSmith Configuration
// Ensure these are set in your .env file
if (process.env.LANGCHAIN_API_KEY && process.env.LANGCHAIN_API_KEY !== "your_langchain_api_key_here") {
  process.env.LANGCHAIN_TRACING_V2 = 'true'; // Already in .env, but good to ensure
  // process.env.LANGCHAIN_ENDPOINT = "https://api.smith.langchain.com"; // Already in .env
  // process.env.LANGCHAIN_PROJECT = "MyLangGraphProgetto-NodeJS"; // Already in .env
  console.log('✅ LangSmith tracing configured via environment variables.');
} else {
  console.warn(
    'ℹ️ LangSmith API key not found or is default in LANGCHAIN_API_KEY env variable. Tracing will be disabled.',
  );
}
// Ensure MCP variables are loaded for the orchestrator when it runs
if (!process.env.MCP_BASE_URL) {
    process.env.MCP_BASE_URL = "http://localhost:8080"; // Default for orchestrator's mcpUtils
    console.warn("MCP_BASE_URL not set, using default http://localhost:8080");
}
if (process.env.MCP_ENABLE_DISCOVERY === undefined) {
    process.env.MCP_ENABLE_DISCOVERY = "true";
    console.warn("MCP_ENABLE_DISCOVERY not set, using default true");
}
if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "your_openai_api_key_here") {
    console.error("OPENAI_API_KEY is not configured in .env. Orchestrator LLM calls will fail.");
}

const app = express();
app.use(cors()); // Enable CORS for all routes and origins by default
app.use(express.json()); // Middleware to parse JSON bodies

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*', // Allow all origins for Socket.IO. Restrict in production.
    methods: ['GET', 'POST'],
  },
});

// Simple in-memory store for conversation histories by threadId
// In production, consider a more persistent store like Redis.
const conversationHistories: Record<string, BaseMessage[]> = {};

app.get('/', (req, res) => {
  res.send('<h1>Node.js Agent Server</h1><p>Connect via WebSocket to interact with the agent.</p>');
});

io.on('connection', (socket: Socket) => {
  const threadId = socket.handshake.query.threadId as string || socket.id;
  console.log(`INFO: WebSocket user connected with threadId: ${threadId}`);

  // Initialize history if not present
  if (!conversationHistories[threadId]) {
    conversationHistories[threadId] = [];
  }
  // Optionally send a welcome message or connection confirmation
  socket.emit('system_message', {
     message: `Connected with threadId: ${threadId}. Previous history length: ${conversationHistories[threadId].length}`
  });


  socket.on('user_query', async (data: { query: string }) => {
    const userQuery = data.query;
    if (!userQuery || typeof userQuery !== 'string' || userQuery.trim() === '') {
        socket.emit('error_message', { message: "Query cannot be empty." });
        return;
    }

    console.log(`INFO: WebSocket ${threadId}: Received query: "${userQuery}"`);
    socket.emit('system_message', { message: `Elaborazione: "${userQuery}"...` });

    try {
      // Retrieve history for this threadId
      const currentHistory = conversationHistories[threadId] || [];

      const orchestratorResult = await runOrchestrator(
        userQuery,
        threadId,
        currentHistory, // Pass existing history
      );

      if (orchestratorResult.finalResponse) {
        console.log(
          `INFO: WebSocket ${threadId}: Sending response: "${orchestratorResult.finalResponse.substring(0,100)}..."`,
        );
        socket.emit('agent_response', { response: orchestratorResult.finalResponse });

        // Update history with the new messages from the orchestrator run
        // Orchestrator now returns the full updated message list in orchestratorResult.messages
        if (orchestratorResult.messages && orchestratorResult.messages.length > 0) {
            conversationHistories[threadId] = orchestratorResult.messages;
        } else {
            // Fallback if orchestrator didn't update messages (should not happen with current Orchestrator)
            conversationHistories[threadId].push(new HumanMessage(userQuery));
            conversationHistories[threadId].push(new AIMessage(orchestratorResult.finalResponse));
        }

      } else if (orchestratorResult.error) {
        console.error(
          `ERROR: WebSocket ${threadId}: Orchestrator error: ${orchestratorResult.error}`,
        );
        socket.emit('error_message', { message: orchestratorResult.error });
        // Add error to history for context, if appropriate
        conversationHistories[threadId].push(new HumanMessage(userQuery)); // User's query that led to error
        conversationHistories[threadId].push(new AIMessage(`Error: ${orchestratorResult.error}`));
      } else {
        console.error(
          `ERROR: WebSocket ${threadId}: Orchestrator returned no response and no error.`,
        );
        socket.emit('error_message', { message: 'Internal server error: No response from agent.' });
      }
    } catch (e: any) {
      console.error(
        `FATAL_ERROR: WebSocket ${threadId}: Exception during message processing: ${e.message}`, e);
      socket.emit('error_message', {
        message: `Internal server error: ${e.message}`,
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`INFO: WebSocket user disconnected with threadId: ${threadId}`);
    // Optionally, clean up history if it's very large or after a timeout
    // delete conversationHistories[threadId]; // Or implement TTL for histories
  });
});

const PORT = process.env.PORT || 8001; // Same port as Python version
server.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`🔗 WebSocket endpoint available. Clients can connect with a 'threadId' query parameter.`);
});
