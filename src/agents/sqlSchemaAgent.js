// SQL Schema Agent - Specialized agent for database schema discovery and query generation
const { HumanMessage } = require('@langchain/core/messages');
const { createTrackedLLM, logAgentActivity } = require('../utils/langsmithConfig');
const { analyzeSchemaSemantics, generateSemanticQuery, analyzeUserIntentSemantics } = require('../utils/semanticAnalyzer');

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
    console.log(`🗃️ SQL Schema Agent: Processing A2A request for action: ${request.action}`);
    logAgentActivity('sql_schema_agent', 'a2a_request_start', {
        action: request.action,
        requestFrom: request.from,
        hasTools: availableTools && availableTools.length > 0,
        threadId
    });
    
  try {
    switch (request.action) {
      case 'discover_schema':
        return await discoverDatabaseSchema(availableTools, threadId, request.execution_results, request.A2A_context);
      case 'generate_query':
        return await generateOptimizedQuery(request, availableTools, threadId);
      case 'validate_query':
        return await validateQuery(request, threadId);
      default:
        throw new Error(`Unsupported action: ${request.action}`);
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
 * Discovers the actual database schema using MCP tools in a multi-step, plan-based process.
 */
async function discoverDatabaseSchema(availableTools, threadId, executionResults = null, a2aContext = {}) {
    console.log(`🔍 SQL Schema Agent: Discovering database schema...`);
    const dbTool = await findDatabaseTool(availableTools);
    if (!dbTool) {
        throw new Error('No database tools available for schema discovery');
    }

    let phase = a2aContext.phase; // Get phase from context first

    // If we have execution results, they are the source of truth for the *next* phase.
    // This overrides any phase that might have been passed in the context.
    if (executionResults && executionResults.length > 0) {
        const resultsContextType = executionResults[0].context?.type;
        if (resultsContextType === 'list_tables_result') {
            console.warn(`Phase override: Forcing phase to 'get_detailed_schema' based on results.`);
            phase = 'get_detailed_schema';
        } else if (resultsContextType === 'detailed_schema_query') {
            console.warn(`Phase override: Forcing phase to 'parse_detailed_schema' based on results.`);
            phase = 'parse_detailed_schema';
        } else if (resultsContextType === 'fallback_schema_query') {
            console.warn(`Phase override: Forcing phase to 'parse_fallback_schema' based on results.`);
            phase = 'parse_fallback_schema';
        }
    }

    // If after all that, phase is still undefined, default to the start.
    if (!phase) {
        phase = 'list_tables';
    }

    let discoveredSchema = a2aContext.schema || { tables: [], detailed: {}, failed: [] };

    console.log(`🔄 Current discovery phase: ${phase}`);

    if (phase === 'list_tables') {
        console.log('Phase 1: Generating plan to list tables.');
        const plan = []; // Initialize plan array
        const listTablesPlan = await discoverSchemaIntelligently(dbTool);
        if (!listTablesPlan.success) {
            throw new Error('Unable to generate plan for schema discovery.');
        }
        listTablesPlan.plan.context = { type: 'list_tables_result' };
        plan.push(listTablesPlan.plan);

        return {
            success: true,
            agent: 'sql_schema',
            action: 'discover_schema',
            plan: plan,
            needs_execution: true,
            A2A_context: { phase: 'get_detailed_schema', schema: discoveredSchema },
            message: 'Plan created to list database tables.'
        };
    }

    if (phase === 'get_detailed_schema') {
        console.log('Phase 2: Parsing table list and planning detailed schema discovery.');
        const listTablesResult = executionResults.find(r => r.context && r.context.type === 'list_tables_result');
        if (!listTablesResult || !listTablesResult.success) {
            throw new Error('Table listing execution failed or produced no result.');
        }
        
        const tables = parseTableNames(listTablesResult.tool_result);
        if (tables.length === 0) {
            console.log('✅ Schema discovery complete: No tables found.');
            return { success: true, agent: 'sql_schema', action: 'discover_schema', schema: discoveredSchema, tool: dbTool.name };
        }
        console.log(`📋 Found tables: ${tables.join(', ')}`);
        discoveredSchema.tables = tables;

        const detailedSchemaPlanResult = await getDetailedSchema(tables, dbTool, null);
        if (detailedSchemaPlanResult.plan && detailedSchemaPlanResult.plan.length > 0) {
             // WORKAROUND: Persist the list of all tables in each step's context
             // to survive potential A2A_context loss by the orchestrator.
             detailedSchemaPlanResult.plan.forEach(step => {
                step.context.all_tables = tables;
             });
             return {
                success: true,
                agent: 'sql_schema',
                action: 'discover_schema',
                plan: detailedSchemaPlanResult.plan,
                needs_execution: true,
                A2A_context: { phase: 'parse_detailed_schema', schema: discoveredSchema },
                message: `Plan created to get detailed schema for ${tables.length} tables.`
            };
        }
        // If no plan, it means no tables needed schema, which is unlikely here but safe to handle.
        console.log('✅ Schema discovery complete: No further details to fetch.');
        return { success: true, agent: 'sql_schema', action: 'discover_schema', schema: discoveredSchema, tool: dbTool.name };
    }
    
    if (phase === 'parse_detailed_schema') {
        console.log('Phase 3: Parsing detailed schema results and planning fallbacks.');
        const detailedSchemaResults = executionResults.filter(r => r.context.type === 'detailed_schema_query');
        
        // WORKAROUND: If A2A_context is lost, recover the table list from the execution results.
        const tablesForParsing = discoveredSchema.tables.length > 0 
            ? discoveredSchema.tables 
            : (detailedSchemaResults[0]?.context?.all_tables || []);

        if (tablesForParsing.length === 0) {
            throw new Error("Critical: Table list was lost and could not be recovered from execution context. Cannot proceed.");
        }
        
        const parsingResult = await getDetailedSchema(tablesForParsing, dbTool, detailedSchemaResults);
        
        if (parsingResult.schema) {
            discoveredSchema.detailed = { ...discoveredSchema.detailed, ...parsingResult.schema };
        }

        if (parsingResult.plan && parsingResult.plan.length > 0) {
            console.log(`⚠️ Fallback plan generated for ${parsingResult.plan.length} tables.`);
            return {
                success: true,
                agent: 'sql_schema',
                action: 'discover_schema',
                plan: parsingResult.plan,
                needs_execution: true,
                A2A_context: { phase: 'parse_fallback_schema', schema: discoveredSchema },
                message: 'Fallback plan generated for tables where standard schema discovery failed.'
            };
        }
        
        console.log('✅ Schema discovery complete (no fallbacks needed).');
        return {
            success: true,
            agent: 'sql_schema',
            action: 'discover_schema',
            schema: discoveredSchema,
            tool: dbTool.name,
            message: 'Schema discovery completed successfully.'
        };
    }

    if (phase === 'parse_fallback_schema') {
        console.log('Phase 4: Parsing fallback schema results.');
        const fallbackResults = executionResults.filter(r => r.context && r.context.type === 'fallback_schema_query');
        for (const result of fallbackResults) {
            if (result.success && result.context) {
                const { table } = result.context;
                const columnNames = parseColumnsFromData(result.tool_result);
                if (columnNames.length > 0) {
                    discoveredSchema.detailed[table] = {
                        columnNames: columnNames,
                        discoveryMethod: 'fallback_select_star'
                    };
                }
            }
        }
        console.log('✅ Schema discovery complete (after fallbacks).');
        
        // Add semantic analysis to enhance schema understanding
        console.log('🧠 Running semantic analysis on discovered schema...');
        const semanticMapping = await analyzeSchemaSemantics(discoveredSchema);
        
        return {
            success: true,
            agent: 'sql_schema',
            action: 'discover_schema',
            schema: discoveredSchema,
            semanticMapping: semanticMapping,
            tool: dbTool.name,
            message: 'Schema discovery completed successfully using fallbacks with semantic analysis.'
        };
    }

    throw new Error(`Invalid discovery phase: ${phase}`);
}


/**
 * Generates an optimized SQL query plan based on schema and user intent.
 */
async function generateOptimizedQuery(request, availableTools, threadId) {
  console.log(`📝 SQL Schema Agent: Generating optimized query plan...`);
  
  // Extract parameters from the request
  const params = request.params || request;
  const { userIntent, schema, operation } = params;
  
  // Find the database tool
  const dbTool = await findDatabaseTool(availableTools);
  if (!dbTool) {
    throw new Error('No database tools available for query generation');
  }
  
  try {
    // First, perform semantic analysis of the user intent
    console.log('🧠 Analyzing user intent semantically...');
    const intentAnalysis = await analyzeUserIntentSemantics(userIntent);
    
    // Then, analyze the schema semantically  
    console.log('🧠 Analyzing schema semantically...');
    const semanticMapping = await analyzeSchemaSemantics(schema);
    
    // Generate query using semantic understanding
    console.log('🧠 Generating semantic query...');
    const sqlQuery = await generateSemanticQuery(userIntent, schema, semanticMapping);
    
    console.log(`✅ Generated semantic SQL query: ${sqlQuery}`);
    
    return {
      success: true,
      agent: 'sql_schema',
      action: 'generate_query',
      query: sqlQuery,
      sqlQuery: sqlQuery, // Also include this for backward compatibility
      intentAnalysis: intentAnalysis,
      semanticMapping: semanticMapping,
      tool: dbTool.name,
      message: 'SQL query generated successfully using semantic analysis.'
    };
    
  } catch (error) {
    console.warn(`⚠️ Semantic query generation failed, using fallback...`);
    
    // Fallback to original method if semantic analysis fails
    return await generateOptimizedQueryFallback(params, dbTool, threadId);
  }
}

/**
 * Fallback query generation method (original logic)
 */
async function generateOptimizedQueryFallback(params, dbTool, threadId) {
  console.log(`📝 SQL Schema Agent: Using fallback query generation...`);
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
  const queryPrompt = `You are an expert SQL architect with semantic analysis capabilities. Generate precise SQL queries by analyzing the user's intent and the provided database schema.

**SCHEMA ANALYSIS:**
Tables: ${schema.tables.join(', ')}

**DETAILED COLUMNS:**
${columnsInfo}

**USER REQUEST:**
"${userIntent}"

**OPERATION:** ${operation.type}

**INTELLIGENT COLUMN MAPPING:**
Based on the schema, identify the most relevant columns for this query:
- Look for columns that could contain title/name information
- Look for columns that could contain date information (publication, sales, etc.)
- Look for columns that could represent collections or categories
- Look for columns that could represent issue numbers or sequence data

**ADVANCED SQL GENERATION RULES:**

1. **For aggregation queries (like "latest issue of each collection"):**
   - Use MAX() to find latest dates or highest issue numbers
   - Always include GROUP BY for "each" type requests
   - Use meaningful column aliases for readability

2. **For date range analysis:**
   - Identify date columns and use appropriate date functions
   - Handle different date formats intelligently
   - Use BETWEEN or >= <= for ranges

3. **For listing queries:**
   - Use DISTINCT for unique lists
   - ORDER BY relevant columns (dates DESC for latest)
   - Include LIMIT if appropriate

4. **Query Structure Template:**
   - SELECT: Choose columns that answer the user's question
   - FROM: Use the main data table
   - WHERE: Add filters based on user criteria
   - GROUP BY: Use when user asks for "each" or "by"
   - ORDER BY: Use for "latest", "earliest", "top"
   - LIMIT: Use for "first X" or when data might be large

**CRITICAL REQUIREMENTS:**
- Only use table and column names that exist in the provided schema
- Never invent column names or table names
- If the user mentions specific terms, map them to similar column names semantically
- Generate complete, executable SQL without placeholders

**OUTPUT:**
Return only the SQL query, no explanations, no markdown formatting.`;

  try {
    const response = await llm.invoke([new HumanMessage(queryPrompt)]);
    let sqlQuery = response.content.trim();// Clean up the response
    sqlQuery = sqlQuery.replace(/```sql\\n?/g, '').replace(/```\\n?/g, '').trim();
    
    // If query still contains generic placeholders, use LLM to fix them intelligently
    if (sqlQuery.includes('table_name') && schema.tables.length > 0) {
      sqlQuery = sqlQuery.replace(/table_name/g, schema.tables[0]);
    }
    
    console.log(`✅ Generated optimized query: ${sqlQuery}`);
    
    const plan = [{
        tool_name: dbTool.name,
        parameters: { query: sqlQuery },
        serverId: dbTool.serverId,
        context: {
            type: 'user_query_execution',
            userIntent: userIntent
        }
    }];

    return {
      success: true,
      agent: 'sql_schema',
      action: 'generate_query',
      plan: plan,
      needs_execution: true,
      message: `Plan created to execute user query.`
    };
  } catch (llmError) {
    console.error(`❌ LLM error during query generation: ${llmError.message}`);
    throw new Error('Query generation failed due to LLM error');
  }
}

/**
 * Use LLM to intelligently find database query tools from available tools
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
        console.log(`⚠️ LLM tool analysis failed: ${error.message}`);
        return null;
    }
}

/**
 * Parses the result of a SQL query execution to extract table names.
 */
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

/**
 * Parses column names from the result of a "SELECT *" query.
 */
function parseColumnsFromData(mcpResult) {
    console.log(`🔍 Parsing columns from data result:`, mcpResult);

    // Handle potential nesting inside tool_result
    const resultData = mcpResult.tool_result || mcpResult;

    // Handle MCP response format with content array first
    if (resultData && resultData.content && Array.isArray(resultData.content)) {
        for (const contentItem of resultData.content) {
            if (contentItem.type === 'text' && contentItem.text) {
                try {
                    const parsedData = JSON.parse(contentItem.text);
                    // Recursively call to handle the parsed JSON
                    const columns = parseColumnsFromData(parsedData);
                    if (columns.length > 0) {
                        return columns;
                    }
                } catch (e) {
                    // Not JSON, ignore and let other parsers handle it
                }
            }
        }
    }
    
    const data = resultData.data || resultData;

    // 1. Most reliable: Check for a 'columns' array directly in the data.
    if (data && Array.isArray(data.columns) && data.columns.length > 0) {
        console.log(`✅ Extracted columns directly from 'data.columns': ${data.columns.join(', ')}`);
        return data.columns;
    }

    // 2. Fallback: Infer from the keys of the first row object.
    let rows = [];
    if (data && Array.isArray(data.rows)) {
        rows = data.rows;
    } else if (Array.isArray(data)) { // Handle case where the result is just an array of rows
        rows = data;
    }

    if (rows.length > 0 && typeof rows[0] === 'object' && rows[0] !== null) {
        const columnNames = Object.keys(rows[0]);
        console.log(`✅ Extracted columns by inferring from first row keys: ${columnNames.join(', ')}`);
        return columnNames;
    }
    
    console.log(`⚠️ Could not parse columns from data result.`);
    return [];
}

/**
 * Use LLM to intelligently discover database schema
 */
async function discoverSchemaIntelligently(dbTool) {
  // This function generates a plan for the orchestrator to discover database schema
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
    
    // Return the plan, not the result of execution
    return {
      success: true,
      plan: {
        tool_name: dbTool.name,
        parameters: { query },
        serverId: dbTool.serverId
      }
    };

  } catch (error) {
    console.log(`⚠️ LLM schema discovery failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Gets the detailed schema for the given tables using the database tool.
 */
async function getDetailedSchema(tables, dbTool, executionResults) {
    const detailed = {};

    // If we have results, parse them
    if (executionResults && executionResults.length > 0) {
        console.log(`🔍 Parsing detailed schema from ${executionResults.length} provided results...`);
        for (const result of executionResults) {
            if (result.success && result.context) {
                const { table } = result.context;
                let columnNames = parseSchemaResult(result.tool_result, table);

                if (columnNames.length > 0) {
                    detailed[table] = {
                        columnNames: columnNames,
                        discoveryMethod: 'standard_query'
                    };
                } else {
                    // If parsing fails, we note it. The fallback will be a separate step.
                    detailed[table] = {
                        columnNames: [],
                        discoveryMethod: 'standard_query_failed',
                        error: 'Failed to parse columns from standard query result.'
                    };
                }
            }
        }
        // After parsing, check which tables still need a schema (e.g., due to parsing failure)
        // and generate a fallback plan.
        const tablesNeedingFallback = tables.filter(t => !detailed[t] || detailed[t].columnNames.length === 0);
        if (tablesNeedingFallback.length > 0) {
            console.log(`⚠️ Generating fallback plan for tables: ${tablesNeedingFallback.join(', ')}`);
            const fallbackPlan = tablesNeedingFallback.map(table => ({
                tool_name: dbTool.name,
                parameters: { query: `SELECT * FROM "${table.replace(/"/g, '""')}" LIMIT 1` },
                serverId: dbTool.serverId,
                context: { table, type: 'fallback_schema_query' }
            }));
            return { success: true, plan: fallbackPlan, intermediate_results: detailed };
        }

        return { success: true, schema: detailed };
    }

    // If no results are provided, this is the first step: generate the plan.
    console.log(`📝 Generating plan to get detailed schema for ${tables.length} tables.`);
    const plan = [];
    for (const table of tables.slice(0, 5)) { // Limit for performance
        try {
            console.log(`🔍 Planning detailed schema query for table: ${table}`);
            const schemaQuery = await generateSchemaQueryForTable(table, dbTool);
            if (schemaQuery) {
                plan.push({
                    tool_name: dbTool.name,
                    parameters: { query: schemaQuery },
                    serverId: dbTool.serverId,
                    context: { table, query: schemaQuery, type: 'detailed_schema_query' } // Add context for the next step
                });
            }
        } catch (error) {
            console.error(`❌ Failed to generate schema query plan for table ${table}: ${error.message}`);
        }
    }

    return { success: true, plan: plan };
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
    console.log(`🔍 Parsing schema result for table "${tableName}":`, schemaResult);

    // Handle MCP response format with content array
    if (schemaResult && schemaResult.content && Array.isArray(schemaResult.content)) {
        for (const contentItem of schemaResult.content) {
            if (contentItem.type === 'text' && contentItem.text) {
                try {
                    const parsedData = JSON.parse(contentItem.text);
                    // Recursively call to handle nested structures
                    return parseSchemaResult(parsedData, tableName);
                } catch (e) {
                    // Not JSON, ignore and let other parsers handle it
                }
            }
        }
    }

    let rows = [];
    if (Array.isArray(schemaResult)) {
        rows = schemaResult;
    } else if (schemaResult && schemaResult.data && Array.isArray(schemaResult.data.rows)) {
        rows = schemaResult.data.rows;
    } else if (schemaResult && Array.isArray(schemaResult.rows)) {
        rows = schemaResult.rows;
    } else if (schemaResult && schemaResult.success && schemaResult.data) {
        // Handle cases where data is not in a 'rows' array
        if (Array.isArray(schemaResult.data)) {
            rows = schemaResult.data;
        }
    }

    if (rows.length > 0) {
        const columnNames = rows.map(row => {
            if (typeof row !== 'object' || row === null) return null;
            // Common column names for schema info: 'name', 'column_name', 'Field'
            return row.name || row.column_name || row.Field || Object.values(row)[1]; // Often the second column is the name
        }).filter(Boolean);

        if (columnNames.length > 0) {
            console.log(`✅ Extracted column names for ${tableName}: ${columnNames.join(', ')}`);
            return [...new Set(columnNames)]; // Return unique names
        }
    }

    console.log(`⚠️ Could not parse column names for table "${tableName}" from the provided structure.`);
    return [];
}

module.exports = { runSqlSchemaAgent };
