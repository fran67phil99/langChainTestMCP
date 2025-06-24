// Orchestrator Agent - Streamlined multilingual routing coordinator
const { HumanMessage, AIMessage } = require('@langchain/core/messages');
const { processWithLanguageSupport } = require('./languageAgent');
const { runMcpAgent, selectMcpTool, shouldUseMcpAgent } = require('./mcpAgent');
const { runGeneralAgent, shouldUseGeneralAgent } = require('./generalAgent');
const { runDataExplorerAgent } = require('./dataExplorerAgent');
const { initializeLangSmith, logAgentActivity } = require('../utils/langsmithConfig');

// Initialize LangSmith tracing
initializeLangSmith();

// Cache per i tool MCP per evitare discovery ripetuti
const mcpToolsCache = {
  tools: null,
  timestamp: null,
  ttl: 2 * 60 * 1000 // 2 minuti - ridotto per evitare ritardi
};

// Context tracking per conversazioni multi-turn
const conversationContext = {
  lastIntent: null,      // ultimo intent rilevato (weather, data_query, etc.)
  lastAgent: null,       // ultimo agente utilizzato
  lastTopic: null,       // ultimo argomento discusso
  lastLocation: null,    // ultima località menzionata
  timestamp: null,       // timestamp dell'ultimo messaggio
  contextTtl: 5 * 60 * 1000 // 5 minuti di TTL per il contesto
};

// Funzione per analizzare e aggiornare il contesto conversazionale
function analyzeAndUpdateContext(userInput, selectedAgent) {
  const query = userInput.toLowerCase();
  const now = Date.now();
  
  // Pulisci contesto scaduto
  if (conversationContext.timestamp && 
      (now - conversationContext.timestamp) > conversationContext.contextTtl) {
    console.log('🗑️ Context expired, clearing...');
    clearConversationContext();
  }
  
  // Rileva intent dalla query corrente
  let currentIntent = null;
  let currentTopic = null;
  let currentLocation = null;
  
  // Weather intent
  if (/\b(weather|tempo|meteo|clima|temperature|temperatura|rain|pioggia|sun|sole|cloudy|nuvoloso)\b/i.test(query)) {
    currentIntent = 'weather';
    currentTopic = 'weather';
    
    // Estrai località menzionata
    const locationMatch = query.match(/\b(in|a|at|to|per|di)\s+([a-zA-ZÀ-ÿ\s]{2,20})\b/i);
    if (locationMatch && locationMatch[2]) {
      currentLocation = locationMatch[2].trim();
    }
  }
  
  // Data exploration intent
  else if (/\b(find|search|show|data|database|table|query|cerca|trova|mostra|dati)\b/i.test(query)) {
    currentIntent = 'data_exploration';
    currentTopic = 'data';
  }
  
  // General conversation intent
  else if (/\b(hello|ciao|help|aiuto|explain|spiegami|what|cosa|how|come)\b/i.test(query)) {
    currentIntent = 'general';
    currentTopic = 'conversation';
  }
  
  // Aggiorna contesto
  conversationContext.lastIntent = currentIntent;
  conversationContext.lastAgent = selectedAgent;
  conversationContext.lastTopic = currentTopic;
  if (currentLocation) {
    conversationContext.lastLocation = currentLocation;
  }
  conversationContext.timestamp = now;
  
  console.log('📝 Context updated:', {
    intent: currentIntent,
    topic: currentTopic,
    location: currentLocation,
    agent: selectedAgent
  });
}

