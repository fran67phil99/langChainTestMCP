// MCP Agent - Specialized agent for handling Mauden company data through MCP tools
const { HumanMessage } = require('@langchain/core/messages');
const { ChatOpenAI } = require('@langchain/openai');

// Initialize LLM for MCP data processing
const llm = new ChatOpenAI({
  modelName: "gpt-3.5-turbo",
  temperature: 0.7,
  openAIApiKey: process.env.OPENAI_API_KEY
});

/**
 * Main MCP Agent function - handles company data queries through MCP tools
 * @param {Array} messages - Message history
 * @param {Object} selectedTool - The MCP tool to use
 * @param {string} userQuery - User's query in English
 * @param {string} threadId - Thread identifier
 * @returns {Promise<Object>} - MCP agent result with processed data
 */
async function runMcpAgent(messages, selectedTool, userQuery, threadId) {
  console.log(`🔧 MCP Agent: Processing query with tool: ${selectedTool?.name}`);
  
  try {
    if (!selectedTool) {
      throw new Error('No suitable MCP tool found');
    }

    // 1. Call the MCP tool to get raw data
    const mcpData = await selectedTool.call({});
    console.log(`✅ MCP Agent: Tool executed successfully`);
    
    // 2. Use LLM to elaborate the response based on raw data and user query
    const llmMessages = [
      new HumanMessage(`You are a professional business assistant for Mauden. A user asked: "${userQuery}"

I obtained this data from the MCP tool "${selectedTool.name}":
${JSON.stringify(mcpData, null, 2)}

Please provide a professional, comprehensive, and well-formatted response in English that answers the user's question using this data.

Guidelines:
- Use appropriate emojis and Markdown formatting
- Provide statistics and insights when relevant
- Maintain a professional but accessible tone
- If the data contains employee information, provide useful analysis
- If it's about interns, highlight the training program
- For salary queries, provide detailed statistical analysis
- Include suggestions for related questions when appropriate
- Be concise but informative`)
    ];

    const llmResponse = await llm.invoke(llmMessages);
    
    return {
      mcpData: mcpData,
      finalResponse: llmResponse.content,
      toolUsed: selectedTool.name,
      success: true,
      llmElaborated: true,
      agent: 'mcp'
    };
    
  } catch (error) {
    console.error(`❌ MCP Agent Error:`, error);
    return {
      error: error.message,
      finalResponse: `I'm sorry, I cannot access the requested data. Error: ${error.message}`,
      success: false,
      agent: 'mcp'
    };
  }
}

/**
 * Intelligent MCP tool selection using LLM
 * @param {string} userInput - User's query in English
 * @param {Array} mcpTools - Available MCP tools
 * @returns {Promise<Object>} - Selected MCP tool
 */
async function selectMcpTool(userInput, mcpTools) {
  console.log(`🤖 MCP Agent Tool Selector: Selecting best tool for query...`);
  
  try {
    // Let LLM decide which tool to use based on user query and tool descriptions
    const toolDescriptions = mcpTools.map((tool, index) => 
      `${index + 1}. Tool: ${tool.name}\n   Description: ${tool.description}`
    ).join('\n\n');
    
    const selectionMessages = [
      new HumanMessage(`You are an intelligent MCP tool selector for Mauden company data. You must choose the most appropriate tool to answer the user's question.

USER QUERY: "${userInput}"

AVAILABLE TOOLS:
${toolDescriptions}

INSTRUCTIONS:
- Analyze the user's question and choose the most appropriate tool
- Respond ONLY with the tool number (1, 2, 3, etc.)
- If unsure, choose the tool that seems closest to the query topic
- Consider: employees data, interns data, models data

RESPONSE (number only):`)
    ];

    const selectionResponse = await llm.invoke(selectionMessages);
    const toolNumber = parseInt(selectionResponse.content.trim()) - 1;
    
    if (toolNumber >= 0 && toolNumber < mcpTools.length) {
      const selectedTool = mcpTools[toolNumber];
      console.log(`🔧 MCP Agent: Selected ${selectedTool.name} based on intelligent analysis`);
      return selectedTool;
    } else {
      console.log(`🔧 MCP Agent: Invalid selection, using first available tool: ${mcpTools[0]?.name}`);
      return mcpTools[0];
    }
    
  } catch (error) {
    console.error(`❌ MCP Tool Selector Error:`, error);
    console.log(`🔧 Fallback: Using first available tool: ${mcpTools[0]?.name}`);
    return mcpTools[0];
  }
}

/**
 * Check if a query should be handled by MCP Agent
 * @param {string} userQuery - User's query in English
 * @param {Array} mcpTools - Available MCP tools
 * @returns {Promise<boolean>} - True if MCP agent should handle this query
 */
async function shouldUseMcpAgent(userQuery, mcpTools) {
  console.log(`🔍 MCP Agent: Checking if query requires company data...`);
  
  if (!mcpTools || mcpTools.length === 0) {
    return false;
  }
  
  try {
    const toolDescriptions = mcpTools.map(tool => 
      `Tool: ${tool.name}\nDescription: ${tool.description}`
    ).join('\n\n');
    
    const checkMessages = [
      new HumanMessage(`You are an intelligent router for Mauden company queries. Determine if this user query requires accessing company-specific data through MCP tools.

USER QUERY: "${userQuery}"

AVAILABLE MCP TOOLS:
${toolDescriptions}

ANALYSIS:
- Does this query ask for Mauden employee information?
- Does it ask for company data, statistics, or internal information?
- Does it ask about interns, salaries, roles, or staff?
- Does it ask for model information or company-specific data?

Respond with ONLY "true" if the query requires MCP tools, or "false" if it's a general question.`)
    ];

    const response = await llm.invoke(checkMessages);
    const shouldUse = response.content.trim().toLowerCase() === 'true';
    
    console.log(`🎯 MCP Agent routing decision: ${shouldUse ? 'USE MCP' : 'USE GENERAL'}`);
    return shouldUse;
    
  } catch (error) {
    console.error(`❌ MCP Agent routing error:`, error);
    return false; // Default to general agent on error
  }
}

module.exports = {
  runMcpAgent,
  selectMcpTool,
  shouldUseMcpAgent
};
