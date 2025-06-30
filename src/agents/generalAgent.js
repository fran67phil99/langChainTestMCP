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
    
    // Filter and convert conversation history to valid LangChain messages
    const validMessages = messages.slice(0, -1).filter(msg => 
      msg && (msg.constructor.name === 'HumanMessage' || msg.constructor.name === 'AIMessage')
    );
    
    // Use LLM to handle general questions WITH conversation history
    const llmMessages = [
      ...validMessages, // Include only valid previous conversation history
      new HumanMessage(`You are an intelligent and professional general AI assistant. ${validMessages.length > 0 ? `Based on our conversation history, the` : `The`} user asked this question: "${userMessage}"

Since this question does not require specific Mauden company data (employees, interns, etc.), provide a useful and comprehensive general response.

Guidelines:
- Be professional but friendly
- ${validMessages.length > 0 ? 'Take into account previous conversation context when relevant' : 'Provide comprehensive information for this new question'}
- Provide accurate and useful information
- Use appropriate emojis and Markdown formatting when relevant
- If the question requires specific information you don't have, politely explain your limitations
- If you think the user might be looking for Mauden company information, suggest being more specific
- Respond in English (the Language Agent will handle translation)
- Cover the topic comprehensively but concisely
- Provide actionable advice when appropriate
- ${validMessages.length > 0 ? 'Reference earlier discussion points if they help clarify the current question' : 'Start fresh with complete context'}

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
  console.log(`💬 General Agent: Processing query with conversation context and A2A data`);
  
  try {
    const userMessage = messages[messages.length - 1].content;
    const conversationHistory = messages.slice(-5); // Last 5 messages for context
    
    const contextString = conversationHistory.length > 1 
      ? `\n\nConversation Context:\n${conversationHistory.map(msg => `${msg.constructor.name}: ${msg.content}`).join('\n')}`
      : '';
    
    // Extract A2A context data if available
    let a2aDataString = '';
    if (context && Object.keys(context).length > 0) {
      console.log(`📊 General Agent: Using A2A context with ${Object.keys(context).length} data sources`);
      a2aDataString = '\n\nREAL DATA FROM PREVIOUS AGENTS:\n';
      for (const [key, value] of Object.entries(context)) {
        if (value && value.mcpData) {
          // Extract actual data from MCP results
          a2aDataString += `\n${key.toUpperCase()}:\n`;
          
          // Handle mcpData safely - check if it's an array
          const mcpDataArray = Array.isArray(value.mcpData) ? value.mcpData : [value.mcpData];
          
          for (const mcpResult of mcpDataArray) {
            if (mcpResult && mcpResult.success && mcpResult.data) {
              try {
                const parsedData = typeof mcpResult.data === 'string' ? JSON.parse(mcpResult.data) : mcpResult.data;
                a2aDataString += `- ${mcpResult.toolName || 'unknown_tool'}: ${JSON.stringify(parsedData, null, 2)}\n`;
              } catch (e) {
                a2aDataString += `- ${mcpResult.toolName || 'unknown_tool'}: ${mcpResult.data}\n`;
              }
            } else if (mcpResult) {
              // Handle non-standard mcpResult format
              a2aDataString += `- Data: ${JSON.stringify(mcpResult, null, 2)}\n`;
            }
          }
        } else {
          a2aDataString += `${key}: ${JSON.stringify(value, null, 2)}\n`;
        }
      }
    }
    
    const llmMessages = [
      new HumanMessage(`You are an intelligent and professional AI assistant for Mauden company with access to REAL company data.

Current Question: "${userMessage}"
${contextString}
${a2aDataString}

IMPORTANT INSTRUCTIONS:
${a2aDataString ? `- You have REAL DATA from Mauden company systems above. Use this specific data to answer the question.
- Provide detailed information based on the actual employee and intern data shown.
- List specific names, roles, ages, salaries, and other details from the real data.
- Organize the information clearly with proper formatting.
- Calculate statistics and insights from the actual data provided.
- DO NOT provide generic or hypothetical responses when you have real data.` : `- This appears to be a general knowledge question. Provide a comprehensive general response.`}

Formatting Guidelines:
- Use appropriate emojis and Markdown formatting for better readability
- Provide clear section headers when organizing data
- Include statistics and insights when relevant
- Maintain a professional but accessible tone
- Be thorough and informative
- Respond in English (translation handled separately)
- Don't reference internal systems or mention "tools" or "agents"

${a2aDataString ? 'Focus on providing a complete answer using ALL the real Mauden data available.' : 'Provide helpful general information on this topic.'}`)
    ];

    const llmResponse = await llm.invoke(llmMessages);
    
    return {
      finalResponse: llmResponse.content,
      success: true,
      llmElaborated: true,
      agent: 'general',
      contextAware: true,
      usedA2AData: a2aDataString.length > 0
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
