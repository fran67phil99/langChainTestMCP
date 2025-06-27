// SQL Schema Agent - Specialized agent for database schema discovery and query generation
const { HumanMessage } = require('@langchain/core/messages');
const { createTrackedLLM, logAgentActivity } = require('../utils/langsmithConfig');
const { getGlobalMcpClient } = require('../utils/mcpUtils.commonjs');

// Initialize LLM for SQL operations with LangSmith tracing
const llm = createTrackedLLM({
  modelName: "gpt-4o-mini",
  temperature: 0.1, // Very low temperature for precise SQL generation
});

/**
 * SQL Schema Agent - Discovers database schema and generates appropriate queries
 * @param {Object} request - Agent-to-Agent request
 * @param {Array} availableTools - Available MCP tools
 * @param {string} threadId - Thread identifier
 * @returns {Promise<Object>} - SQL agent result
 */
async function runSqlSchemaAgent(request, availableTools, threadId) {
  console.log(`🗃️ SQL Schema Agent: Processing A2A request: ${request.action}`);
  console.log(`🔧 SQL Schema Agent: Received ${availableTools ? availableTools.length : 0} tools`);
  
  logAgentActivity('sql_schema_agent', 'a2a_request_start', {
    action: request.action,
    requestFrom: request.from,
    toolsReceived: availableTools ? availableTools.length : 0,
    threadId
  });
  
  try {
    switch (request.action) {
      case 'discover_schema':
        return await discoverDatabaseSchema(availableTools, threadId);
      
      case 'generate_query':
        return await generateOptimizedQuery(request.params, threadId);
      
      case 'validate_query':
        return await validateQuery(request.params, threadId);
      
      default:
        throw new Error(`Unsupported SQL action: ${request.action}`);
    }
    
  } catch (error) {
    console.error(`❌ SQL Schema Agent error: ${error.message}`);
    
    logAgentActivity('sql_schema_agent', 'a2a_error', {
      error: error.message,
      action: request.action,
      threadId
    });
    
    return {
      success: false,
      agent: 'sql_schema',
      error: error.message,
      action: request.action
    };
  }
}

/**
 * Discovers the actual database schema using MCP tools
 */
async function discoverDatabaseSchema(availableTools, threadId) {
  console.log(`🔍 SQL Schema Agent: Discovering database schema...`);
  console.log(`🔧 Available tools: ${availableTools.map(t => t.name).join(', ')}`);
    try {
    // Use LLM to intelligently identify table listing tools
    const listTablesTool = await findTableListingTool(availableTools);
      if (listTablesTool) {
      console.log(`🔧 Using MCP tool: ${listTablesTool.name} for schema discovery`);
      try {
        // Use the global MCP client to call the tool
        const mcpClient = getGlobalMcpClient();
        
        // Find the complete server config for this tool
        // Since we know this server works (we found its tools), construct the config
        const serverConfig = {
          id: listTablesTool.serverId,
          name: listTablesTool.serverName || listTablesTool.serverId,
          url: "http://localhost:5009", // Known working endpoint for mauden_sql_server
          mcp_endpoint: "/mcp", // Correct MCP endpoint
          enabled: true,
          timeout: 30000
        };
        
        const tablesResult = await mcpClient.callTool(serverConfig, listTablesTool.name, {});
        console.log('📋 MCP tool result:', tablesResult);
        
        if (tablesResult && (Array.isArray(tablesResult) || typeof tablesResult === 'object')) {
          const tables = parseTablesFromMcpResult(tablesResult);
          console.log(`📋 Found tables via MCP tool: ${tables.join(', ')}`);
            // Get detailed schema for each table using database tool
          const dbTool = await findDatabaseTool(availableTools);
          const detailedSchema = dbTool ? await getDetailedSchema(tables, dbTool) : {};
          
          logAgentActivity('sql_schema_agent', 'schema_discovered', {
            tablesFound: tables.length,
            tables: tables,
            method: 'MCP list_tables tool',
            threadId
          });
          
          return {
            success: true,
            agent: 'sql_schema',
            action: 'discover_schema',
            schema: {
              tables: tables,
              detailed: detailedSchema,
              discoveryMethod: 'MCP list_tables tool'
            },
            tool: listTablesTool.name
          };
        }
      } catch (error) {
        console.log(`⚠️ MCP table listing tool failed: ${error.message}, trying SQL queries...`);
      }
    }
      // Fallback: Find database tools and try intelligent SQL schema discovery
    const dbTool = await findDatabaseTool(availableTools);
    if (!dbTool) {
      throw new Error('No database tools available for schema discovery');
    }

    // Use LLM to determine appropriate schema discovery queries based on the tool description
    const schemaResult = await discoverSchemaIntelligently(dbTool);
    
    if (!schemaResult.success) {
      throw new Error('Unable to discover database schema with intelligent methods');
    }
    
    console.log(`✅ Schema discovery successful with intelligent method`);
    
    // Parse table names from result
    const tables = parseTableNames(schemaResult.data);
    console.log(`📋 Found tables: ${tables.join(', ')}`);
    
    // Get detailed schema for each table
    const detailedSchema = await getDetailedSchema(tables, dbTool);
    
    logAgentActivity('sql_schema_agent', 'schema_discovered', {
      tablesFound: tables.length,
      tables: tables,
      method: 'intelligent_llm_based',
      threadId
    });
    
    return {
      success: true,
      agent: 'sql_schema',
      action: 'discover_schema',
      schema: {
        tables: tables,
        detailed: detailedSchema,
        discoveryMethod: 'intelligent_llm_based'
      },
      tool: dbTool.name
    };
    
  } catch (error) {
    throw new Error(`Schema discovery failed: ${error.message}`);
  }
}