// Funzione per rilevare query di follow-up che richiedono contesto
function detectFollowUpQuery(userInput) {
  const query = userInput.toLowerCase().trim();
  
  // Pattern per follow-up impliciti (tipici in italiano)
  const followUpPatterns = [
    /^e\s+(a|in|per|di)\s+([a-zA-ZÀ-ÿ\s]{2,20})\??\s*$/i,  // "E a Roma?" "E per Milano?"
    /^e\s+(anche|also)\s+(a|in|per|di)\s+([a-zA-ZÀ-ÿ\s]{2,20})\??\s*$/i,  // "E anche a Roma?"
    /^(e|and)\s+(what\s+about|how\s+about)\s+([a-zA-ZÀ-ÿ\s]{2,20})\??\s*$/i,  // "And what about Paris?"
    /^(what\s+about|how\s+about|che\s+mi\s+dici\s+di)\s+([a-zA-ZÀ-ÿ\s]{2,20})\??\s*$/i,  // "What about London?"
    /^(anche|also)\s+(a|in|per|di)\s+([a-zA-ZÀ-ÿ\s]{2,20})\??\s*$/i,  // "Anche a Napoli?"
    /^[a-zA-ZÀ-ÿ\s]{2,20}\?\s*$/i,  // Solo nome località con punto interrogativo: "Senago?"
  ];
  
  for (const pattern of followUpPatterns) {
    const match = query.match(pattern);
    if (match) {
      // Estrai la località dalla query di follow-up
      const location = match[3] || match[2] || match[1]; // match[3] per "E anche a X", match[2] per "E a X"
      if (location && location.length > 1) {
        console.log(`🔗 Follow-up query detected for location: "${location}"`);
        return {
          isFollowUp: true,
          newLocation: location.trim(),
          originalQuery: query
        };
      }
    }
  }
  
  return { isFollowUp: false };
}

// Funzione per costruire query espansa con contesto
function expandQueryWithContext(userInput, followUpInfo) {
  if (!followUpInfo.isFollowUp) {
    return userInput;
  }
  
  const now = Date.now();
  const contextAge = now - (conversationContext.timestamp || 0);
  
  // Usa contesto solo se è recente
  if (contextAge > conversationContext.contextTtl) {
    console.log('⚠️ Context too old for follow-up, treating as new query');
    return userInput;
  }
  
  // Costruisci query espansa basata sul contesto precedente
  let expandedQuery = userInput;
  
  if (conversationContext.lastIntent === 'weather' && conversationContext.lastTopic === 'weather') {
    expandedQuery = `weather in ${followUpInfo.newLocation}`;
    console.log(`🔗 Expanded weather follow-up: "${userInput}" → "${expandedQuery}"`);
  }
  else if (conversationContext.lastIntent === 'data_exploration') {
    expandedQuery = `search data for ${followUpInfo.newLocation}`;
    console.log(`🔗 Expanded data follow-up: "${userInput}" → "${expandedQuery}"`);
  }
  else if (conversationContext.lastTopic) {
    expandedQuery = `${conversationContext.lastTopic} for ${followUpInfo.newLocation}`;
    console.log(`🔗 Expanded generic follow-up: "${userInput}" → "${expandedQuery}"`);
  }
  
  return expandedQuery;
}

// Funzione per pulire il contesto
function clearConversationContext() {
  conversationContext.lastIntent = null;
  conversationContext.lastAgent = null;
  conversationContext.lastTopic = null;
  conversationContext.lastLocation = null;
  conversationContext.timestamp = null;
}

