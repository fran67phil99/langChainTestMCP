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
const { runOrchestration } = require('./src/agents/orchestratorAgent.optimized.js');
console.log('✅ Optimized Orchestrator loaded successfully');

// Import log translator for multilingual progress logs
console.log('📁 Loading log translator...');
const { detectLanguageFromResponse, translateProgressLogs, translateLogMessage, createA2ALog } = require('./src/utils/logTranslator');
const { a2aLogger } = require('./src/utils/a2aLogger');
console.log('✅ Log translator loaded successfully');

// Import MCP management routes
const mcpRoutes = require('./src/routes/mcpRoutes');

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

// MCP management routes
app.use('/api/mcp', mcpRoutes);

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
    
    const result = await runOrchestration(message, threadId, existingMessages);
    
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

// Store progress logs temporarily to translate them later
const progressLogsBuffer = new Map(); // threadId -> [logs]
const userLanguageCache = new Map(); // threadId -> detected language

// Quick language detection from user input (without full translation)
async function quickDetectLanguage(userInput) {
  try {
    // Simple pattern-based detection for common cases
    const text = userInput.toLowerCase();
    
    // Italian patterns
    if (/\b(quanti|come|dove|quando|perché|chi|che cosa|mostra|trova|voglio|vorrei)\b/.test(text)) {
      return 'it';
    }
      // English patterns  
    if (/\b(how many|how much|where|when|why|who|what|which|show|find|want|would like|are|all|includes|searching)\b/.test(text)) {
      return 'en';
    }
    
    // French patterns
    if (/\b(combien|comment|où|quand|pourquoi|qui|que|montre|trouve|veux|voudrais)\b/.test(text)) {
      return 'fr';
    }
    
    // Spanish patterns
    if (/\b(cuántos|cuánto|cómo|dónde|cuándo|por qué|quién|qué|muestra|encuentra|quiero|quisiera)\b/.test(text)) {
      return 'es';
    }
    
    // German patterns
    if (/\b(wie viele|wie|wo|wann|warum|wer|was|zeige|finde|will|möchte)\b/.test(text)) {
      return 'de';
    }
    
    // Default to Italian
    return 'it';
  } catch (error) {
    console.error('❌ Quick language detection error:', error);
    return 'it';
  }
}

// Enhanced function to emit progress events to client with multilingual support
async function emitProgress(socket, threadId, step, details = {}) {
  // Get or detect user language for this thread
  let userLanguage = userLanguageCache.get(threadId) || 'it';
  
  // Translate the message if needed
  let translatedMessage = details.message || step;
  if (userLanguage !== 'it') {
    try {
      translatedMessage = await translateLogMessage(step, translatedMessage, userLanguage);
    } catch (error) {
      console.error('❌ Error translating progress message:', error);
      // Fall back to original message
    }
  }
  
  const progressEvent = {
    threadId,
    step,
    message: translatedMessage,
    timestamp: new Date().toISOString(),
    agent: details.agent || 'system',
    userQuery: details.userQuery || '',
    language: userLanguage,
    details: details.details || {}
  };
  
  // Store in buffer for backup
  if (!progressLogsBuffer.has(threadId)) {
    progressLogsBuffer.set(threadId, []);
  }
  progressLogsBuffer.get(threadId).push(progressEvent);
  
  socket.emit('processing_progress', progressEvent);
  console.log(`📡 Progress emitted (${userLanguage}): ${step} - ${translatedMessage}`);
}