/**
 * Generates optimized SQL query based on schema and user intent
 */
async function generateOptimizedQuery(params, threadId) {
  console.log(`📝 SQL Schema Agent: Generating optimized query...`);
    const { userIntent, schema, operation } = params;
  
  // Extract detailed column information from schema
  let columnsInfo = '';
  if (schema.detailed) {
    for (const [tableName, tableInfo] of Object.entries(schema.detailed)) {
      if (tableInfo.columnNames && tableInfo.columnNames.length > 0) {
        columnsInfo += `\nTable: ${tableName}\nColumns: ${tableInfo.columnNames.join(', ')}\n`;
      }
    }
  }
  const queryPrompt = `You are a dynamic, schema-aware SQL generation engine. Your primary goal is to translate natural language user intent into a precise, optimized, and executable SQL query based on a dynamically provided database schema. You must not rely on hardcoded examples.\n\n**Core Mission:** Generate a valid SQL query by reasoning from user intent and the provided schema, not by matching patterns from a fixed list of examples.\n\n**Database Schema (Dynamically Provided):**\n${JSON.stringify(schema, null, 2)}\n\n**Available Columns (Dynamically Provided):**\n${columnsInfo}\n\n**User Request Analysis:**\n- **User Intent:** \"${userIntent}\"\n- **Operation Type:** ${operation.type}\n- **Operation Parameters:** ${JSON.stringify(operation.parameters)}\n\n**4-Step Reasoning Process:**\n\n**Step 1: Deconstruct User Intent**\n- Identify the core **operation**: Is the user asking to \`COUNT\` (how many, quanti), \`LIST DISTINCT\` (what/which titles/products, che/quali titoli/prodotti), \`SEARCH\` for specific records (find, search, trova, cerca), or \`PREVIEW\` data (show me data, mostrami i dati)?\n- Identify the core **entity**: What is the subject of the question? (e.g., \"titles\", \"products\", \"sales\", \"records\").\n- Identify any **filters** or **conditions**: Are there any constraints like dates, statuses, or specific names? (e.g., \"Knight Rider\", \"last month\", \"status is active\").\n\n**Step 2: Map Intent to the Dynamic Schema**\n- **Map the entity to a table and column:** Look at the \`Available Columns\` and find the most semantically relevant column for the user's entity.\n    - If the user asks for \"titles\", and the schema has a \`Title\` or \`product_name\` column, use that.\n    - If the user asks for \"records\", use the primary table (e.g., \`dataset\`, \`products\`).\n- **Map filters to columns:** For each filter identified, find the corresponding column in the schema.\n\n**Step 3: Apply SQL Generation Rules**\n- **For SEARCH operations:**\n    - ALWAYS use the \`LIKE\` operator with wildcards (\`%\`) for any search on a text field (e.g., \`WHERE IdentifiedColumn LIKE '%FilterValue%'\`). This is the most critical rule for flexibility.\n    - NEVER use an exact match (\`=\`) for text fields unless the user provides a specific ID.\n    - Do NOT add a \`LIMIT\` clause unless the user explicitly asks for a \"preview\", \"sample\", or a specific number of records.\n- **For LIST DISTINCT operations:**\n    - Use \`SELECT DISTINCT MappedColumn FROM MappedTable\`.\n- **For COUNT operations:**\n    - Use \`SELECT COUNT(*)\` or \`COUNT(DISTINCT MappedColumn)\` from the mapped table.\n- **For PREVIEW operations:**\n    - Use \`SELECT * FROM MappedTable LIMIT 20\`.\n\n**Step 4: Construct the Final Query**\n- Assemble the query using the exact table and column names from the provided schema.\n- **CRITICAL: NEVER use hardcoded table or column names like \`dataset\` or \`Title\` in your reasoning.** Your reasoning must be based *only* on the schema provided in this request.\n- **CRITICAL: NEVER use placeholder values like 'start_date' or 'end_date'.** If a value for a filter is not present in the user intent, do not include that \`WHERE\` condition.\n\n**Final Output:**\nReturn only the generated SQL query. No explanations, no markdown.`;

  try {
    const response = await llm.invoke([new HumanMessage(queryPrompt)]);
    let sqlQuery = response.content.trim();// Clean up the response
    sqlQuery = sqlQuery.replace(/```sql\n?/g, '').replace(/```\n?/g, '').trim();
    
    // If query still contains generic placeholders, use LLM to fix them intelligently
    if (sqlQuery.includes('table_name') && schema.tables.length > 0) {
      sqlQuery = sqlQuery.replace(/table_name/g, schema.tables[0]);
    }
    
    console.log(`✅ Generated optimized query: ${sqlQuery}`);
    
    return {
      success: true,
      agent: 'sql_schema',
      action: 'generate_query',
      query: sqlQuery,
      basedOnSchema: schema.tables
    };
    
  } catch (error) {
    throw new Error(`Query generation failed: ${error.message}`);
  }
}