// Funzione per routing intelligente basato sui tool MCP reali (COMPLETAMENTE DINAMICO)
async function intelligentMcpRouting(userInput, mcpTools) {
  const query = userInput.toLowerCase();
  
  // Prima controlla se l'utente sta chiedendo info sui tool disponibili
  const toolListPatterns = [
    /\b(che|what|quali|which)\s+(tool|strument|command|funzion)/i,
    /\b(tool|strument).+(disponibil|available|ho a disposizione)/i,
    /\b(lista|list|elenco).+(tool|strument)/i,
    /\b(docker|azure|aws|cloud).+(tool|strument|available|disponibil)/i,
    /\btools?\s+(have|available|disponibil)/i
  ];
  // PRIORITÀ 1: Se l'utente chiede info sui tool, sempre list_tools
  if (toolListPatterns.some(pattern => pattern.test(query))) {
    console.log('🔍 Tool List Request: L\'utente chiede informazioni sui tool disponibili');
    return 'list_tools';
  }
    // PRIORITÀ 2: Controlla se è una richiesta di data exploration (DINAMICO CON LLM)
  const shouldUseDataExplorerResult = await shouldUseDataExplorer(userInput, mcpTools);
  if (shouldUseDataExplorerResult) {
    console.log('🔍 Data Explorer Request: Richiesta di esplorazione dati rilevata (LLM analysis)');
    return 'data_explorer';
  }
    // PRIORITÀ 3: Solo se NON sta chiedendo info sui tool e NON è data exploration, cerca tool rilevanti per esecuzione
  const relevantTools = mcpTools.filter(tool => {
    const toolName = tool.name.toLowerCase();
    const toolDescription = (tool.description || '').toLowerCase();
    const serverName = (tool.serverName || '').toLowerCase();
    const query = userInput.toLowerCase();
    
    // Esclude match su parole troppo generiche che causano falsi positivi
    const genericWords = ['data', 'tool', 'server', 'get', 'list', 'info'];
    const queryWords = query.split(' ').filter(word => 
      word.length > 3 && !genericWords.includes(word)
    );
    
    // Richiede match più specifico: nome del tool o descrizione dettagliata
    return queryWords.some(word => 
      toolName.includes(word) || 
      (toolDescription.includes(word) && toolDescription.length > 20) || // Descrizione significativa
      serverName.includes(word) ||
      word.includes(toolName.split('_')[0]) // Cerca parti del nome del tool
    );
  });
  
  if (relevantTools.length > 0) {
    console.log(`🎯 MCP Routing: Trovati ${relevantTools.length} tool rilevanti:`, 
               relevantTools.map(t => t.name));
    return 'mcp';
  }
    // Pattern per query generiche che NON richiedono MCP (molto conservativi ma più ampi)
  const generalPatterns = [
    /\b(ciao|hello|come stai|how are you|cosa puoi fare|help|aiuto)\b/i,
    /\b(spiegami|explain|dimmi|tell me)\s+(cos[aeì]|what|perch[eé]|why)\b/i,
    /\b(scrivi|write|crea|create|genera|generate)\s+(testo|text|articolo|article|poesia|poem)\b/i,
    /\b(what can you do|cosa puoi fare|what are your capabilities|che cosa sai fare)\b/i,
    /\b(tell me a joke|racconta una barzelletta|make me laugh)\b/i,
    /\b(write a poem|scrivi una poesia|creative writing)\b/i,
    /\b(weather|tempo|meteo|clima)\b/i,
    /\b(explain.*AI|spiega.*AI|artificial intelligence|intelligenza artificiale)\b/i
  ];
  
  if (generalPatterns.some(pattern => pattern.test(query))) {
    console.log('🎯 General Routing: Pattern generico rilevato');
    return 'general';
  }
  
  // Se non è chiaro, analizza con LLM (per massima flessibilità)
  console.log('🤔 Ambiguous Routing: Richiede analisi LLM');
  return 'analyze';
}

// Funzione per generare la risposta con la lista dei tool disponibili
function generateToolListResponse(mcpTools, originalQuery) {
  const query = originalQuery.toLowerCase();
  
  // Filtra i tool in base alla query specifica
  let filteredTools = mcpTools;
  let categoryTitle = 'Tool MCP Disponibili';
  
  if (query.includes('docker')) {
    filteredTools = mcpTools.filter(tool => 
      tool.serverName.toLowerCase().includes('docker') ||
      tool.name.toLowerCase().includes('docker') ||
      (tool.description && tool.description.toLowerCase().includes('docker'))
    );
    categoryTitle = 'Tool Docker Disponibili';
  } else if (query.includes('azure')) {
    filteredTools = mcpTools.filter(tool => 
      tool.serverName.toLowerCase().includes('azure') ||
      tool.name.toLowerCase().includes('azure') ||
      (tool.description && tool.description.toLowerCase().includes('azure'))
    );
    categoryTitle = 'Tool Azure Disponibili';
  } else if (query.includes('aws')) {
    filteredTools = mcpTools.filter(tool => 
      tool.serverName.toLowerCase().includes('aws') ||
      tool.name.toLowerCase().includes('aws') ||
      (tool.description && tool.description.toLowerCase().includes('aws'))
    );
    categoryTitle = 'Tool AWS Disponibili';
  }
  
  if (filteredTools.length === 0) {
    return `🔍 **${categoryTitle}**\n\n❌ Non sono disponibili tool MCP per la categoria richiesta.\n\n📋 **Tool totali disponibili:** ${mcpTools.length}\n\nPer vedere tutti i tool disponibili, chiedi: "quali tool hai a disposizione?"`;
  }
  
  // Raggruppa per server
  const serverGroups = {};
  filteredTools.forEach(tool => {
    const serverName = tool.serverName || 'Unknown Server';
    if (!serverGroups[serverName]) {
      serverGroups[serverName] = [];
    }
    serverGroups[serverName].push(tool);
  });
  
  let response = `🔧 **${categoryTitle}**\n\n`;
  
  if (Object.keys(serverGroups).length === 1 && filteredTools.length === mcpTools.length) {
    // Mostra tutti i tool se non c'è filtro specifico
    response += `📊 **Totale tool disponibili:** ${mcpTools.length}\n\n`;
  }
  
  Object.entries(serverGroups).forEach(([serverName, tools]) => {
    response += `🖥️ **${serverName}** (${tools.length} tool${tools.length > 1 ? 's' : ''}):\n`;
    tools.forEach((tool, index) => {
      response += `   ${index + 1}. \`${tool.name}\``;
      if (tool.description) {
        response += ` - ${tool.description}`;
      }
      response += '\n';
    });
    response += '\n';
  });
  
  if (filteredTools.length !== mcpTools.length) {
    response += `💡 **Suggerimento:** Per vedere tutti i ${mcpTools.length} tool disponibili, chiedi: "quali tool hai a disposizione?"`;
  } else {
    response += `💡 **Suggerimento:** Puoi utilizzare questi tool per eseguire operazioni specifiche. Basta chiedere di eseguire un'azione e selezionerò automaticamente il tool più appropriato.`;
  }
  
  return response;
}

