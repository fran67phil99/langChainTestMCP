// SQL Schema Agent - Specialized agent for database schema discovery and query generation
const { HumanMessage } = require('@langchain/core/messages');
const { createTrackedLLM, logAgentActivity } = require('../utils/langsmithConfig');

// Initialize LLM for SQL operations with LangSmith tracing
const llm = createTrackedLLM({
  modelName: "gpt-3.5-turbo",
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
  
  logAgentActivity('sql_schema_agent', 'a2a_request_start', {
    action: request.action,
    requestFrom: request.from,
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
  
  try {// First, try to find and use any MCP tool that can list tables
    const listTablesTool = availableTools.find(tool => {
      const toolName = tool.name.toLowerCase();
      const toolDesc = (tool.description || '').toLowerCase();
      
      // Look for table listing capabilities - prioritize exact matches
      const tableListPatterns = [
        'list_tables', 'listtables', 'list_table', 'table_list',
        'show_tables', 'showtables', 'get_tables', 'gettables',
        'describe_tables', 'schema', 'metadata'
      ];
      
      // Exact name matches get highest priority
      for (const pattern of tableListPatterns) {
        if (toolName === pattern || toolName.includes(pattern)) {
          return true;
        }
      }
      
      // Description matches get medium priority
      for (const pattern of tableListPatterns) {
        if (toolDesc.includes(pattern) && !toolDesc.includes('import') && !toolDesc.includes('upload')) {
          return true;
        }
      }
      
      return false;
    });
      if (listTablesTool) {
      console.log(`🔧 Using MCP tool: ${listTablesTool.name} for schema discovery`);
      try {
        // Correctly call the MCP tool using the call method
        const tablesResult = await listTablesTool.call({});
        console.log('📋 MCP tool result:', tablesResult);
        
        if (tablesResult && (Array.isArray(tablesResult) || typeof tablesResult === 'object')) {
          const tables = parseTablesFromMcpResult(tablesResult);
          console.log(`📋 Found tables via MCP tool: ${tables.join(', ')}`);
          
          // Get detailed schema for each table using database tool
          const dbTool = findDatabaseTool(availableTools);
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
    
    // Fallback: Find database tools and try SQL queries
    const dbTool = findDatabaseTool(availableTools);
    if (!dbTool) {
      throw new Error('No database tools available for schema discovery');
    }
      // Try multiple database systems and query types dynamically
    const schemaQueries = [
      // SQLite
      "SELECT name FROM sqlite_master WHERE type='table'",
      "PRAGMA table_list",
      ".tables",
      // MySQL/MariaDB
      "SHOW TABLES",
      "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()",
      // PostgreSQL
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
      // SQL Server
      "SELECT table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE'",
      "SELECT name FROM sys.tables",
      // Oracle
      "SELECT table_name FROM user_tables",
      // Generic ANSI SQL
      "SELECT table_name FROM information_schema.tables",
      // MongoDB-style (if supported)
      "show collections",
      // Generic fallback
      "SELECT * FROM information_schema.tables LIMIT 10"
    ];
    
    let tablesResult = null;
    let workingQuery = null;
    
    // Try each query until one works
    for (const query of schemaQueries) {
      try {
        console.log(`🔍 Trying schema query: ${query}`);
        tablesResult = await dbTool.call({ query });
        workingQuery = query;
        break;
      } catch (error) {
        console.log(`⚠️ Schema query failed: ${error.message}`);
        continue;
      }
    }
    
    if (!tablesResult) {
      throw new Error('Unable to discover database schema with any known method');
    }
    
    console.log(`✅ Schema discovery successful with: ${workingQuery}`);
    
    // Parse table names from result
    const tables = parseTableNames(tablesResult);
    console.log(`📋 Found tables: ${tables.join(', ')}`);
    
    // Get detailed schema for each table
    const detailedSchema = await getDetailedSchema(tables, dbTool);
    
    logAgentActivity('sql_schema_agent', 'schema_discovered', {
      tablesFound: tables.length,
      tables: tables,
      method: workingQuery,
      threadId
    });
    
    return {
      success: true,
      agent: 'sql_schema',
      action: 'discover_schema',
      schema: {
        tables: tables,
        detailed: detailedSchema,
        discoveryMethod: workingQuery
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
    const queryPrompt = `You are an expert SQL generator with access to the real database schema.

Database Schema:
${JSON.stringify(schema, null, 2)}

EXACT COLUMN NAMES (use these exact names):${columnsInfo}

User Intent: "${userIntent}"
Operation Type: ${operation.type}
Operation Parameters: ${JSON.stringify(operation.parameters)}

Generate an optimized SQL query using the EXACT table and column names from the schema above.

CRITICAL RULES:
- Use ONLY existing tables and columns from the schema above
- Use the EXACT column names as they appear in the "EXACT COLUMN NAMES" section above
- Column names may contain underscores, double underscores, or special characters - use them exactly as shown
- For text searches (like "Back to the Future"), look for title/name columns like "Univ__title", "Title", etc.
- NEVER use generic names like "dataset_column_name" or "table_column" - use real column names only
- For "universal title" or similar terms, use "Univ__title" column if available
- For preview operations, use appropriate LIMIT (default 10)
- For searches, use proper WHERE conditions with LIKE
- For counts, use COUNT(*) with appropriate GROUP BY if needed
- If no specific table is mentioned in user intent but tables exist, use the first available table
- Return only the SQL query, no explanations
- DO NOT normalize or change column names

Available tables: ${schema.tables.join(', ')}

EXAMPLE: If searching for "Back to the Future" in universal titles, use:
SELECT * FROM dataset WHERE Univ__title LIKE '%Back to the Future%'

SQL Query:`;

  try {
    const response = await llm.invoke([new HumanMessage(queryPrompt)]);
    let sqlQuery = response.content.trim();
      // Clean up the response
    sqlQuery = sqlQuery.replace(/```sql\n?/g, '').replace(/```\n?/g, '').trim();
    
    // Fix common LLM mistakes with column names
    if (schema.detailed) {
      for (const [tableName, tableInfo] of Object.entries(schema.detailed)) {
        if (tableInfo.columnNames && tableInfo.columnNames.length > 0) {
          // Replace generic column references with actual columns
          if (sqlQuery.includes('dataset_column_name') || sqlQuery.includes('table_column')) {
            // For title/name searches, prioritize Univ__title, Title, or name-like columns
            const titleColumn = tableInfo.columnNames.find(col => 
              col.toLowerCase().includes('title') || 
              col.toLowerCase().includes('univ') ||
              col.toLowerCase().includes('name')
            ) || tableInfo.columnNames[0]; // fallback to first column
            
            sqlQuery = sqlQuery.replace(/dataset_column_name|table_column/g, titleColumn);
          }
          
          // Replace generic table references
          sqlQuery = sqlQuery.replace(/table_name/g, tableName);
        }
      }
    }
    
    // If query still contains generic placeholders, replace with actual table
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
 * Helper functions
 */
function findDatabaseTool(availableTools) {
  // Priority-based search for database tools - completely dynamic
  const dbToolPatterns = [
    { patterns: ['query_database', 'database_query', 'sql_query'], priority: 10 },
    { patterns: ['query', 'sql'], priority: 9 },
    { patterns: ['database', 'db'], priority: 8 },
    { patterns: ['exec', 'execute', 'run'], priority: 7 },
    { patterns: ['select', 'insert', 'update', 'delete'], priority: 6 },
    { patterns: ['call', 'invoke'], priority: 5 }
  ];
  
  let bestTool = null;
  let bestScore = 0;
  
  for (const tool of availableTools) {
    const toolName = tool.name.toLowerCase();
    const toolDesc = (tool.description || '').toLowerCase();
    let score = 0;
    
    // Skip tools that are clearly not for database queries
    if (toolName.includes('import') || toolName.includes('upload') || 
        toolName.includes('export') || toolName.includes('file')) {
      continue;
    }
    
    // Calculate score based on pattern matching
    for (const { patterns, priority } of dbToolPatterns) {
      for (const pattern of patterns) {
        if (toolName.includes(pattern)) {
          score += priority * 2; // Name matches get double weight
        }
        if (toolDesc.includes(pattern)) {
          score += priority;
        }
      }
    }
    
    // Bonus for tools that explicitly mention SQL or database operations
    if (toolDesc.includes('sql') || toolDesc.includes('database') || 
        toolDesc.includes('query') || toolDesc.includes('execute')) {
      score += 5;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestTool = tool;
    }
  }
  
  console.log(`🎯 SQL Schema Agent: Selected database tool: ${bestTool?.name || 'none'} (score: ${bestScore})`);
  return bestTool;
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
  
  if (typeof tablesResult === 'string') {
    // Parse string response
    return tablesResult.split('\n').filter(line => line.trim());
  }
  
  return [];
}

async function getDetailedSchema(tables, dbTool) {
  const detailed = {};
  
  for (const table of tables.slice(0, 5)) { // Limit to first 5 tables
    try {
      console.log(`🔍 Getting detailed schema for table: ${table}`);
      
      // Try multiple approaches to get schema information
      let tableInfo = null;
      
      // Approach 1: PRAGMA table_info (SQLite specific)
      try {
        const schemaQuery = `PRAGMA table_info(${table})`;
        tableInfo = await dbTool.call({ query: schemaQuery });
        console.log(`📋 PRAGMA table_info result for ${table}:`, tableInfo);
        
        if (tableInfo && Array.isArray(tableInfo) && tableInfo.length > 0) {
          detailed[table] = {
            method: 'PRAGMA table_info',
            columns: tableInfo,
            columnCount: tableInfo.length,
            columnNames: tableInfo.map(col => col.name).filter(Boolean)
          };
          console.log(`✅ Got ${tableInfo.length} columns via PRAGMA for table: ${table}`);
          continue; // Success, move to next table
        }
      } catch (error) {
        console.log(`⚠️ PRAGMA table_info failed for ${table}: ${error.message}`);
      }
      
      // Approach 2: DESCRIBE table (MySQL/PostgreSQL style)
      try {
        const describeQuery = `DESCRIBE ${table}`;
        tableInfo = await dbTool.call({ query: describeQuery });
        console.log(`📋 DESCRIBE result for ${table}:`, tableInfo);
        
        if (tableInfo && Array.isArray(tableInfo) && tableInfo.length > 0) {
          detailed[table] = {
            method: 'DESCRIBE',
            columns: tableInfo,
            columnCount: tableInfo.length,
            columnNames: tableInfo.map(col => col.Field || col.field || col.column_name).filter(Boolean)
          };
          console.log(`✅ Got ${tableInfo.length} columns via DESCRIBE for table: ${table}`);
          continue; // Success, move to next table
        }
      } catch (error) {
        console.log(`⚠️ DESCRIBE failed for ${table}: ${error.message}`);
      }
      
      // Approach 3: information_schema (ANSI SQL standard)
      try {
        const infoSchemaQuery = `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${table}' ORDER BY ordinal_position`;
        tableInfo = await dbTool.call({ query: infoSchemaQuery });
        console.log(`📋 information_schema result for ${table}:`, tableInfo);
        
        if (tableInfo && Array.isArray(tableInfo) && tableInfo.length > 0) {
          detailed[table] = {
            method: 'information_schema',
            columns: tableInfo,
            columnCount: tableInfo.length,
            columnNames: tableInfo.map(col => col.column_name || col.COLUMN_NAME).filter(Boolean)
          };
          console.log(`✅ Got ${tableInfo.length} columns via information_schema for table: ${table}`);
          continue; // Success, move to next table
        }
      } catch (error) {
        console.log(`⚠️ information_schema failed for ${table}: ${error.message}`);
      }
        // Approach 4: Sample data approach - SELECT first row to discover columns
      try {
        const sampleQuery = `SELECT * FROM ${table} LIMIT 1`;
        const sampleData = await dbTool.call({ query: sampleQuery });
        console.log(`📋 Sample data result for ${table}:`, sampleData);
        
        // Extract columns from MCP result structure
        let columnNames = [];
        
        if (sampleData && typeof sampleData === 'object') {
          // Try to parse from MCP response format
          if (sampleData.content && Array.isArray(sampleData.content) && sampleData.content[0]) {
            try {
              const textContent = sampleData.content[0].text;
              const parsedData = JSON.parse(textContent);
              
              if (parsedData.success && parsedData.data && parsedData.data.columns) {
                columnNames = parsedData.data.columns;
                console.log(`📋 Extracted columns from MCP response: ${columnNames.join(', ')}`);
              }
            } catch (parseError) {
              console.log(`⚠️ Could not parse MCP response JSON: ${parseError.message}`);
            }
          }
          
          // Fallback: try direct array access
          if (columnNames.length === 0 && Array.isArray(sampleData) && sampleData.length > 0) {
            const firstRow = sampleData[0];
            if (typeof firstRow === 'object' && firstRow !== null) {
              columnNames = Object.keys(firstRow);
              console.log(`📋 Extracted columns from first row keys: ${columnNames.join(', ')}`);
            }
          }
        }
        
        if (columnNames.length > 0) {
          detailed[table] = {
            method: 'sample_data_discovery',
            columnCount: columnNames.length,
            columnNames: columnNames,
            discoveredFrom: 'mcp_response_columns'
          };
          console.log(`✅ Got ${columnNames.length} columns via sample data for table: ${table}`);
          console.log(`📋 Column names: ${columnNames.join(', ')}`);
          continue; // Success, move to next table
        }
      } catch (error) {
        console.log(`⚠️ Sample data approach failed for ${table}: ${error.message}`);
      }
      
      // Approach 5: Count rows to at least get table size info
      try {
        const countQuery = `SELECT COUNT(*) as row_count FROM ${table}`;
        const countResult = await dbTool.call({ query: countQuery });
        console.log(`📋 Count result for ${table}:`, countResult);
        
        if (countResult && Array.isArray(countResult) && countResult.length > 0) {
          const rowCount = countResult[0].row_count || countResult[0]['COUNT(*)'] || 0;
          detailed[table] = {
            method: 'count_only',
            rowCount: rowCount,
            error: 'Could not discover column schema, but table exists',
            columnCount: 'unknown'
          };
          console.log(`⚠️ Could only get row count (${rowCount}) for table: ${table}`);
        }
      } catch (error) {
        console.log(`⚠️ Even count query failed for ${table}: ${error.message}`);
        detailed[table] = { 
          error: `All schema discovery methods failed: ${error.message}`,
          method: 'failed'
        };
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

module.exports = {
  runSqlSchemaAgent
};