/**
 * Validates SQL query against schema
 */
async function validateQuery(params, threadId) {
  console.log(`✅ SQL Schema Agent: Validating query...`);
  
  const { query, schema } = params;
  
  // Basic validation logic
  const tables = schema.tables;
  const queryUpper = query.toUpperCase();
  
  // Check if query references existing tables
  const referencedTables = tables.filter(table => 
    queryUpper.includes(table.toUpperCase())
  );
  
  if (referencedTables.length === 0) {
    return {
      success: false,
      agent: 'sql_schema',
      action: 'validate_query',
      error: 'Query does not reference any existing tables',
      availableTables: tables
    };
  }
  
  return {
    success: true,
    agent: 'sql_schema',
    action: 'validate_query',
    query: query,
    referencedTables: referencedTables,
    valid: true
  };
}

/**
 * Helper functions - completely dynamic and LLM-based
 */

/**
 * Use LLM to intelligently find table listing tools
 */
async function findTableListingTool(availableTools) {
  if (availableTools.length === 0) return null;
  
  const toolAnalysisPrompt = `You are an expert at analyzing tools for database operations. 

Available tools:
${availableTools.map(tool => `- ${tool.name}: ${tool.description || 'No description'}`).join('\n')}

Identify which tool (if any) can list database tables or schema information. 
Consider tools that might:
- List tables in a database
- Show database schema
- Provide table metadata
- Execute SQL queries to discover tables

Respond with ONLY the exact tool name from the list above, or "NONE" if no suitable tool exists.
Do not include any other text or explanation.`;

  try {
    const response = await llm.invoke([new HumanMessage(toolAnalysisPrompt)]);
    const toolName = response.content.trim();
    
    if (toolName === 'NONE') {
      return null;
    }
    
    const selectedTool = availableTools.find(tool => tool.name === toolName);
    if (selectedTool) {
      console.log(`🎯 LLM selected table listing tool: ${selectedTool.name}`);
      return selectedTool;
    }
    
    return null;
  } catch (error) {
    console.log(`⚠️ LLM tool analysis failed: ${error.message}`);
    return null;
  }
}

/**
 * Use LLM to intelligently find database query tools
 */