// Funzione per ottenere i tool MCP con caching ottimizzato
async function getCachedMcpTools() {
  const now = Date.now();
  
  // Controlla se la cache è valida E non vuota
  if (mcpToolsCache.tools && 
      Array.isArray(mcpToolsCache.tools) && 
      mcpToolsCache.tools.length > 0 &&
      mcpToolsCache.timestamp && 
      (now - mcpToolsCache.timestamp) < mcpToolsCache.ttl) {
    console.log(`📋 Using cached MCP tools (${mcpToolsCache.tools.length} tools)`);
    return mcpToolsCache.tools;
  }
  
  // Cache scaduta, vuota o non presente, ricarica con timeout
  if (mcpToolsCache.tools && mcpToolsCache.tools.length === 0) {
    console.log('⚠️ Cache is empty, forcing reload...');
  } else if (mcpToolsCache.timestamp && (now - mcpToolsCache.timestamp) >= mcpToolsCache.ttl) {
    console.log('⚠️ Cache is expired, reloading...');
  } else {
    console.log('🔄 Loading fresh MCP tools...');
  }
  
  const startTime = Date.now();
  
  try {
    const { getAllMcpTools } = require('../utils/mcpUtils.commonjs.js');
    
    // Set timeout per evitare attese eccessive
    const toolsPromise = getAllMcpTools();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('MCP tools loading timeout')), 15000) // 15 secondi max
    );
    
    const tools = await Promise.race([toolsPromise, timeoutPromise]);
    
    // Aggiorna cache
    mcpToolsCache.tools = tools;
    mcpToolsCache.timestamp = now;
    
    const loadTime = Date.now() - startTime;
    console.log(`✅ Cached ${tools.length} MCP tools in ${loadTime}ms`);
    return tools;
  } catch (error) {
    const loadTime = Date.now() - startTime;
    console.error(`❌ Error loading MCP tools (${loadTime}ms):`, error.message);
      // Se c'è un errore, usa la cache anche se scaduta SOLO se non è vuota
    if (mcpToolsCache.tools && mcpToolsCache.tools.length > 0) {
      console.log('⚠️ Using stale cache due to error');
      return mcpToolsCache.tools;
    }
    
    // Se non c'è cache o la cache è vuota, ritorna array vuoto per evitare crash
    console.log('⚠️ No valid cache available, returning empty tools array');
    // Invalida la cache vuota per forzare il reload al prossimo tentativo
    mcpToolsCache.tools = null;
    mcpToolsCache.timestamp = null;
    return [];
  }
}

