// Orchestrator Agent - Streamlined multilingual routing coordinator
const { HumanMessage, AIMessage } = require('@langchain/core/messages');
const { processWithLanguageSupport } = require('./languageAgent');
const { runMcpAgent, selectMcpTool, shouldUseMcpAgent } = require('./mcpAgent');
const { runGeneralAgent, shouldUseGeneralAgent } = require('./generalAgent');
const { initializeLangSmith, logAgentActivity } = require('../utils/langsmithConfig');

// Initialize LangSmith tracing
initializeLangSmith();

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
    // 1. Load MCP tools dynamically
    console.log(`🛠️ Orchestrator: Loading MCP tools...`);
    const { getAllMcpTools } = require('../utils/mcpUtils.commonjs.js');
    const mcpTools = await getAllMcpTools();
    console.log(`Loaded ${mcpTools.length} MCP tools with descriptions:`, 
      mcpTools.map(t => `${t.name}: ${t.description}`).join(', '));    // 2. Intelligent routing using specialized agents with conversation context
    console.log(`🚦 Orchestrator: Using intelligent agent routing...`);
    const shouldUseMcp = await shouldUseMcpAgent(englishQuery, mcpTools, existingMessages);
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
