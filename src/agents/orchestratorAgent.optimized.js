// Orchestrator Agent - Streamlined multilingual routing coordinator
const { HumanMessage, AIMessage } = require('@langchain/core/messages');
const { processWithLanguageSupport } = require('./languageAgent');
const { runMcpAgent, selectMcpTool, shouldUseMcpAgent } = require('./mcpAgent');
const { runGeneralAgent, shouldUseGeneralAgent } = require('./generalAgent');
const { initializeLangSmith, logAgentActivity } = require('../utils/langsmithConfig');

// Initialize LangSmith tracing
initializeLangSmith();

// Cache per i tool MCP per evitare discovery ripetuti
const mcpToolsCache = {
  tools: null,
  timestamp: null,
  ttl: 5 * 60 * 1000 // 5 minuti
};

// Funzione per routing intelligente rapido dinamico
function quickRouteAgent(userInput) {
  const query = userInput.toLowerCase();
  
  // Carica pattern dinamici dalla configurazione MCP
  const { mcpConfigManager } = require('../utils/mcpConfig');
  const config = mcpConfigManager.loadConfig();
  const enabledServers = config.servers.filter(s => s.enabled);
  
  // Raccogli tutti i pattern dai server abilitati
  const mcpPatterns = [];
  enabledServers.forEach(server => {
    if (server.quick_route_patterns) {
      server.quick_route_patterns.forEach(pattern => {
        mcpPatterns.push(new RegExp(pattern, 'i'));
      });
    }
  });
  
  // Se matcha pattern di qualsiasi server MCP, vai diretto a MCP
  if (mcpPatterns.length > 0 && mcpPatterns.some(pattern => pattern.test(query))) {
    console.log('🎯 Quick Route: MCP Agent (pattern dinamico rilevato)');
    return 'mcp';
  }
  
  // Pattern per query generiche
  const generalPatterns = [
    /\b(ciao|hello|come stai|how are you|cosa puoi fare|help|aiuto)\b/i,
    /\b(spiegami|explain|dimmi|tell me|cos[aeì]|what|perch[eé]|why)\b/i,
    /\b(scrivi|write|crea|create|genera|generate)\b/i
  ];
  
  // Se matcha pattern generici, vai a General
  if (generalPatterns.some(pattern => pattern.test(query))) {
    console.log('🎯 Quick Route: General Agent (pattern generico rilevato)');
    return 'general';
  }
    // Caso ambiguo, richiede analisi LLM
  console.log('🤔 Quick Route: Ambiguous - richiede analisi LLM');
  return 'analyze';
}

// Funzione per ottenere i tool MCP con caching
async function getCachedMcpTools() {
  const now = Date.now();
  
  // Controlla se la cache è valida
  if (mcpToolsCache.tools && mcpToolsCache.timestamp && 
      (now - mcpToolsCache.timestamp) < mcpToolsCache.ttl) {
    console.log('📋 Using cached MCP tools');
    return mcpToolsCache.tools;
  }
  
  // Cache scaduta o non presente, ricarica
  console.log('🔄 Loading fresh MCP tools...');
  try {
    const { getAllMcpTools } = require('../utils/mcpUtils.commonjs.js');
    const tools = await getAllMcpTools();
    
    // Aggiorna cache
    mcpToolsCache.tools = tools;
    mcpToolsCache.timestamp = now;
    
    console.log(`✅ Cached ${tools.length} MCP tools`);
    return tools;
  } catch (error) {
    console.error('❌ Error loading MCP tools:', error);
    // Se c'è un errore, usa la cache anche se scaduta
    if (mcpToolsCache.tools) {
      console.log('⚠️ Using stale cache due to error');
      return mcpToolsCache.tools;
    }
    return [];
  }
}