// Funzione per riconoscere richieste di data exploration (DINAMICA CON LLM)
async function shouldUseDataExplorer(userInput, mcpTools) {
  const query = userInput.toLowerCase();
  
  // Solo check di base per query ovviamente conversazionali (molto conservativo)
  const obviousConversationalPatterns = [
    /^(hello|ciao|hi|good morning|buongiorno)$/i,
    /^(help|aiuto)$/i,
    /^(thanks|grazie|thank you)$/i
  ];
  
  // Se è chiaramente una semplice conversazione, evita data explorer
  if (obviousConversationalPatterns.some(pattern => pattern.test(query.trim()))) {
    console.log('🚫 Obvious conversational query: skipping data exploration analysis');
    return false;
  }

  // Verifica se ci sono tool di database disponibili
  const hasDataTools = mcpTools.some(tool => 
    tool.name.includes('database') || 
    tool.name.includes('sql') || 
    tool.name.includes('query') ||
    tool.name.includes('data') ||
    tool.name.includes('csv') ||
    tool.name.includes('table')
  );
  
  if (!hasDataTools) {
    console.log('🚫 No data tools available: skipping data exploration');
    return false;
  }

  // Usa LLM per determinare se la query richiede accesso ai dati
  console.log('🤔 Using LLM to analyze if query requires data exploration...');
  
  try {
    const { ChatOpenAI } = require('@langchain/openai');
    const { HumanMessage } = require('@langchain/core/messages');    const llm = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0
    });

    const analysisPrompt = `You are an expert system analyzer. Determine if the following user query requires access to a DATABASE or DATA EXPLORATION.

User Query: "${userInput}"

Available data tools: ${mcpTools.filter(tool => 
  tool.name.includes('database') || 
  tool.name.includes('sql') || 
  tool.name.includes('query') ||
  tool.name.includes('data') ||
  tool.name.includes('csv')
).map(tool => tool.name).join(', ')}

Answer with EXACTLY one of these options:
- YES: if the query asks for specific data, searches, database queries, table information, records, statistics from stored data
- NO: if the query is conversational, asks for general knowledge, weather, jokes, explanations, or doesn't need database access

Examples:
- "Which are all the universal titles that include Knight Rider?" → YES (needs database search)
- "What's the weather like?" → NO (general knowledge)
- "Show me the first 10 records" → YES (needs database access)
- "Tell me a joke" → NO (conversational)
- "How many employees do we have?" → YES (needs data query)
- "Explain how AI works" → NO (general explanation)

Answer: `;

    const response = await llm.invoke([new HumanMessage(analysisPrompt)]);
    const decision = response.content.trim().toUpperCase();
    
    const shouldUse = decision.startsWith('YES');
    
    console.log(`🎯 LLM Analysis: ${decision} → Data Explorer: ${shouldUse}`);
    
    return shouldUse;
    
  } catch (error) {
    console.error('❌ Error in LLM analysis for data exploration:', error.message);
    // Fallback: se c'è un errore, assume che potrebbe essere una query sui dati
    console.log('⚠️ Fallback: assuming query might need data exploration');
    return true;
  }
}