// Enhanced A2A log emitter for agent-to-agent communication
async function emitA2AProgress(socket, threadId, fromAgent, toAgent, operation, details = {}) {
  // Get user language for this thread
  let userLanguage = userLanguageCache.get(threadId) || 'it';
  
  const a2aLog = createA2ALog(fromAgent, toAgent, operation, { 
    ...details, 
    threadId 
  }, userLanguage); // Use detected language directly
  
  // Store in buffer
  if (!progressLogsBuffer.has(threadId)) {
    progressLogsBuffer.set(threadId, []);
  }
  progressLogsBuffer.get(threadId).push(a2aLog);
  
  socket.emit('processing_progress', a2aLog);
  console.log(`🔄 A2A Progress (${userLanguage}): ${fromAgent} → ${toAgent} (${operation})`);
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
        // PHASE 0: Quick language detection for log translation
      console.log(`🌍 Quick language detection for log translation...`);
      const quickDetectedLanguage = await quickDetectLanguage(message);
      userLanguageCache.set(threadId, quickDetectedLanguage);
      console.log(`✅ Quick detection: ${quickDetectedLanguage} (cached for logs)`);
      
      // Emit initial progress (now with correct language)
      await emitProgress(socket, threadId, 'received', { 
        message: 'Messaggio ricevuto, avvio elaborazione...',
        userQuery: message 
      });
      
      // Add user message to conversation history
      addToConversationHistory(threadId, 'human', message);
      
      // Get conversation history
      const conversationHistory = getConversationHistory(threadId);
      console.log(`📜 Loading conversation history for ${threadId}: ${conversationHistory.length} messages`);
      
      // Emit language detection progress
      await emitProgress(socket, threadId, 'language_detection', { 
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
      await emitProgress(socket, threadId, 'orchestrator_start', { 
        message: 'Avvio orchestratore intelligente...' 
      });
      
      // Add a small delay to make progress visible
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Emit language processing step
      await emitProgress(socket, threadId, 'language_processing', { 
        message: 'Analisi linguistica del messaggio...' 
      });
      
      // Add another small delay
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Emit agent selection step
      await emitProgress(socket, threadId, 'agent_routing', { 
        message: 'Selezione agente specializzato...' 
      });
      
      // Run orchestrator with conversation history
      console.log(`🚀 Starting orchestrator for message: "${message}" with ${existingMessages.length} previous messages`);
      const result = await runOrchestration(message, threadId, existingMessages);
      console.log(`✅ Orchestrator completed, result:`, result);
      
      // Emit agent selection progress
      const selectedAgent = result.selectedAgent || 'unknown';
      const agentNames = {
        'mcp_agent': 'Agente MCP (Dati Aziendali)',
        'general_agent': 'Agente Generale',
        'language_agent': 'Agente Linguistico'
      };
        await emitProgress(socket, threadId, 'agent_selected', { 
        message: `Agente selezionato: ${agentNames[selectedAgent] || selectedAgent}`,
        agent: selectedAgent
      });
      
      // Add delay to show agent execution
      await new Promise(resolve => setTimeout(resolve, 400));
      
      // Emit processing step
      await emitProgress(socket, threadId, 'agent_executing', { 
        message: 'Elaborazione richiesta in corso...',
        agent: selectedAgent
      });
      
      // Add another delay for processing visualization
      await new Promise(resolve => setTimeout(resolve, 600));
        // Emit completion progress
      await emitProgress(socket, threadId, 'processing_complete', { 
        message: 'Elaborazione completata!'
      });
        // Add AI response to conversation history
      const aiResponse = result.finalAnswer || result.finalResponse || result.messages?.[result.messages.length - 1]?.content || 'Nessuna risposta disponibile';
      addToConversationHistory(threadId, 'ai', aiResponse);
        // PHASE 1: Detect language from agent response for verification/correction
      let finalDetectedLanguage = quickDetectedLanguage; // Use quick detection as base
      
      try {
        console.log(`🌍 Verifying language from agent response...`);
        const responseDetectedLanguage = await detectLanguageFromResponse(aiResponse);
        if (responseDetectedLanguage !== quickDetectedLanguage) {
          console.log(`🔄 Language correction: ${quickDetectedLanguage} → ${responseDetectedLanguage}`);
          finalDetectedLanguage = responseDetectedLanguage;
        }
        console.log(`✅ Final language: ${finalDetectedLanguage}`);
      } catch (error) {
        console.error('❌ Error verifying language:', error);
      }
        
      // PHASE 2: Get A2A logs and merge with progress logs
      let allTranslatedLogs = [];
      
      if (progressLogsBuffer.has(threadId)) {
        const allLogs = progressLogsBuffer.get(threadId);
        console.log(`� Collected ${allLogs.length} progress logs for final response`);
        allTranslatedLogs = allLogs; // Already translated in real-time
        
        // Clean up buffer
        progressLogsBuffer.delete(threadId);
      }
      
      // PHASE 3: Get A2A logs and add them
      try {
        const rawA2ALogs = a2aLogger.getLogsForThread(threadId);
        if (rawA2ALogs.length > 0) {
          console.log(`📊 Adding ${rawA2ALogs.length} A2A logs`);
          allTranslatedLogs = [...allTranslatedLogs, ...rawA2ALogs];
        }
        
        // Clean up A2A logs for this thread
        a2aLogger.clearLogsForThread(threadId);
      } catch (error) {
        console.error('❌ Error processing A2A logs:', error);
      }
      
      // Sort all logs by timestamp
      allTranslatedLogs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        console.log(`✅ Final log summary: ${allTranslatedLogs.length} total logs in ${finalDetectedLanguage}`);
      
      // Clean up language cache for this thread
      userLanguageCache.delete(threadId);
      
      // Emit response with all logs
      socket.emit('agent_response', {
        response: aiResponse,
        result: result,
        detectedLanguage: finalDetectedLanguage,
        translatedLogs: allTranslatedLogs, // Include all logs (progress + A2A)
        a2aStats: a2aLogger.getStats(threadId), // Include A2A statistics
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
