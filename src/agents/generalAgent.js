// General Agent - Specialized agent for handling general knowledge and non-company queries
const { HumanMessage } = require('@langchain/core/messages');
const { createTrackedLLM, logAgentActivity } = require('../utils/langsmithConfig');

// Initialize LLM for general knowledge processing with LangSmith tracing
const llm = createTrackedLLM({
  modelName: "gpt-3.5-turbo",
  temperature: 0.7,
});

/**
 * Main General Agent function - handles general knowledge queries
 * @param {Array} messages - Message history
 * @param {string} threadId - Thread identifier
 * @returns {Promise<Object>} - General agent result
 */
async function runGeneralAgent(messages, threadId) {
  console.log(`💬 General Agent: Processing general knowledge query`);
  
  try {
    const userMessage = messages[messages.length - 1].content;
    
    // Use LLM to handle general questions
    const llmMessages = [
      new HumanMessage(`You are an intelligent and professional general AI assistant. A user asked this question: "${userMessage}"

Since this question does not require specific Mauden company data (employees, interns, etc.), provide a useful and comprehensive general response.

Guidelines:
- Be professional but friendly
- Provide accurate and useful information
- Use appropriate emojis and Markdown formatting when relevant
- If the question requires specific information you don't have, politely explain your limitations
- If you think the user might be looking for Mauden company information, suggest being more specific
- Respond in English (the Language Agent will handle translation)
- Cover the topic comprehensively but concisely
- Provide actionable advice when appropriate

Your response should be complete and direct, without references to "tools" or underlying technical systems.`)
    ];

    const llmResponse = await llm.invoke(llmMessages);
    
    return {
      finalResponse: llmResponse.content,
      success: true,
      llmElaborated: true,
      agent: 'general'
    };
    
  } catch (error) {
    console.error(`❌ General Agent Error:`, error);
    return {
      error: error.message,
      finalResponse: `I'm sorry, an error occurred while processing your general question. Error: ${error.message}`,
      success: false,
      agent: 'general'
    };
  }
}

/**
 * Enhanced general agent with conversation context
 * @param {Array} messages - Full message history
 * @param {string} threadId - Thread identifier
 * @param {Object} context - Additional context if available
 * @returns {Promise<Object>} - General agent result with context awareness
 */
async function runGeneralAgentWithContext(messages, threadId, context = {}) {
  console.log(`💬 General Agent: Processing query with conversation context`);
  
  try {
    const userMessage = messages[messages.length - 1].content;
    const conversationHistory = messages.slice(-5); // Last 5 messages for context
    
    const contextString = conversationHistory.length > 1 
      ? `\n\nConversation Context:\n${conversationHistory.map(msg => `${msg.constructor.name}: ${msg.content}`).join('\n')}`
      : '';
    
    const llmMessages = [
      new HumanMessage(`You are an intelligent and professional general AI assistant with conversation awareness.

Current Question: "${userMessage}"
${contextString}

Provide a comprehensive response that:
- Addresses the current question directly
- Takes into account any conversation context if relevant
- Maintains professional but friendly tone
- Uses appropriate emojis and Markdown formatting
- Provides practical and actionable information
- Explains limitations when appropriate
- Suggests related topics or questions when helpful

Guidelines:
- Be thorough but concise
- Respond in English (translation handled separately)
- Don't reference internal systems or tools
- Focus on providing value to the user`)
    ];

    const llmResponse = await llm.invoke(llmMessages);
    
    return {
      finalResponse: llmResponse.content,
      success: true,
      llmElaborated: true,
      agent: 'general',
      contextAware: true
    };
    
  } catch (error) {
    console.error(`❌ General Agent with Context Error:`, error);
    return {
      error: error.message,
      finalResponse: `I'm sorry, an error occurred while processing your question. Error: ${error.message}`,
      success: false,
      agent: 'general'
    };
  }
}

/**
 * Check if a query should be handled by General Agent
 * @param {string} userQuery - User's query in English
 * @returns {Promise<boolean>} - True if general agent should handle this query
 */
async function shouldUseGeneralAgent(userQuery) {
  console.log(`🔍 General Agent: Checking if query is general knowledge...`);
  
  try {
    const checkMessages = [
      new HumanMessage(`Analyze this user query and determine if it's a general knowledge question that doesn't require access to specific company data.

USER QUERY: "${userQuery}"

Consider:
- Is this asking for general information, explanations, or advice?
- Is this a how-to question or educational query?
- Is this asking for definitions, concepts, or general knowledge?
- Does this NOT specifically ask for Mauden company data?

Examples of general queries:
- "What is artificial intelligence?"
- "How do I learn programming?"
- "Explain the benefits of exercise"
- "What's the weather like?" (though we can't provide real-time data)

Examples of company-specific queries:
- "How many employees work at Mauden?"
- "Who are the interns?"
- "Show me salary data"

Respond with ONLY "true" if this is a general knowledge query, or "false" if it requires company-specific data.`)
    ];

    const response = await llm.invoke(checkMessages);
    const shouldUse = response.content.trim().toLowerCase() === 'true';
    
    console.log(`🎯 General Agent routing decision: ${shouldUse ? 'USE GENERAL' : 'USE COMPANY DATA'}`);
    return shouldUse;
    
  } catch (error) {
    console.error(`❌ General Agent routing error:`, error);
    return true; // Default to general agent on error
  }
}

module.exports = {
  runGeneralAgent,
  runGeneralAgentWithContext,
  shouldUseGeneralAgent
};