async function runOrchestratorOptimized(userInput, threadId, existingMessages = []) {
  console.log(`🚀 Modular Orchestrator: Starting multilingual routing for: "${userInput}"`);
  
  // 1. Rileva query di follow-up e espandi con contesto se necessario
  const followUpInfo = detectFollowUpQuery(userInput);
  const processedInput = expandQueryWithContext(userInput, followUpInfo);
  
  if (followUpInfo.isFollowUp && processedInput !== userInput) {
    console.log(`🔗 Follow-up detected and expanded: "${userInput}" → "${processedInput}"`);
  }
  
  // Log orchestrator activity for LangSmith
  logAgentActivity('orchestrator', 'routing_start', {
    userInput,
    processedInput,
    threadId,
    messageCount: existingMessages.length,
    isFollowUp: followUpInfo.isFollowUp
  });
  
  try {
    // Use Language Agent to handle multilingual processing
    const result = await processWithLanguageSupport(processedInput, async (englishQuery) => {
      return await processEnglishQuery(englishQuery, threadId, existingMessages, userInput);
    });
    
    // 2. Aggiorna contesto conversazionale dopo il processing
    analyzeAndUpdateContext(userInput, result.englishProcessing?.selectedAgent || 'unknown');
    
    // Log successful completion
    logAgentActivity('orchestrator', 'routing_completed', {
      originalLanguage: result.originalLanguage,
      selectedAgent: result.englishProcessing?.selectedAgent,
      success: true,
      wasFollowUp: followUpInfo.isFollowUp
    });
      // Return the final result with proper language handling
    return {
      messages: [...existingMessages, new HumanMessage(userInput), new AIMessage(result.finalResponse || "Operation completed successfully")],
      userQuery: userInput,
      processedQuery: processedInput,
      originalLanguage: result.originalLanguage,
      currentOrchestrationStep: 'completed',
      threadId: threadId,
      selectedAgent: result.englishProcessing?.selectedAgent,
      finalResponse: result.finalResponse,
      wasFollowUp: followUpInfo.isFollowUp
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
async function processEnglishQuery(englishQuery, threadId, existingMessages = [], originalUserInput = null) {
  console.log(`🔧 Orchestrator: Processing English query: "${englishQuery}"`);
  
  // Se originalUserInput è diverso da englishQuery, significa che è stata espansa per il contesto
  if (originalUserInput && originalUserInput !== englishQuery) {
    console.log(`🔗 Context-aware processing: Original="${originalUserInput}" → Expanded="${englishQuery}"`);
  }
  
  try {
    // 1. Carica i tool MCP per fare routing intelligente
    console.log(`🛠️ Orchestrator: Loading MCP tools for intelligent routing...`);
    mcpTools = await getCachedMcpTools();
    console.log(`Loaded ${mcpTools.length} MCP tools (cached: ${mcpToolsCache.tools ? 'YES' : 'NO'})`);
      // 2. Routing intelligente basato sui tool MCP reali
    const routeDecision = await intelligentMcpRouting(englishQuery, mcpTools);
      if (routeDecision === 'list_tools') {
      // Risposta diretta con la lista dei tool disponibili
      console.log(`🔍 Orchestrator: Generating tool list response`);
      const toolListResponse = generateToolListResponse(mcpTools, englishQuery);
      
      return {
        selectedAgent: 'tool_list',
        finalResponse: toolListResponse
      };
    } else if (routeDecision === 'data_explorer') {
      // Route al Data Explorer Agent
      console.log(`🔍 Orchestrator: Direct route to Data Explorer Agent`);
      
      const messages = [
        ...existingMessages,
        new HumanMessage(englishQuery)
      ];
      
      const dataExplorerResult = await runDataExplorerAgent(messages, mcpTools, englishQuery, threadId);
      
      return {
        selectedAgent: 'data_explorer',
        dataExplorerResult: dataExplorerResult,
        finalResponse: dataExplorerResult.formattedResponse || dataExplorerResult.error
      };
    } else if (routeDecision === 'mcp') {
      // Route diretto a MCP - i tool sono già stati caricati
      shouldUseMcp = true;
      console.log(`🎯 Orchestrator: Direct route to MCP Agent (relevant tools found)`);    } else if (routeDecision === 'general') {
      // Route diretto a General Agent
      shouldUseMcp = false;
      console.log(`🎯 Orchestrator: Direct route to General Agent`);    } else {
      // Caso ambiguo - usa analisi LLM completa
      console.log(`🤔 Orchestrator: Ambiguous query - using LLM analysis...`);
      shouldUseMcp = await shouldUseMcpAgent(englishQuery, mcpTools, existingMessages);
      
      // Se anche l'analisi MCP dice di non usare MCP, usa General Agent
      if (!shouldUseMcp) {
        console.log(`🎯 Orchestrator: LLM analysis suggests General Agent`);
        // Usa General Agent per query ambigue che non richiedono dati
      } else {
        console.log(`🎯 Orchestrator: LLM analysis suggests data exploration`);
        const messages = [
          ...existingMessages,
          new HumanMessage(englishQuery)
        ];
        
        const dataExplorerResult = await runDataExplorerAgent(messages, mcpTools, englishQuery, threadId);
        
        return {
          selectedAgent: 'data_explorer_ambiguous',
          dataExplorerResult: dataExplorerResult,
          finalResponse: dataExplorerResult.formattedResponse || dataExplorerResult.error
        };
      }
    }// 3. Intelligent routing using specialized agents with conversation context
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
      const mcpResult = await runMcpAgent(messages, selectedTool, englishQuery, threadId, mcpTools);
      
      return {
        selectedAgent: 'mcp_agent',
        mcpAgentResult: mcpResult,
        finalResponse: mcpResult.finalResponse
      };
        } else {
      // General Agent
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

module.exports = { 
  runOrchestratorOptimized,
  shouldUseDataExplorer  // Export per testing
};
