// Simple Node.js server that uses compiled simplified agents
console.log('🚀 Starting server...');

require('dotenv').config();
console.log('✅ Environment loaded');

const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server: SocketIOServer } = require('socket.io');
console.log('✅ Dependencies loaded');

// Import compiled optimized orchestrator
console.log('📁 Loading orchestrator from: ./src/agents/orchestratorAgent.optimized.js');
const { runOrchestratorOptimized } = require('./src/agents/orchestratorAgent.optimized.js');
console.log('✅ Optimized Orchestrator loaded successfully');

const app = express();
const server = createServer(app);

// Configure CORS for Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: ["http://localhost:4200", "http://127.0.0.1:4200"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors({
  origin: ["http://localhost:4200", "http://127.0.0.1:4200"],
  credentials: true
}));

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    mcp_server: process.env.MCP_BASE_URL,
    node_env: process.env.NODE_ENV || 'development'
  });
});

// REST endpoint for testing
app.post('/api/chat', async (req, res) => {
  try {
    const { message, threadId } = req.body;
    console.log(`📨 REST API: Received message: "${message}" for thread: ${threadId}`);
    
    // Add user message to conversation history
    addToConversationHistory(threadId, 'human', message);
    
    // Get conversation history
    const conversationHistory = getConversationHistory(threadId);
    console.log(`📜 Loading conversation history for ${threadId}: ${conversationHistory.length} messages`);
    
    // Convert history to LangChain message format
    const existingMessages = conversationHistory.map(msg => {
      if (msg.type === 'human') {
        return { _getType: () => 'human', content: msg.content };
      } else if (msg.type === 'ai') {
        return { _getType: () => 'ai', content: msg.content };
      }
      return { _getType: () => 'human', content: msg.content };    });
    
    const result = await runOrchestratorOptimized(message, threadId, existingMessages);
    
    // Add AI response to conversation history
    const aiResponse = result.finalAnswer || result.finalResponse || result.messages?.[result.messages.length - 1]?.content || 'Nessuna risposta disponibile';
    addToConversationHistory(threadId, 'ai', aiResponse);
    
    res.json({
      success: true,
      response: aiResponse,
      result: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ REST API Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Conversation history storage by threadId
const conversationHistories = new Map();

// Helper function to get conversation history
function getConversationHistory(threadId) {
  if (!conversationHistories.has(threadId)) {
    conversationHistories.set(threadId, []);
  }
  return conversationHistories.get(threadId);
}

// Helper function to add message to conversation history
function addToConversationHistory(threadId, messageType, content) {
  const history = getConversationHistory(threadId);
  history.push({
    type: messageType,
    content: content,
    timestamp: new Date().toISOString()
  });
  
  // Keep only last 10 messages to avoid memory bloat
  if (history.length > 10) {
    history.splice(0, history.length - 10);
  }
  
  console.log(`💾 Conversation history for ${threadId}: ${history.length} messages`);
}

// Function to emit progress events to client
function emitProgress(socket, threadId, step, details = {}) {
  const progressEvent = {
    threadId,
    step,
    timestamp: new Date().toISOString(),
    ...details
  };
  socket.emit('processing_progress', progressEvent);
  console.log(`📡 Progress emitted: ${step}`, details);
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // Add debugging for all socket events
  socket.onAny((eventName, ...args) => {
    console.log(`🔍 Socket event received: ${eventName}`, args);
  });  socket.on('user_message', async (data) => {
    try {
      console.log(`📨 Socket: Raw data received:`, data);
      const { message, threadId } = data;
      console.log(`📨 Socket: Received message from ${socket.id}: "${message}"`);
      
      // Emit initial progress
      emitProgress(socket, threadId, 'received', { 
        message: 'Messaggio ricevuto, avvio elaborazione...',
        userQuery: message 
      });
      
      // Add user message to conversation history
      addToConversationHistory(threadId, 'human', message);
      
      // Get conversation history
      const conversationHistory = getConversationHistory(threadId);
      console.log(`📜 Loading conversation history for ${threadId}: ${conversationHistory.length} messages`);
      
      // Emit language detection progress
      emitProgress(socket, threadId, 'language_detection', { 
        message: 'Rilevamento lingua in corso...' 
      });
      
      // Convert history to LangChain message format
      const existingMessages = conversationHistory.map(msg => {
        if (msg.type === 'human') {
          return { _getType: () => 'human', content: msg.content };
        } else if (msg.type === 'ai') {
          return { _getType: () => 'ai', content: msg.content };
        }
        return { _getType: () => 'human', content: msg.content };
      });
      
      // Emit acknowledgment
      socket.emit('message_received', { 
        message: `Messaggio ricevuto: "${message}"`,
        timestamp: new Date().toISOString()
      });      // Emit orchestrator start progress
      emitProgress(socket, threadId, 'orchestrator_start', { 
        message: 'Avvio orchestratore intelligente...' 
      });
      
      // Add a small delay to make progress visible
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Emit language processing step
      emitProgress(socket, threadId, 'language_processing', { 
        message: 'Analisi linguistica del messaggio...' 
      });
      
      // Add another small delay
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Emit agent selection step
      emitProgress(socket, threadId, 'agent_routing', { 
        message: 'Selezione agente specializzato...' 
      });
      
      // Run orchestrator with conversation history
      console.log(`🚀 Starting orchestrator for message: "${message}" with ${existingMessages.length} previous messages`);
      const result = await runOrchestratorOptimized(message, threadId, existingMessages);
      console.log(`✅ Orchestrator completed, result:`, result);
      
      // Emit agent selection progress
      const selectedAgent = result.selectedAgent || 'unknown';
      const agentNames = {
        'mcp_agent': 'Agente MCP (Dati Aziendali)',
        'general_agent': 'Agente Generale',
        'language_agent': 'Agente Linguistico'
      };
      
      emitProgress(socket, threadId, 'agent_selected', { 
        message: `Agente selezionato: ${agentNames[selectedAgent] || selectedAgent}`,
        agent: selectedAgent
      });
      
      // Add delay to show agent execution
      await new Promise(resolve => setTimeout(resolve, 400));
      
      // Emit processing step
      emitProgress(socket, threadId, 'agent_executing', { 
        message: 'Elaborazione richiesta in corso...',
        agent: selectedAgent
      });
      
      // Add another delay for processing visualization
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Emit completion progress
      emitProgress(socket, threadId, 'processing_complete', { 
        message: 'Elaborazione completata!'
      });
      
      // Add AI response to conversation history
      const aiResponse = result.finalAnswer || result.finalResponse || result.messages?.[result.messages.length - 1]?.content || 'Nessuna risposta disponibile';
      addToConversationHistory(threadId, 'ai', aiResponse);
      
      // Emit response
      socket.emit('agent_response', {
        response: aiResponse,
        result: result,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Socket Error:', error);
      socket.emit('error', { 
        message: 'Errore durante l\'elaborazione del messaggio',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.NODE_SERVER_PORT || 8001;

server.listen(PORT, () => {
  console.log(`🚀 Simple Node.js server running on port ${PORT}`);
  console.log(`📱 Socket.IO enabled for real-time communication`);
  console.log(`🔧 MCP Server URL: ${process.env.MCP_BASE_URL || 'not configured'}`);
  console.log(`🌐 CORS enabled for: http://localhost:4200`);
});
