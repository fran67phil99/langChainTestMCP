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

// Funzione per routing intelligente basato sui tool MCP reali (COMPLETAMENTE DINAMICO)
async function intelligentMcpRouting(userInput, mcpTools) {
  const query = userInput.toLowerCase();
  
  // Cerca nei tool MCP reali per vedere se la query è correlata
  const relevantTools = mcpTools.filter(tool => {
    const toolName = tool.name.toLowerCase();
    const toolDescription = (tool.description || '').toLowerCase();
    const serverName = (tool.serverName || '').toLowerCase();
    
    // Cerca parole chiave nei nomi, descrizioni e server dei tool reali
    const queryWords = query.split(' ').filter(word => word.length > 2);
    
    return queryWords.some(word => 
      toolName.includes(word) || 
      toolDescription.includes(word) || 
      serverName.includes(word) ||
      word.includes(toolName.split('_')[0]) // Cerca parti del nome del tool
    );
  });
  
  if (relevantTools.length > 0) {
    console.log(`🎯 MCP Routing: Trovati ${relevantTools.length} tool rilevanti:`, 
               relevantTools.map(t => t.name));
    return 'mcp';
  }
  
  // Pattern per query generiche che NON richiedono MCP (molto conservativi)
  const generalPatterns = [
    /\b(ciao|hello|come stai|how are you|cosa puoi fare|help|aiuto)\b/i,
    /\b(spiegami|explain|dimmi|tell me)\s+(cos[aeì]|what|perch[eé]|why)\b/i,
    /\b(scrivi|write|crea|create|genera|generate)\s+(testo|text|articolo|article|poesia|poem)\b/i
  ];
  
  if (generalPatterns.some(pattern => pattern.test(query))) {
    console.log('🎯 General Routing: Pattern generico rilevato');
    return 'general';
  }
  
  // Se non è chiaro, analizza con LLM (per massima flessibilità)
  console.log('🤔 Ambiguous Routing: Richiede analisi LLM');
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
    // 1. Carica i tool MCP per fare routing intelligente
    console.log(`🛠️ Orchestrator: Loading MCP tools for intelligent routing...`);
    mcpTools = await getCachedMcpTools();
    console.log(`Loaded ${mcpTools.length} MCP tools (cached: ${mcpToolsCache.tools ? 'YES' : 'NO'})`);
    
    // 2. Routing intelligente basato sui tool MCP reali
    const routeDecision = await intelligentMcpRouting(englishQuery, mcpTools);
    
    if (routeDecision === 'mcp') {
      // Route diretto a MCP - i tool sono già stati caricati
      shouldUseMcp = true;
      console.log(`🎯 Orchestrator: Direct route to MCP Agent (relevant tools found)`);
    } else if (routeDecision === 'general') {
      // Route diretto a General Agent
      shouldUseMcp = false;
      console.log(`🎯 Orchestrator: Direct route to General Agent`);
    } else {
      // Caso ambiguo - usa analisi LLM completa
      console.log(`🤔 Orchestrator: Ambiguous query - using LLM analysis...`);
      shouldUseMcp = await shouldUseMcpAgent(englishQuery, mcpTools, existingMessages);
    }    // 3. Intelligent routing using specialized agents with conversation context
    console.log(`🚦 Orchestrator: Agent decision - MCP: ${shouldUseMcp}`);
    const selectedAgent = shouldUseMcp ? 'mcp_agent' : 'general_agent';
    console.log(`✅ Orchestrator: Selected ${selectedAgent} for query`);

    // 4. Prepare messages for the selected agent
    const messages = [
      ...existingMessages,
      new HumanMessage(englishQuery)
    ];

    // 5. Delegate to specialized agent
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
