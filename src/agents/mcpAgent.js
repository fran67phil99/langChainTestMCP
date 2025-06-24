// MCP Agent - Specialized agent for handling Mauden company data through MCP tools
const { HumanMessage } = require('@langchain/core/messages');
const { createTrackedLLM, logAgentActivity } = require('../utils/langsmithConfig');
const { runSqlSchemaAgent } = require('./sqlSchemaAgent');
const { runDataExplorerAgent } = require('./dataExplorerAgent');

// Initialize LLM for MCP data processing with LangSmith tracing
const llm = createTrackedLLM({
  modelName: "gpt-4o-mini",
  temperature: 0.7,
});

/**
 * Main MCP Agent function - handles company data queries through MCP tools
 * @param {Array} messages - Message history
 * @param {Object} selectedTool - The MCP tool to use
 * @param {string} userQuery - User's query in English
 * @param {string} threadId - Thread identifier
 * @param {Array} availableTools - All available tools for A2A communication
 * @returns {Promise<Object>} - MCP agent result with processed data
 */
async function runMcpAgent(messages, selectedTool, userQuery, threadId, availableTools = []) {
  console.log(`🔧 MCP Agent: Processing query with tool: ${selectedTool?.name}`);
  
  // Log MCP agent start
  logAgentActivity('mcp_agent', 'processing_start', {
    toolName: selectedTool?.name,
    userQuery,
    threadId
  });
  
  try {
    if (!selectedTool) {
      throw new Error('No suitable MCP tool found');
    }    // Check if this is a schema/table discovery query that should use A2A
    const isSchemaQuery = await isSchemaDiscoveryQuery(userQuery);
    const isDataQuery = await isDataSearchQuery(userQuery);
    
    if (isSchemaQuery && availableTools.length > 0) {
      console.log(`🤝 MCP Agent: Detected schema query, using A2A with SQL Schema Agent...`);
      
      try {
        // A2A Communication: Request schema from SQL Schema Agent
        const schemaRequest = {
          action: 'discover_schema',
          from: 'mcp_agent',
          threadId: threadId
        };
        
        const schemaResult = await runSqlSchemaAgent(schemaRequest, availableTools, threadId);
        
        if (schemaResult.success && schemaResult.schema) {
          console.log(`✅ MCP Agent: Got detailed schema via A2A`);
          
          // Format the schema response using LLM
          const schemaResponse = await formatSchemaResponse(userQuery, schemaResult.schema, messages);
          
          return {
            mcpData: schemaResult.schema,
            finalResponse: schemaResponse,
            toolUsed: `SQL Schema Agent (A2A)`,
            success: true,
            llmElaborated: true,
            agent: 'mcp',
            method: 'a2a_schema_discovery'
          };
        } else {
          console.log(`⚠️ MCP Agent: A2A schema discovery failed, falling back to direct MCP tool...`);
        }
      } catch (a2aError) {
        console.log(`⚠️ MCP Agent: A2A error (${a2aError.message}), falling back to direct MCP tool...`);
      }
    }
    
    if (isDataQuery && availableTools.length > 0) {
      console.log(`🤝 MCP Agent: Detected data search query, using A2A with Data Explorer Agent...`);
      
      try {
        // A2A Communication: Request data exploration
        const dataResult = await runDataExplorerAgent(messages, availableTools, userQuery, threadId);
        
        if (dataResult.success) {
          console.log(`✅ MCP Agent: Got data results via A2A`);
            return {
            mcpData: dataResult.data,
            finalResponse: dataResult.formattedResponse || dataResult.explanation || "Data exploration completed successfully",
            toolUsed: `Data Explorer Agent (A2A)`,
            success: true,
            llmElaborated: true,
            agent: 'mcp',
            method: 'a2a_data_exploration',
            queryUsed: dataResult.queryUsed
          };
        } else {
          console.log(`⚠️ MCP Agent: A2A data exploration failed, falling back to direct MCP tool...`);
        }
      } catch (a2aError) {
        console.log(`⚠️ MCP Agent: A2A data exploration error (${a2aError.message}), falling back to direct MCP tool...`);
      }
    }    // Fallback: Use direct MCP tool call
    console.log(`🔧 MCP Agent: Using direct MCP tool: ${selectedTool.name}`);
    const mcpData = await selectedTool.call({});
    console.log(`✅ MCP Agent: Tool executed successfully`);
    
    // Log successful tool execution
    logAgentActivity('mcp_agent', 'tool_executed', {
      toolName: selectedTool.name,
      dataReceived: true
    });// 2. Use LLM to elaborate the response based on raw data and user query
    // Filter and convert conversation history to valid LangChain messages
    const validMessages = messages.slice(0, -1).filter(msg => 
      msg && (msg.constructor.name === 'HumanMessage' || msg.constructor.name === 'AIMessage')
    );
    
    const llmMessages = [
      ...validMessages, // Include only valid conversation history
      new HumanMessage(`You are a professional business assistant for Mauden. The user asked: "${userQuery}"

I obtained this data from the MCP tool "${selectedTool.name}":
${JSON.stringify(mcpData, null, 2)}

Please provide a professional, comprehensive, and well-formatted response in English that answers the user's question using this data.

${validMessages.length > 0 ? 'IMPORTANT: Consider the conversation history above. If the user is asking about someone mentioned earlier (like asking "do you know someone with this name in Mauden?" after mentioning a specific person), focus specifically on that person in your response and provide their details from the data.' : ''}

Guidelines:
- Use appropriate emojis and Markdown formatting
- Provide statistics and insights when relevant
- Maintain a professional but accessible tone
- If the data contains employee information, provide useful analysis
- If it's about interns, highlight the training program
- For salary queries, provide detailed statistical analysis
- Include suggestions for related questions when appropriate
- Be concise but informative
- ${validMessages.length > 0 ? 'When referencing conversation context, be specific about which person or topic was discussed earlier' : ''}`)
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
  
  // Se non ci sono tool disponibili, non possiamo procedere
  if (!mcpTools || mcpTools.length === 0) {
    console.log(`❌ No MCP tools available for selection`);
    throw new Error('No MCP tools available');
  }
  
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
 * @param {Array} existingMessages - Conversation history
 * @returns {Promise<boolean>} - True if MCP agent should handle this query
 */
async function shouldUseMcpAgent(userQuery, mcpTools, existingMessages = []) {
  console.log(`🔍 MCP Agent: Checking if query requires company data...`);
  
  if (!mcpTools || mcpTools.length === 0) {
    return false;
  }

  try {
    const toolDescriptions = mcpTools.map(tool => 
      `Tool: ${tool.name}\nDescription: ${tool.description}`
    ).join('\n\n');
    
    const conversationContext = existingMessages.length > 0 
      ? `\n\nCONVERSATION HISTORY:\n${existingMessages.map(msg => `${msg._getType()}: ${msg.content}`).join('\n')}\n`
      : '';
    
    const checkMessages = [
      new HumanMessage(`You are an intelligent router for Mauden company queries. Determine if this user query requires accessing company-specific data through MCP tools.

USER QUERY: "${userQuery}"${conversationContext}

AVAILABLE MCP TOOLS:
${toolDescriptions}

ANALYSIS:
- Does this query ask for Mauden employee information?
- Does it ask for company data, statistics, or internal information?
- Does it ask about interns, salaries, roles, or staff?
- Does it ask for model information or company-specific data?
- ${existingMessages.length > 0 ? 'Based on the conversation history, is the user referring to someone mentioned earlier that might be found in company data?' : ''}

IMPORTANT: If the conversation history shows the user asked about a specific person, and now they\'re asking "do you know someone with this name in Mauden/company", this DEFINITELY requires MCP tools to search company data.

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

/**
 * Check if a query is about schema/table discovery
 * @param {string} userQuery - User's query in English
 * @returns {Promise<boolean>} - True if it's a schema query
 */
async function isSchemaDiscoveryQuery(userQuery) {
  const queryLower = userQuery.toLowerCase();
  
  // Generic patterns for schema/table discovery (multilingual support)
  const schemaPatterns = [
    'table', 'schema', 'column', 'structure', 'database',
    'what.*available', 'show.*table', 'list.*table', 'describe',
    'available.*data', 'data.*structure', 'field', 'metadata'
  ];
  
  return schemaPatterns.some(pattern => {
    const regex = new RegExp(pattern, 'i');
    return regex.test(queryLower);
  });
}

/**
 * Check if a query is about searching/filtering data
 * @param {string} userQuery - User's query in English
 * @returns {Promise<boolean>} - True if it's a data search query
 */
async function isDataSearchQuery(userQuery) {
  const queryLower = userQuery.toLowerCase();
  
  // Generic patterns for data search/filtering
  const dataSearchPatterns = [
    'find', 'search', 'filter', 'where', 'includes', 'contains',
    'show.*that', 'get.*where', 'all.*that', 'records.*with',
    'titles.*include', 'names.*contain', 'entries.*match',
    'list.*with', 'display.*containing', 'retrieve.*where'
  ];
  
  // If it's clearly a schema query, don't treat as data search
  const isSchema = await isSchemaDiscoveryQuery(userQuery);
  if (isSchema) return false;
  
  return dataSearchPatterns.some(pattern => {
    const regex = new RegExp(pattern, 'i');
    return regex.test(queryLower);
  });
}

/**
 * Format schema response using LLM for better presentation
 * @param {string} userQuery - Original user query
 * @param {Object} schema - Schema data from SQL Schema Agent
 * @param {Array} messages - Message history
 * @returns {Promise<string>} - Formatted response
 */
async function formatSchemaResponse(userQuery, schema, messages) {
  const validMessages = messages.slice(0, -1).filter(msg => 
    msg && (msg.constructor.name === 'HumanMessage' || msg.constructor.name === 'AIMessage')
  );
  
  const schemaInfo = {
    tables: schema.tables || [],
    totalTables: (schema.tables || []).length,
    detailed: schema.detailed || {},
    discoveryMethod: schema.discoveryMethod || 'unknown'
  };
  
  // Extract column information for better presentation
  const tablesWithDetails = [];
  for (const [tableName, tableInfo] of Object.entries(schemaInfo.detailed)) {
    tablesWithDetails.push({
      name: tableName,
      columnCount: tableInfo.columnCount || 'unknown',
      method: tableInfo.method || 'unknown',
      columnNames: tableInfo.columnNames || [],
      rowCount: tableInfo.rowCount || 'unknown'
    });
  }
  
  const llmMessages = [
    ...validMessages,
    new HumanMessage(`You are a professional database assistant. The user asked: "${userQuery}"

I discovered the database schema with detailed information:

SCHEMA DISCOVERY RESULT:
${JSON.stringify({ 
  ...schemaInfo, 
  tablesWithDetails 
}, null, 2)}

Please provide a comprehensive, well-formatted response that:
- Answers the user's specific question about tables/schema
- Uses appropriate emojis and Markdown formatting
- Shows table names, column counts, and other relevant details
- If column names are available, show the first 10-15 column names as examples
- Provides insights about the data structure
- Suggests related questions the user might ask
- Maintains a professional but accessible tone
- Mentions the discovery method used if relevant

IMPORTANT: If you see many columns (like 77), emphasize that this is a rich dataset with comprehensive information, not just a simple table.`)
  ];

  const response = await llm.invoke(llmMessages);
  return response.content;
}

module.exports = {
  runMcpAgent,
  selectMcpTool,
  shouldUseMcpAgent
};