async function runOrchestratorOptimized(userInput, threadId, existingMessages = []) {
  console.log(`🚀 Modular Orchestrator: Starting multilingual routing for: "${userInput}"`);
  
  // Log orchestrator activity for LangSmith
  logAgentActivity('orchestrator', 'routing_start', {
    userInput,
    threadId,
    messageCount: existingMessages.length
  });
  
  try {
    // Use Language Agent to handle multilingual processing
    const result = await processWithLanguageSupport(userInput, async (englishQuery) => {
      return await processEnglishQuery(englishQuery, threadId, existingMessages);
    });
    
    // Log successful completion
    logAgentActivity('orchestrator', 'routing_completed', {
      originalLanguage: result.originalLanguage,
      selectedAgent: result.selectedAgent,
      success: true
    });
    
    // Return the final result with proper language handling
    return {
      messages: [...existingMessages, new HumanMessage(userInput), new AIMessage(result.finalResponse)],
      userQuery: userInput,
      originalLanguage: result.originalLanguage,
      currentOrchestrationStep: 'completed',
      threadId: threadId,
      selectedAgent: result.englishProcessing.selectedAgent,
      finalResponse: result.finalResponse
    };
      } catch (error) {
    console.error('❌ Modular Orchestrator Error:', error);
    
    // Log error for LangSmith
    logAgentActivity('orchestrator', 'routing_error', {
      error: error.message,
      userInput,
      threadId,
      success: false
    });
    
    return {
      messages: [...existingMessages, new HumanMessage(userInput)],
      userQuery: userInput,
      currentOrchestrationStep: 'error',
      threadId: threadId,
      selectedAgent: 'error',
      error: error.message,
      finalResponse: `I'm sorry, an error occurred: ${error.message}`
    };
  }
}

// Streamlined English processing with modular agent delegation  
async function processEnglishQuery(englishQuery, threadId, existingMessages = []) {
  console.log(`🔧 Orchestrator: Processing English query: "${englishQuery}"`);
  
  try {
    // 1. Quick routing check per evitare chiamate costose quando possibile
    const quickRoute = quickRouteAgent(englishQuery);
    
    let shouldUseMcp = false;
    let mcpTools = [];
    
    if (quickRoute === 'mcp') {
      // Route diretto a MCP - carica solo se necessario
      shouldUseMcp = true;
      console.log(`🛠️ Orchestrator: Loading MCP tools for business query...`);
      mcpTools = await getCachedMcpTools();
      console.log(`Loaded ${mcpTools.length} MCP tools (cached: ${mcpToolsCache.tools ? 'YES' : 'NO'})`);
    } else if (quickRoute === 'general') {
      // Route diretto a General Agent
      shouldUseMcp = false;
      console.log(`🎯 Orchestrator: Direct route to General Agent`);
    } else {
      // Caso ambiguo - usa analisi LLM completa
      console.log(`🤔 Orchestrator: Ambiguous query - using LLM analysis...`);
      mcpTools = await getCachedMcpTools();
      shouldUseMcp = await shouldUseMcpAgent(englishQuery, mcpTools, existingMessages);
    }

    // 2. Intelligent routing using specialized agents with conversation context
    console.log(`🚦 Orchestrator: Agent decision - MCP: ${shouldUseMcp}`);
    const selectedAgent = shouldUseMcp ? 'mcp_agent' : 'general_agent';
    console.log(`✅ Orchestrator: Selected ${selectedAgent} for query`);

    // 3. Prepare messages for the selected agent
    const messages = [
      ...existingMessages,
      new HumanMessage(englishQuery)
    ];

    // 4. Delegate to specialized agent
    if (selectedAgent === 'mcp_agent') {
      console.log(`🔄 Orchestrator: Delegating to MCP Agent`);
      
      const selectedTool = await selectMcpTool(englishQuery, mcpTools);
      const mcpResult = await runMcpAgent(messages, selectedTool, englishQuery, threadId);
      
      return {
        selectedAgent: 'mcp_agent',
        mcpAgentResult: mcpResult,
        finalResponse: mcpResult.finalResponse
      };
      
    } else {
      console.log(`🔄 Orchestrator: Delegating to General Agent`);
      
      const generalResult = await runGeneralAgent(messages, threadId);
      
      return {
        selectedAgent: 'general_agent',
        generalAgentResult: generalResult,
        finalResponse: generalResult.finalResponse
      };
    }

  } catch (error) {
    console.error('❌ English Processing Error:', error);
    throw error;
  }
}

module.exports = { runOrchestratorOptimized };