async function findDatabaseTool(availableTools) {
  if (availableTools.length === 0) return null;
  
  const toolAnalysisPrompt = `You are an expert at analyzing tools for database operations.

Available tools:
${availableTools.map(tool => `- ${tool.name}: ${tool.description || 'No description'}`).join('\n')}

Identify which tool can execute SQL queries or database operations.
Consider tools that might:
- Execute SQL queries
- Query databases
- Run database commands
- Access database data

Respond with ONLY the exact tool name from the list above, or "NONE" if no suitable tool exists.
Do not include any other text or explanation.`;

  try {
    const response = await llm.invoke([new HumanMessage(toolAnalysisPrompt)]);
    const toolName = response.content.trim();
    
    if (toolName === 'NONE') {
      return null;
    }
    
    const selectedTool = availableTools.find(tool => tool.name === toolName);
    if (selectedTool) {
      console.log(`🎯 LLM selected database tool: ${selectedTool.name}`);
      return selectedTool;
    }
    
    return null;
  } catch (error) {
    console.log(`⚠️ LLM database tool analysis failed: ${error.message}`);
    return null;
  }
}

/**
 * Use LLM to intelligently discover database schema
 */
async function discoverSchemaIntelligently(dbTool) {
  const mcpClient = getGlobalMcpClient();
  
  // Find the complete server config for this tool
  // Since we know this server works (we found its tools), construct the config
  const dbToolConfig = {
    id: dbTool.serverId,
    name: dbTool.serverName || dbTool.serverId,
    url: "http://localhost:5009", // Known working endpoint for mauden_sql_server
    mcp_endpoint: "/mcp", // Correct MCP endpoint
    enabled: true,
    timeout: 30000
  };
  
  const schemaDiscoveryPrompt = `You are an expert database administrator. You need to discover the schema of a database using the available tool: ${dbTool.name}.

Tool description: ${dbTool.description || 'Database query tool'}

Generate a SQL query to list all tables in the database. This database could be any type (SQLite, MySQL, PostgreSQL, SQL Server, etc.).

IMPORTANT: Try the most common approaches in this order:
1. SQLite: SELECT name FROM sqlite_master WHERE type='table'
2. MySQL: SHOW TABLES  
3. PostgreSQL: SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
4. Generic: SELECT table_name FROM information_schema.tables

Start with SQLite syntax as it's very common in development environments.

Respond with ONLY the SQL query, no explanations or additional text.`;

  try {
    const response = await llm.invoke([new HumanMessage(schemaDiscoveryPrompt)]);
    const query = response.content.trim().replace(/```sql\n?/g, '').replace(/```\n?/g, '').trim();
    
    console.log(`🔍 LLM generated schema discovery query: ${query}`);
    
    // Try the LLM-generated query
    try {
      const result = await mcpClient.callTool(dbToolConfig, dbTool.name, { query });
      return { success: true, data: result, query: query };
    } catch (error) {
      console.log(`⚠️ LLM-generated query failed: ${error.message}`);
      
      // If first attempt fails, try SQLite approach specifically
      if (!query.toLowerCase().includes('sqlite_master')) {
        console.log(`🔄 Trying SQLite-specific approach...`);
        const sqliteQuery = "SELECT name FROM sqlite_master WHERE type='table'";
        
        try {
          const sqliteResult = await mcpClient.callTool(dbToolConfig, dbTool.name, { query: sqliteQuery });
          return { success: true, data: sqliteResult, query: sqliteQuery };
        } catch (sqliteError) {
          console.log(`⚠️ SQLite query also failed: ${sqliteError.message}`);
        }
      }
      
      // Ask LLM for alternative approach with error context
      const fallbackPrompt = `The query "${query}" failed with error: ${error.message}

This suggests the database might be SQLite. Generate an alternative SQL query to list tables.

For SQLite, use: SELECT name FROM sqlite_master WHERE type='table'
For other databases, try a different approach.

Respond with ONLY the SQL query, no explanations.`;

      const fallbackResponse = await llm.invoke([new HumanMessage(fallbackPrompt)]);
      const fallbackQuery = fallbackResponse.content.trim().replace(/```sql\n?/g, '').replace(/```\n?/g, '').trim();
      
      console.log(`🔍 LLM generated fallback query: ${fallbackQuery}`);
      
      try {
        const fallbackResult = await mcpClient.callTool(dbToolConfig, dbTool.name, { query: fallbackQuery });
        return { success: true, data: fallbackResult, query: fallbackQuery };
      } catch (fallbackError) {
        console.log(`⚠️ Fallback query also failed: ${fallbackError.message}`);
        return { success: false, error: fallbackError.message };
      }
    }
  } catch (error) {
    console.log(`⚠️ LLM schema discovery failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

function parseTablesFromMcpResult(mcpResult) {
  console.log(`🔍 Parsing MCP result for tables:`, mcpResult);
  
  // Handle MCP response format with content array
  if (mcpResult && mcpResult.content && Array.isArray(mcpResult.content)) {
    for (const contentItem of mcpResult.content) {
      if (contentItem.type === 'text' && contentItem.text) {
        try {
          const parsedData = JSON.parse(contentItem.text);
          console.log(`📋 Parsed JSON from MCP response:`, parsedData);
          
          // Handle the actual data structure from list_tables
          if (parsedData.success && parsedData.data && parsedData.data.tables) {
            const tables = parsedData.data.tables.map(table => table.name).filter(Boolean);
            console.log(`📋 Extracted table names:`, tables);
            return tables;
          }
          
          // Try to parse other possible structures
          return parseTablesFromMcpResult(parsedData);
        } catch (error) {
          console.log(`⚠️ Failed to parse JSON from MCP response: ${error.message}`);
          // Try to extract table names from the text directly
          const tableMatches = contentItem.text.match(/"name":\s*"([^"]+)"/g);
          if (tableMatches) {
            return tableMatches.map(match => match.match(/"name":\s*"([^"]+)"/)[1]);
          }
        }
      }
    }
  }
  
  // If it's an array, look for table names
  if (Array.isArray(mcpResult)) {
    return mcpResult.map(item => {
      if (typeof item === 'string') return item;
      if (item && item.name) return item.name;
      if (item && item.table_name) return item.table_name;
      if (item && item.tableName) return item.tableName;
      return null;
    }).filter(Boolean);
  }
  
  // If it's an object, look for table information
  if (typeof mcpResult === 'object' && mcpResult !== null) {
    // Check if it has a tables array
    if (mcpResult.tables && Array.isArray(mcpResult.tables)) {
      return mcpResult.tables.map(table => 
        typeof table === 'string' ? table : (table.name || table.table_name || table.tableName)
      ).filter(Boolean);
    }
    
    // Check for nested data structure
    if (mcpResult.data && mcpResult.data.tables && Array.isArray(mcpResult.data.tables)) {
      return mcpResult.data.tables.map(table => 
        typeof table === 'string' ? table : (table.name || table.table_name || table.tableName)
      ).filter(Boolean);
    }
    
    // Check if the object contains table information directly
    if (mcpResult.name) {
      return [mcpResult.name];
    }
    
    // Check for common response patterns
    if (mcpResult.result && Array.isArray(mcpResult.result)) {
      return parseTablesFromMcpResult(mcpResult.result);
    }
    
    // Try to extract from string values in the object
    const stringValues = Object.values(mcpResult).filter(val => typeof val === 'string');
    if (stringValues.length > 0) {
      // Look for potential table names in string values
      const potentialTables = stringValues.filter(str => 
        str.length > 0 && str.length < 100 && // Reasonable table name length
        /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(str) // Valid identifier pattern
      );
      if (potentialTables.length > 0) {
        return potentialTables;
      }
    }
  }
  
  // If it's a string response, try to extract identifiers
  if (typeof mcpResult === 'string') {
    // Look for SQL-like table names or identifiers
    const identifierMatches = mcpResult.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g);
    if (identifierMatches) {
      // Filter out common SQL keywords and keep potential table names
      const sqlKeywords = ['SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TABLE', 'DATABASE', 'INDEX', 'VIEW', 'SCHEMA', 'SUCCESS', 'TRUE', 'FALSE', 'NULL', 'DATA', 'TABLES', 'NAME', 'MESSAGE'];
      const potentialTables = identifierMatches.filter(match => 
        !sqlKeywords.includes(match.toUpperCase()) &&
        match.length > 2 && match.length < 64 // Reasonable length
      );
      return [...new Set(potentialTables)]; // Remove duplicates
    }
  }
  
  return [];
}

function parseTableNames(tablesResult) {
  console.log(`🔍 Parsing table names from result:`, tablesResult);
  
  // Handle MCP response format with content array
  if (tablesResult && tablesResult.content && Array.isArray(tablesResult.content)) {
    for (const contentItem of tablesResult.content) {
      if (contentItem.type === 'text' && contentItem.text) {
        try {
          const parsedData = JSON.parse(contentItem.text);
          console.log(`📋 Parsed JSON from MCP response:`, parsedData);
          
          // Handle successful data response with rows
          if (parsedData.success && parsedData.data && parsedData.data.rows && Array.isArray(parsedData.data.rows)) {
            const tables = parsedData.data.rows.map(row => row.name).filter(Boolean);
            console.log(`📋 Extracted table names from rows:`, tables);
            return tables;
          }
          
          // Handle other possible structures
          return parseTableNames(parsedData);
        } catch (error) {
          console.log(`⚠️ Failed to parse JSON from MCP response: ${error.message}`);
        }
      }
    }
  }
  
  // Handle direct array result (typical for PRAGMA table_info, DESCRIBE, etc.)
  if (Array.isArray(tablesResult)) {
    // Extract table names from array of objects
    return tablesResult.map(row => {
      if (typeof row === 'object') {
        // Try common column names for table names
        return row.name || row.table_name || row.Tables_in_db || Object.values(row)[0];
      }
      return row;
    }).filter(Boolean);
  }
  
  // Handle direct object with data structure
  if (typeof tablesResult === 'object' && tablesResult !== null) {
    // Check for data.rows structure (MCP format)
    if (tablesResult.data && tablesResult.data.rows && Array.isArray(tablesResult.data.rows)) {
      const tables = tablesResult.data.rows.map(row => row.name).filter(Boolean);
      console.log(`📋 Extracted table names from direct data.rows:`, tables);
      return tables;
    }
    
    // Check for direct rows array
    if (tablesResult.rows && Array.isArray(tablesResult.rows)) {
      const tables = tablesResult.rows.map(row => row.name).filter(Boolean);
      console.log(`📋 Extracted table names from direct rows:`, tables);
      return tables;
    }
  }
  
  if (typeof tablesResult === 'string') {
    // Parse string response
    return tablesResult.split('\n').filter(line => line.trim());
  }
  
  console.log(`⚠️ Could not parse table names from result format`);
  return [];
}

async function getDetailedSchema(tables, dbTool) {
  const detailed = {};
  
  for (const table of tables.slice(0, 5)) { // Limit to first 5 tables
    try {
      console.log(`🔍 Getting detailed schema for table: ${table}`);
      
      // Use LLM to generate appropriate schema query for this table
      const schemaQuery = await generateSchemaQueryForTable(table, dbTool);
      
      if (!schemaQuery) {
        console.log(`⚠️ Could not generate schema query for table: ${table}`);
        detailed[table] = { 
          error: 'Could not generate appropriate schema query',
          method: 'failed'
        };
        continue;
      }
      
      try {
        console.log(`🔍 Executing schema query for ${table}: ${schemaQuery}`);
        const schemaResult = await dbTool.call({ query: schemaQuery });
        console.log(`📋 Schema result for ${table}:`, schemaResult);
        
        // Parse the schema result intelligently
        const parsedSchema = parseSchemaResult(schemaResult, table);
        
        if (parsedSchema.success) {
          detailed[table] = parsedSchema;
          console.log(`✅ Got schema for table: ${table} (${parsedSchema.columnCount} columns)`);
        } else {
          // Fallback: try sample data approach
          const sampleResult = await getSampleDataSchema(table, dbTool);
          detailed[table] = sampleResult;
        }
        
      } catch (error) {
        console.log(`⚠️ Schema query failed for ${table}: ${error.message}`);
        
        // Fallback: try sample data approach
        try {
          const sampleResult = await getSampleDataSchema(table, dbTool);
          detailed[table] = sampleResult;
        } catch (sampleError) {
          console.log(`❌ All schema discovery methods failed for ${table}: ${sampleError.message}`);
          detailed[table] = { 
            error: `Schema discovery failed: ${error.message}`,
            method: 'failed'
          };
        }
      }
      
    } catch (error) {
      console.log(`❌ Complete failure for table ${table}: ${error.message}`);
      detailed[table] = { 
        error: error.message,
        method: 'failed'
      };
    }
  }
  
  return detailed;
}

/**
 * Use LLM to generate appropriate schema query for a specific table
 */
async function generateSchemaQueryForTable(tableName, dbTool) {
  const schemaQueryPrompt = `You are a database expert. Generate a SQL query to get the column information for table "${tableName}".

Tool available: ${dbTool.name}
Tool description: ${dbTool.description || 'Database query tool'}

Consider different database systems and generate the most appropriate query to get column names and types.

Common approaches:
- PRAGMA table_info(${tableName}) -- SQLite
- DESCRIBE ${tableName} -- MySQL
- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${tableName}' -- PostgreSQL/SQL Server
- SELECT * FROM ${tableName} LIMIT 1 -- Sample data approach

Respond with ONLY the SQL query, no explanations.`;

  try {
    const response = await llm.invoke([new HumanMessage(schemaQueryPrompt)]);
    const query = response.content.trim().replace(/```sql\n?/g, '').replace(/```\n?/g, '').trim();
    
    console.log(`🔍 LLM generated schema query for ${tableName}: ${query}`);
    return query;
  } catch (error) {
    console.log(`⚠️ LLM schema query generation failed: ${error.message}`);
    return null;
  }
}

/**
 * Intelligently parse schema result from any database system
 */
function parseSchemaResult(schemaResult, tableName) {
  try {
    // Handle MCP response format
    if (schemaResult && schemaResult.content && Array.isArray(schemaResult.content)) {
      for (const contentItem of schemaResult.content) {
        if (contentItem.type === 'text' && contentItem.text) {
          try {
            const parsedData = JSON.parse(contentItem.text);
            if (parsedData.success && parsedData.data && parsedData.data.columns) {
              return {
                success: true,
                method: 'mcp_columns_data',
                columnNames: parsedData.data.columns,
                columnCount: parsedData.data.columns.length
              };
            }
          } catch (parseError) {
            // Continue with other parsing methods
          }
        }
      }
    }
    
    // Handle direct array result (typical for PRAGMA table_info, DESCRIBE, etc.)
    if (Array.isArray(schemaResult) && schemaResult.length > 0) {
      const firstRow = schemaResult[0];
      
      // PRAGMA table_info format: {cid, name, type, notnull, dflt_value, pk}
      if (firstRow.name !== undefined) {
        const columnNames = schemaResult.map(row => row.name);
        return {
          success: true,
          method: 'pragma_table_info',
          columns: schemaResult,
          columnNames: columnNames,
          columnCount: columnNames.length
        };
      }
      
      // DESCRIBE format: {Field, Type, Null, Key, Default, Extra}
      if (firstRow.Field !== undefined) {
        const columnNames = schemaResult.map(row => row.Field);
        return {
          success: true,
          method: 'describe_table',
          columns: schemaResult,
          columnNames: columnNames,
          columnCount: columnNames.length
        };
      }
      
      // information_schema format: {column_name, data_type, ...}
      if (firstRow.column_name !== undefined) {
        const columnNames = schemaResult.map(row => row.column_name);
        return {
          success: true,
          method: 'information_schema',
          columns: schemaResult,
          columnNames: columnNames,
          columnCount: columnNames.length
        };
      }
      
      // Sample data format: extract keys from first row
      if (typeof firstRow === 'object' && firstRow !== null) {
        const columnNames = Object.keys(firstRow);
        return {
          success: true,
          method: 'sample_data_keys',
          sampleRow: firstRow,
          columnNames: columnNames,
          columnCount: columnNames.length
        };
      }
    }
    
    return { success: false, error: 'Could not parse schema result format' };
  } catch (error) {
    return { success: false, error: `Schema parsing failed: ${error.message}` };
  }
}

/**
 * Fallback method: get schema from sample data
 */
async function getSampleDataSchema(tableName, dbTool) {
  try {
    const sampleQuery = `SELECT * FROM ${tableName} LIMIT 1`;
    const sampleData = await dbTool.call({ query: sampleQuery });
    
    const parsedSample = parseSchemaResult(sampleData, tableName);
    
    if (parsedSample.success) {
      return {
        ...parsedSample,
        method: 'sample_data_fallback'
      };
    } else {
      // Last resort: count rows to verify table exists
      const countQuery = `SELECT COUNT(*) as row_count FROM ${tableName}`;
      const countResult = await dbTool.call({ query: countQuery });
      
      if (countResult && Array.isArray(countResult) && countResult.length > 0) {
        const rowCount = countResult[0].row_count || countResult[0]['COUNT(*)'] || 0;
        return {
          success: false,
          method: 'count_only_fallback',
          rowCount: rowCount,
          error: 'Could not discover column schema, but table exists with ' + rowCount + ' rows'
        };
      }
    }
    
    return { 
      success: false,
      method: 'failed',
      error: 'All fallback methods failed'
    };
  } catch (error) {
    return { 
      success: false,
      method: 'failed',
      error: `Sample data schema failed: ${error.message}`
    };
  }
}

module.exports = {
  runSqlSchemaAgent
};
