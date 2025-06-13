// LangSmith Configuration and Utilities
// Configures LangSmith tracing for monitoring LLM calls across all agents

/**
 * Initialize LangSmith environment variables for tracing
 * This function should be called at the start of the application
 */
function initializeLangSmith() {
  // Set LangSmith environment variables from .env
  if (process.env.LANGCHAIN_TRACING_V2 === "true") {
    console.log('🔍 LangSmith: Tracing enabled');
    console.log(`📊 LangSmith: Project "${process.env.LANGCHAIN_PROJECT}"`);
    
    // Ensure all required environment variables are set
    const requiredVars = [
      'LANGCHAIN_API_KEY',
      'LANGCHAIN_ENDPOINT', 
      'LANGCHAIN_PROJECT'
    ];
    
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.warn(`⚠️ LangSmith: Missing environment variables: ${missingVars.join(', ')}`);
      console.warn('⚠️ LangSmith: Tracing may not work properly');
    }
  } else {
    console.log('❌ LangSmith: Tracing disabled (LANGCHAIN_TRACING_V2 not set to "true")');
  }
}

/**
 * Create a configured ChatOpenAI instance with LangSmith tracing
 * @param {Object} options - OpenAI configuration options
 * @returns {ChatOpenAI} - Configured ChatOpenAI instance with tracing
 */
function createTrackedLLM(options = {}) {
  const { ChatOpenAI } = require('@langchain/openai');
  
  const defaultOptions = {
    modelName: "gpt-3.5-turbo",
    temperature: 0.7,
    openAIApiKey: process.env.OPENAI_API_KEY,
    // LangSmith tracing is automatically enabled when LANGCHAIN_TRACING_V2="true"
  };
  
  const mergedOptions = { ...defaultOptions, ...options };
  
  if (process.env.LANGCHAIN_TRACING_V2 === "true") {
    console.log(`🔍 LangSmith: Creating tracked LLM with model ${mergedOptions.modelName}`);
  }
  
  return new ChatOpenAI(mergedOptions);
}

/**
 * Add custom metadata to LangSmith traces
 * @param {Object} metadata - Custom metadata to add to traces
 */
function addTraceMetadata(metadata) {
  if (process.env.LANGCHAIN_TRACING_V2 === "true") {
    // This would typically be handled by LangSmith automatically
    // but we can log for debugging
    console.log('🏷️ LangSmith: Adding trace metadata:', metadata);
  }
}

/**
 * Log agent activity for LangSmith monitoring
 * @param {string} agentName - Name of the agent
 * @param {string} action - Action being performed
 * @param {Object} context - Additional context
 */
function logAgentActivity(agentName, action, context = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    agent: agentName,
    action,
    ...context
  };
  
  if (process.env.LANGCHAIN_TRACING_V2 === "true") {
    console.log(`📋 LangSmith [${agentName}]: ${action}`, context);
  }
  
  return logEntry;
}

module.exports = {
  initializeLangSmith,
  createTrackedLLM,
  addTraceMetadata,
  logAgentActivity
};
