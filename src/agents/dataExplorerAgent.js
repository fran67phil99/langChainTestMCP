// Data Explorer Agent - Specialized agent for intelligent data exploration with A2A communication
const { HumanMessage } = require('@langchain/core/messages');
const { createTrackedLLM, logAgentActivity } = require('../utils/langsmithConfig');
const { runSqlSchemaAgent } = require('./sqlSchemaAgent');
const { selectMcpTool, runMcpAgent } = require('./mcpAgent');
const { a2aLogger } = require('../utils/a2aLogger');

// Initialize LLM for data exploration with LangSmith tracing
const llm = createTrackedLLM({
  modelName: "gpt-4o-mini",
  temperature: 0.3, // Lower temperature for more consistent data queries
});

/**
 * Data Explorer Agent - Converts natural language requests into appropriate data operations
 * Uses Agent-to-Agent (A2A) communication with SQL Schema Agent for optimal results
 * @param {Array} messages - Message history
 * @param {Array} availableTools - Available MCP tools
 * @param {string} userQuery - User's query in English
 * @param {string} threadId - Thread identifier
 * @param {Object} a2aContext - A2A context data from previous agents
 * @returns {Promise<Object>} - Data exploration result
 */
async function runDataExplorerAgent(messages, availableTools, userQuery, threadId, a2aContext = null) {
  console.log(`🔍 Data Explorer Agent: Analyzing request: "${userQuery}"`);
  
  // Check if we're receiving execution results from orchestrator
  if (a2aContext && a2aContext.execution_results) {
    console.log(`🔄 Data Explorer: Processing execution results from orchestrator...`);
    return await processExecutionResults(a2aContext.execution_results, userQuery, threadId);
  }
  
  let schemaResult = null;

  // Check if we have A2A context data to analyze first
  if (a2aContext) {
      // Dynamically find the schema from any agent/context that provides it
      let schemaAgentResponse = Object.values(a2aContext).find(
          (val) => val && val.agent === 'sql_schema' && val.schema
      );
      
      // If not found with agent field, look for any object with schema structure
      if (!schemaAgentResponse) {
          schemaAgentResponse = Object.values(a2aContext).find(
              (val) => val && val.schema && val.schema.tables
          );
      }
      
      // Also check direct schema context keys
      if (!schemaAgentResponse && a2aContext.schema_context) {
          schemaAgentResponse = a2aContext.schema_context;
      }
      
      // Search for schema in any context key containing "schema"
      if (!schemaAgentResponse) {
          for (const [key, val] of Object.entries(a2aContext)) {
              if (key.includes('schema') && val) {
                  // Check if it's a direct schema object
                  if (val.schema && val.schema.tables) {
                      console.log(`📊 Data Explorer: Found schema in key "${key}"`);
                      schemaAgentResponse = val;
                      break;
                  }
                  // Check if the value itself has tables (direct schema)
                  if (val.tables) {
                      console.log(`📊 Data Explorer: Found direct schema in key "${key}"`);
                      schemaAgentResponse = { schema: val };
                      break;
                  }
                  // Check if it's an agent result with summary but no schema
                  if (val.agent === 'sql_schema' && val.summary && !val.schema) {
                      console.log(`📊 Data Explorer: Found SQLSchemaAgent summary, requesting fresh schema discovery`);
                      // Force schema discovery since we only have a summary
                      schemaAgentResponse = null;
                      break;
                  }
              }
          }
      }

      if (schemaAgentResponse) {
          console.log(`📊 Data Explorer: Found schema in A2A context.`);
          console.log(`📊 Schema found with ${schemaAgentResponse.schema?.tables?.length || 0} tables`);
          
          // If we found a schema with valid tables, use it
          if (schemaAgentResponse.schema?.tables?.length > 0) {
              // Ensure the schemaResult has the same structure as a direct call
              schemaResult = { 
                  success: true, 
                  schema: schemaAgentResponse.schema || schemaAgentResponse, 
                  ...schemaAgentResponse 
              };
          } else {
              // We found a context entry but no valid schema - force discovery
              console.log(`⚠️ Data Explorer: A2A context exists but no valid schema found - forcing schema discovery`);
              schemaAgentResponse = null; // This will trigger schema discovery below
          }
      } else if (Object.keys(a2aContext).length > 0) {
          console.log(`📊 Data Explorer: Found other A2A context data, analyzing existing data instead of querying database...`);
          return await analyzeA2AData(userQuery, a2aContext, threadId);
      }
  }
  
  // Log data explorer start
  logAgentActivity('data_explorer_agent', 'exploration_start', {
    userQuery,
    availableTools: availableTools.length,
    threadId
  });
  
  try {
    // 1. Analyze the user's intent and determine the best data operation
    const dataOperation = await analyzeDataIntent(userQuery, availableTools);
    console.log(`🎯 Data Explorer: Identified operation: ${dataOperation.type}`);
    
    console.log(`🔍 Data Explorer: DEBUG - About to check conditions...`);
    console.log(`   Schema tables: ${schemaResult?.schema?.tables?.length || 0}`);
    console.log(`   Query: "${userQuery}"`);
    console.log(`   Operation type: ${dataOperation.type}`);

    // 2. A2A Communication: Request schema from SQL Schema Agent if not already present
    if (!schemaResult) {
        console.log(`🤝 Data Explorer: Requesting schema from SQL Schema Agent...`);
        
        // Log A2A delegation
        a2aLogger.logDelegation('DataExplorer', 'SQLSchemaAgent', 'schema_discovery', {
          userQuery: userQuery,
          action: 'discover_schema'
        }, threadId);
        
        const schemaRequest = {
          action: 'discover_schema',
          from: 'data_explorer',
          threadId: threadId
        };
        
        schemaResult = await runSqlSchemaAgent(schemaRequest, availableTools, threadId);
        
        // Handle multi-step schema discovery if needed
        if (schemaResult.success && schemaResult.needs_execution && schemaResult.plan) {
            console.log(`🔄 Data Explorer: Schema discovery requires plan execution (${schemaResult.plan.length} steps)...`);
            
            // Execute the schema discovery plan
            const executionResults = [];
            for (const step of schemaResult.plan) {
                const stepParamsStr = JSON.stringify(step.parameters || {}).substring(0, 100);
                console.log(`  ▶️ Executing schema step: ${step.tool_name} - ${stepParamsStr}...`);
                
                try {
                    const tool = availableTools.find(t => t.name === step.tool_name);
                    if (!tool) {
                        throw new Error(`Tool ${step.tool_name} not found in available tools`);
                    }
                    
                    const stepResult = await runMcpAgent(
                        [], // messages
                        tool, // selected tool
                        step.parameters, // user query (the SQL query in this case)
                        threadId, // threadId  
                        availableTools // availableTools
                    );
                    
                    // Extract the tool result properly for the SQL Schema Agent
                    let toolResult;
                    if (stepResult.success && stepResult.data) {
                        // If the MCP Agent executed successfully and has data, use that
                        toolResult = stepResult.data;
                    } else if (stepResult.finalResponse) {
                        // If there's a final response, try to parse it
                        try {
                            toolResult = JSON.parse(stepResult.finalResponse);
                        } catch (e) {
                            toolResult = stepResult.finalResponse;
                        }
                    } else {
                        // Use the entire result
                        toolResult = stepResult;
                    }
                    
                    executionResults.push({
                        success: stepResult.success,
                        tool_result: toolResult,
                        context: step.context
                    });
                    console.log(`  ✅ Schema step completed: ${step.tool_name}`);
                } catch (error) {
                    console.log(`  ❌ Schema step failed: ${step.tool_name} - ${error.message}`);
                    executionResults.push({
                        success: false,
                        error: error.message,
                        context: step.context
                    });
                }
            }
            
            // Continue schema discovery with execution results
            const continueRequest = {
                action: 'discover_schema',
                from: 'data_explorer',
                threadId: threadId,
                execution_results: executionResults,
                A2A_context: schemaResult.A2A_context
            };
            
            schemaResult = await runSqlSchemaAgent(continueRequest, availableTools, threadId);
            
            // If still needs execution, do another round
            while (schemaResult.success && schemaResult.needs_execution && schemaResult.plan) {
                console.log(`🔄 Data Explorer: Schema discovery requires additional execution (${schemaResult.plan.length} steps)...`);
                
                const additionalResults = [];
                for (const step of schemaResult.plan) {
                    const stepParamsStr = JSON.stringify(step.parameters || {}).substring(0, 100);
                    console.log(`  ▶️ Executing additional schema step: ${step.tool_name} - ${stepParamsStr}...`);
                    
                    try {
                        const tool = availableTools.find(t => t.name === step.tool_name);
                        if (!tool) {
                            throw new Error(`Tool ${step.tool_name} not found in available tools`);
                        }
                        
                        const stepResult = await runMcpAgent(
                            [], // messages
                            tool, // selected tool
                            step.parameters, // user query (the SQL query in this case)
                            threadId, // threadId  
                            availableTools // availableTools
                        );
                        
                        // Extract the tool result properly for the SQL Schema Agent
                        let toolResult;
                        if (stepResult.success && stepResult.data) {
                            // If the MCP Agent executed successfully and has data, use that
                            toolResult = stepResult.data;
                        } else if (stepResult.finalResponse) {
                            // If there's a final response, try to parse it
                            try {
                                toolResult = JSON.parse(stepResult.finalResponse);
                            } catch (e) {
                                toolResult = stepResult.finalResponse;
                            }
                        } else {
                            // Use the entire result
                            toolResult = stepResult;
                        }
                        
                        additionalResults.push({
                            success: stepResult.success,
                            tool_result: toolResult,
                            context: step.context
                        });
                        console.log(`  ✅ Additional schema step completed: ${step.tool_name}`);
                    } catch (error) {
                        console.log(`  ❌ Additional schema step failed: ${step.tool_name} - ${error.message}`);
                        additionalResults.push({
                            success: false,
                            error: error.message,
                            context: step.context
                        });
                    }
                }
                
                // Continue schema discovery with additional results
                const nextRequest = {
                    action: 'discover_schema',
                    from: 'data_explorer',
                    threadId: threadId,
                    execution_results: additionalResults,
                    A2A_context: schemaResult.A2A_context
                };
                
                schemaResult = await runSqlSchemaAgent(nextRequest, availableTools, threadId);
            }
        }
        
        // Log A2A completion
        a2aLogger.logCompletion('SQLSchemaAgent', 'DataExplorer', 'schema_discovery', {
          success: schemaResult.success,
          tablesFound: schemaResult.schema?.tables?.length || 0
        }, threadId);
        
        if (!schemaResult.success) {
          throw new Error(`Schema discovery failed: ${schemaResult.error}`);
        }
    }

    // 3. Check if we have valid schema data
    if (!schemaResult.schema || !schemaResult.schema.tables || schemaResult.schema.tables.length === 0) {
      // No tables found - provide guidance
      return {
        success: false,
        agent: 'data_explorer',
        error: 'No database tables found',
        userQuery,
        threadId,
        guidance: {
          message: 'Il database sembra essere vuoto o non accessibile. Verifica la connessione al database.',
          suggestions: [
            'Controlla che il server MCP sia in esecuzione',
            'Verifica la configurazione del database',
            'Assicurati che il database contenga delle tabelle'
          ]
        }
      };
    }
      console.log(`✅ Data Explorer: Schema discovered - Tables: ${schemaResult.schema.tables.join(', ')}`);
    
    console.log(`🔍 Data Explorer: DEBUG - Checking column search query...`);
    
    // 4. Special handling for column search queries
    if (isColumnSearchQuery(userQuery, schemaResult.schema)) {
      console.log(`🔍 Data Explorer: Column search query detected`);
      const columnSearchResult = handleColumnSearch(userQuery, schemaResult.schema);
      
      // Log column search activity
      logAgentActivity('data_explorer_agent', 'column_search_success', {
        userQuery,
        columnsFound: columnSearchResult.columnsFound.length,
        searchTerm: columnSearchResult.searchTerm,
        threadId
      });
      
      return {
        success: true,
        agent: 'data_explorer',
        operation: { type: 'column_search' },
        schema: schemaResult.schema,
        formattedResponse: columnSearchResult.formattedResponse,
        userQuery,
        threadId,
        collaboratedWith: {
          sqlSchemaAgent: true
        }
      };
    }
    
    console.log(`🔍 Data Explorer: DEBUG - Checking generic request...`);
    
    // 5. If user request is too generic, suggest specific tables
    if (isGenericRequest(userQuery, dataOperation) && schemaResult.schema.tables.length > 0) {
      const availableTables = schemaResult.schema.tables;
      const tableInfo = schemaResult.schema.detailed || {};
      
      return {
        success: true,
        agent: 'data_explorer',
        operation: dataOperation,
        schema: schemaResult.schema,
        userQuery,
        threadId,
        needsSpecification: true,
        guidance: {
          message: `La tua richiesta "${userQuery}" è generica. Specifica da quale tabella vuoi leggere i dati.`,
          availableTables: availableTables,
          tableDetails: tableInfo,
          suggestions: availableTables.map(table => `"Mostra le prime 10 righe della tabella ${table}"`)
        }
      };
    }
    
    console.log(`🔍 Data Explorer: DEBUG - Proceeding to query generation...`);
    
    // 5. A2A Communication: Request optimized query generation
    console.log(`🤝 Data Explorer: Requesting optimized query from SQL Schema Agent...`);
    
    // Log A2A delegation for query generation
    a2aLogger.logDelegation('DataExplorer', 'SQLSchemaAgent', 'query_generation', {
      userQuery: userQuery,
      operation: dataOperation,
      availableTables: schemaResult.schema?.tables || []
    }, threadId);
    
    const queryRequest = {
      action: 'generate_query',
      from: 'data_explorer',
      params: {
        userIntent: userQuery,
        schema: schemaResult.schema,
        operation: dataOperation
      },
      threadId: threadId
    };
    
    const queryResult = await runSqlSchemaAgent(queryRequest, availableTools, threadId);
    
    // Log A2A completion for query generation
    a2aLogger.logCompletion('SQLSchemaAgent', 'DataExplorer', 'query_generation', {
      success: queryResult.success,
      sqlGenerated: !!queryResult.sqlQuery,
      queryLength: queryResult.sqlQuery?.length || 0
    }, threadId);
    
    if (!queryResult.success) {
      throw new Error(`Query generation failed: ${queryResult.error}`);
    }
    
    const optimizedQuery = queryResult.query;
    
    console.log(`📝 Data Explorer: Generated optimized query: ${optimizedQuery}`);
    
    // 6. Use MCP Agent for dynamic tool selection and execution
    console.log(`🤖 Data Explorer: Using MCP Agent for dynamic tool selection and execution...`);
    
    // Use MCP Agent to select the best tool based on the query and tool descriptions
    const selectedTool = await selectMcpTool(`Execute SQL query: ${optimizedQuery}`, availableTools);
    if (!selectedTool) {
      throw new Error('MCP Agent could not find a suitable tool for database operations');
    }
    
    console.log(`🎯 Data Explorer: MCP Agent selected tool: ${Array.isArray(selectedTool) ? selectedTool.map(t => t.name).join(', ') : selectedTool.name}`);
    
    // 7. Execute the query via MCP Agent with the selected tool
    const mcpResult = await runMcpAgent(
      messages, 
      selectedTool, 
      { query: optimizedQuery }, // Direct tool call with parameters
      threadId, 
      availableTools
    );
    
    if (!mcpResult.success) {
      throw new Error(`MCP Agent execution failed: ${mcpResult.error}`);
    }
    
    console.log(`✅ Data Explorer: Query executed successfully via MCP Agent`);
    
    // 8. Process and format the results
    const formattedResult = await formatDataResponse(
      mcpResult.response || mcpResult.mcpData, 
      userQuery, 
      dataOperation, 
      optimizedQuery, 
      schemaResult.schema
    );
    
    // Return successful data exploration result
    return {
      success: true,
      agent: 'data_explorer',
      data: mcpResult.response || mcpResult.mcpData,
      formattedResponse: formattedResult,
      operation: dataOperation,
      schema: schemaResult.schema,
      sqlQuery: optimizedQuery,
      queryUsed: optimizedQuery,
      userQuery,
      threadId,
      collaboratedWith: {
        sqlSchemaAgent: true,
        mcpAgent: true
      },
      a2aSummary: (() => {
        // Create a comprehensive summary that includes actual data for A2A communication
        const dataPreview = mcpResult.response || mcpResult.mcpData;
        let summary = `Data explorer query executed successfully. `;
        
        if (dataPreview && typeof dataPreview === 'object') {
          if (dataPreview.data) {
            summary += `Retrieved data with ${dataPreview.data.columns?.length || 0} columns. `;
            if (dataPreview.data.rows && Array.isArray(dataPreview.data.rows)) {
              summary += `Found ${dataPreview.data.rows.length} records. `;
              // Include a sample of the actual data
              const sampleData = dataPreview.data.rows.slice(0, 3).map(row => {
                if (typeof row === 'object') {
                  const keys = Object.keys(row).slice(0, 3);
                  return keys.map(key => `${key}: ${row[key]}`).join(', ');
                }
                return String(row);
              });
              if (sampleData.length > 0) {
                summary += `Sample data: ${sampleData.join(' | ')}.`;
              }
            }
          } else if (dataPreview.universal_titles || dataPreview.collections || dataPreview.latest_issues) {
            // Handle structured data responses
            summary += `Retrieved structured data: `;
            if (dataPreview.universal_titles) summary += `${dataPreview.universal_titles.length} universal titles, `;
            if (dataPreview.collections) summary += `${dataPreview.collections.length} collections, `;
            if (dataPreview.latest_issues) summary += `${dataPreview.latest_issues.length} latest issues, `;
            if (dataPreview.latest_sales) summary += `${dataPreview.latest_sales.length} sales dates.`;
          }
        }
        
        return summary.length > 500 ? summary.substring(0, 500) + '...' : summary;
      })()
    };
    
  } catch (error) {
    console.error(`❌ Data Explorer Agent error: ${error.message}`);
    
    // Log error
    logAgentActivity('data_explorer_agent', 'exploration_error', {
      error: error.message,
      userQuery,
      threadId
    });
    
    return {
      success: false,
      agent: 'data_explorer',
      error: error.message,
      userQuery,
      threadId
    };
  }
}

/**
 * Checks if the user request is too generic and needs table specification
 */
function isGenericRequest(userQuery, operation) {
  const query = userQuery.toLowerCase();
  
  // If the query mentions specific business concepts, it's NOT generic
  const mentionsSpecificConcepts = /\b(universal|titles?|collections?|issues?|sales?|date|latest|running|schema|dataset)\b/i.test(query);
  if (mentionsSpecificConcepts) {
    console.log(`🎯 Data Explorer: Query mentions specific business concepts - NOT generic`);
    return false;
  }
  
  // If the query mentions specific table names or data sources, it's not generic
  const mentionsSpecificTable = /\b(table|tabella|data|dati|database|db|collection|schema)\b/i.test(query);
  if (mentionsSpecificTable) {
    console.log(`🎯 Data Explorer: Query mentions specific table/data source - NOT generic`);
    return false;
  }
  
  // If the operation type indicates complex analysis, it's NOT generic
  if (operation.type === 'custom_query' || operation.parameters?.complexity === 'complex') {
    console.log(`🎯 Data Explorer: Operation type indicates complex analysis - NOT generic`);
    return false;
  }
    // Generic patterns that don't specify a table - completely language agnostic
  const genericPatterns = [
    // Italian patterns
    /\b(prime?|primi?|prime)\s*\d*\s*(righe?|record|elementi?)\s*$/i,
    /\b(mostra|visualizza|vedi|leggi)\s*(i\s*)?(righe?|record|elementi?)\s*$/i,
    
    // English patterns
    /\b(first|top|initial)\s*\d*\s*(rows?|records?|lines?|items?)\s*$/i,
    /\b(show|display|see|read|get|fetch)\s*(the\s*)?(rows?|records?|items?)\s*$/i,
    
    // Very generic without any specifics
    /^(che\s*(cosa\s*)?c['\']?è|cosa\s*contiene|what['\']?s\s*there|what\s*contains)$/i
  ];
  
  // Check if query matches any generic pattern
  const isGeneric = genericPatterns.some(pattern => pattern.test(query));
  
  console.log(`🔍 Data Explorer: Generic request check - Query: "${query}", Generic: ${isGeneric}, Mentions table: ${mentionsSpecificTable}`);
  
  return isGeneric;
}

/**
 * Analyzes user intent to determine the appropriate data operation
 */
async function analyzeDataIntent(userQuery, availableTools) {
  const analysisPrompt = `You are an advanced data operation classifier with semantic understanding. Analyze this user request and classify it intelligently.

User Request: "${userQuery}"

SEMANTIC ANALYSIS GUIDELINES:

1. **Complex Analysis Operations** (type: "custom_query"):
   - Queries asking for "latest/last/most recent" combined with grouping ("for each", "by", "per")
   - Queries asking for aggregated data ("total", "count", "sum", "average" with grouping)
   - Queries asking for relationships between different data fields
   - Queries asking for date ranges, time-based analysis
   - Multiple data points in one request
   - Examples: "latest issue of each collection", "total sales by title", "which titles are running by date range"

2. **List/Discovery Operations** (type: "discovery"):
   - Requests for "full list", "all items", "what are the..."
   - Requests to "identify", "extract", "show all"
   - Examples: "full list of titles", "identify all collections", "extract all Universal titles"

3. **Search Operations** (type: "search"):
   - Looking for specific items matching criteria
   - Contains specific names, codes, or identifiers
   - Uses "find", "search", "locate", "where"

4. **Preview Operations** (type: "preview"):
   - Simple requests to see data samples
   - "show first", "display", "preview", "sample"

5. **Summary Operations** (type: "summary"):
   - High-level statistics without grouping
   - "overview", "summary", "statistics", "totals"

INTELLIGENT PARAMETER EXTRACTION:
- For complex queries, identify key concepts (titles, collections, dates, issues, sales)
- Extract grouping criteria ("each", "by", "per")
- Extract ordering requirements ("latest", "oldest", "top")
- Extract filtering hints (specific names, date ranges)

Respond with JSON only:
{
  "type": "operation_type",
  "parameters": {
    "complexity": "simple|moderate|complex",
    "grouping_required": true/false,
    "aggregation_type": "max|min|count|sum|list|distinct",
    "key_concepts": ["concept1", "concept2"],
    "requires_schema_analysis": true/false,
    "limit": number_if_applicable
  },
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation of classification"
}`;

  try {
    const response = await llm.invoke([new HumanMessage(analysisPrompt)]);
    const analysis = JSON.parse(response.content.trim());
    
    // Apply smart defaults based on operation type
    if (analysis.type === 'preview' && !analysis.parameters?.limit) {
      analysis.parameters = { ...analysis.parameters, limit: 10 };
    }
    
    // Ensure we have parameters object
    if (!analysis.parameters) {
      analysis.parameters = {};
    }
    
    return analysis;
  } catch (error) {
    console.warn(`⚠️ Intent analysis failed, using smart fallback: ${error.message}`);
    
    // Smart fallback based on language detection
    const query = userQuery.toLowerCase();
    let operationType = 'custom_query'; // Default to custom_query for complex requests
    let limit = null;
    
    // Don't confuse "using schema context" with schema requests
    const hasSchemaContext = /using\s+schema\s+context|with\s+schema\s+context/i.test(query);
    
    // Basic pattern matching for fallback
    if (/\b(cerca|search|find|filter|where)\b/i.test(query) && !hasSchemaContext) {
      operationType = 'search';
    } else if (/\b(conta|count|quanti|how\s+many|total)\b/i.test(query)) {
      operationType = 'count';
    } else if (/\b(struttura|structure|schema|describe|columns)\b/i.test(query) && !hasSchemaContext) {
      operationType = 'schema';
    } else if (/\b(riassunto|summary|stats|statistics|analytics)\b/i.test(query)) {
      operationType = 'summary';
    } else if (/\b(full\s+list|all\s+titles|identify\s+all|extract\s+all|retrieve.*list)\b/i.test(query)) {
      operationType = 'discovery';
    } else if (/\b(latest|last|most\s+recent).*\b(each|every|per|by)\b/i.test(query)) {
      operationType = 'custom_query'; // Latest/last for each = complex query
    } else if (/\b(running.*date|date.*range|publication.*date)\b/i.test(query)) {
      operationType = 'custom_query'; // Date range analysis = complex query
    } else if (/\b(prime?|primi?|first|show\s+me|mostra)\s*\d*\s*(righe?|record|elementi?)\b/i.test(query)) {
      operationType = 'preview';
      const numberMatch = query.match(/\b(\d+)\b/);
      if (numberMatch) {
        limit = parseInt(numberMatch[1]);
      } else {
        limit = 10;
      }
    }
    
    // If query has multiple complex requirements, ensure it's custom_query
    const complexityIndicators = [
      /\b(latest|last|most\s+recent)\b/i,
      /\b(each|every|per|by)\b/i,
      /\b(date.*range|publication.*date)\b/i,
      /\b(collection|titles?|universal)\b/i
    ];
    const complexityCount = complexityIndicators.filter(pattern => pattern.test(query)).length;
    if (complexityCount >= 2) {
      operationType = 'custom_query';
    }
    
    return {
      type: operationType,
      parameters: { 
        limit: limit,
        complexity: complexityCount >= 2 ? 'complex' : 'simple',
        grouping_required: /\b(each|every|per|by)\b/i.test(query),
        key_concepts: extractKeyConceptsFromQuery(query)
      },
      confidence: 0.6,
      reasoning: 'Fallback analysis based on keyword detection with enhanced logic',
      detected_language: 'auto-detected'
    };
  }
}

/**
 * Extract key concepts from user query for better parameter detection
 */
function extractKeyConceptsFromQuery(query) {
  const concepts = [];
  const lowerQuery = query.toLowerCase();
  
  if (/\b(universal|universali?)\b/i.test(lowerQuery)) concepts.push('universal');
  if (/\b(titles?|titoli?)\b/i.test(lowerQuery)) concepts.push('titles');
  if (/\b(collections?|collezioni?)\b/i.test(lowerQuery)) concepts.push('collections');
  if (/\b(issue|issues?|numero|numeri)\b/i.test(lowerQuery)) concepts.push('issues');
  if (/\b(sales?|vendite?|sale_date)\b/i.test(lowerQuery)) concepts.push('sales');
  if (/\b(date|data|tempo|time|range)\b/i.test(lowerQuery)) concepts.push('dates');
  if (/\b(latest|last|ultimo|recente|recent)\b/i.test(lowerQuery)) concepts.push('latest');
  if (/\b(running|pubblicat|publish|current)\b/i.test(lowerQuery)) concepts.push('running');
  
  return concepts;
}

/**
 * Limit data size to avoid OpenAI rate limits
 * Reduces data to manageable size while preserving structure and key information
 */
function limitDataForLLM(data) {
  if (!data) return data;
  
  // If it's an array, limit to first 50 records
  if (Array.isArray(data)) {
    const limited = data.slice(0, 50);
    
    // For each object in the array, limit the number of properties and their lengths
    return limited.map(item => {
      if (typeof item === 'object' && item !== null) {
        const limitedItem = {};
        const keys = Object.keys(item).slice(0, 20); // Max 20 properties per object
        
        keys.forEach(key => {
          const value = item[key];
          if (typeof value === 'string' && value.length > 200) {
            limitedItem[key] = value.substring(0, 197) + '...';
          } else if (Array.isArray(value)) {
            limitedItem[key] = value.slice(0, 10); // Max 10 array items
          } else if (typeof value === 'object' && value !== null) {
            limitedItem[key] = '[Oggetto complesso]'; // Don't expand nested objects
          } else {
            limitedItem[key] = value;
          }
        });
        
        // Add metadata if we truncated
        if (Object.keys(item).length > 20) {
          limitedItem['__truncated_properties'] = Object.keys(item).length - 20;
        }
        
        return limitedItem;
      }
      return item;
    });
  }
  
  // If it's a single object, apply similar limits
  if (typeof data === 'object' && data !== null) {
    const limitedData = {};
    const keys = Object.keys(data).slice(0, 50); // Max 50 properties
    
    keys.forEach(key => {
      const value = data[key];
      if (typeof value === 'string' && value.length > 500) {
        limitedData[key] = value.substring(0, 497) + '...';
      } else if (Array.isArray(value)) {
        limitedData[key] = value.slice(0, 20); // Max 20 array items
      } else if (typeof value === 'object' && value !== null) {
        // For nested objects, keep only first level
        const nestedKeys = Object.keys(value).slice(0, 10);
        const simplifiedNested = {};
        nestedKeys.forEach(nKey => {
          const nValue = value[nKey];
          if (typeof nValue === 'string' && nValue.length > 100) {
            simplifiedNested[nKey] = nValue.substring(0, 97) + '...';
          } else if (typeof nValue === 'object') {
            simplifiedNested[nKey] = '[Oggetto complesso]';
          } else {
            simplifiedNested[nKey] = nValue;
          }
        });
        limitedData[key] = simplifiedNested;
      } else {
        limitedData[key] = value;
      }
    });
    
    // Add metadata if we truncated
    if (Object.keys(data).length > 50) {
      limitedData['__truncated_properties'] = Object.keys(data).length - 50;
    }
    
    return limitedData;
  }
    return data;
}

/**
 * Extract actual data from MCP response structure
 * MCP responses come in format: { content: [{ type: 'text', text: 'JSON_STRING' }] }
 */
function extractDataFromMcpResult(mcpResult) {
    console.log(`🔍 Extracting data from MCP result:`, JSON.stringify(mcpResult, null, 2));
    if (!mcpResult) return null;

    // Handle potential nesting inside tool_result
    const resultData = mcpResult.tool_result || mcpResult;

    // Handle MCP response format with content array first
    if (resultData && resultData.content && Array.isArray(resultData.content)) {
        for (const contentItem of resultData.content) {
            if (contentItem.type === 'text' && contentItem.text) {
                try {
                    const parsedData = JSON.parse(contentItem.text);
                    // Recursively call to handle the parsed JSON
                    const data = extractDataFromMcpResult(parsedData);
                    // If we found data, return it. Check for non-empty array or object.
                    if (data && (Array.isArray(data) ? data.length > 0 : (typeof data === 'object' && data !== null ? Object.keys(data).length > 0 : false))) {
                        return data;
                    }
                } catch (e) {
                    // Not JSON, maybe it's the data itself as a string. Let other parsers try.
                    console.warn(`⚠️ Content text is not valid JSON, will attempt other parsing methods. Text: "${contentItem.text}"`);
                }
            }
        }
    }

    // If the resultData itself is the data we need
    const data = resultData.data || resultData;

    // If data has rows, return the rows (most common for SQL queries)
    if (data && data.rows && Array.isArray(data.rows)) {
        console.log(`✅ Extracted ${data.rows.length} rows from 'data.rows'.`);
        return data.rows;
    }

    // If data has tables, return the tables (for schema discovery)
    if (data && data.tables && Array.isArray(data.tables)) {
        console.log(`✅ Extracted ${data.tables.length} tables from 'data.tables'.`);
        return data.tables;
    }
    
    // If we have a success wrapper
    if (data && data.success && data.data) {
        // Recursively call on the nested data
        console.log(`✅ Found success wrapper, extracting nested data.`);
        return extractDataFromMcpResult(data.data);
    }

    // If data is an array itself, return it
    if (Array.isArray(data)) {
        console.log(`✅ Extracted data array with ${data.length} items.`);
        return data;
    }

    // If the data is an object with content (another layer of MCP format)
    if (typeof data === 'object' && data !== null && !Array.isArray(data) && data.content) {
        console.log(`✅ Found nested content, running extraction again.`);
        return extractDataFromMcpResult(data);
    }

    // If it's a non-array object, it might be a single record
    if (typeof data === 'object' && data !== null && !Array.isArray(data) && Object.keys(data).length > 0) {
        console.log(`✅ Extracted a single object record.`);
        return data;
    }

    // If all else fails, and the original result had string content, return that
    if (mcpResult.content && Array.isArray(mcpResult.content)) {
        const textContent = mcpResult.content.find(item => item.type === 'text');
        if (textContent && textContent.text) {
            console.log(`✅ Falling back to raw text content.`);
            return textContent.text;
        }
    }

    console.log(`⚠️ Could not extract structured data from result. Returning cleaned data.`);
    return data; // Return the cleaned data, whatever it is
}

/**
 * Format the data response in a user-friendly way
 */
async function formatDataResponse(mcpResult, userQuery, operation, sqlQuery, schema) {
  // Limit data size to avoid OpenAI rate limits (max ~50K tokens for GPT-3.5-turbo)
  const limitedResult = limitDataForLLM(mcpResult);
  const jsonString = JSON.stringify(limitedResult, null, 2);
  
  // If JSON is still too large (>100K chars ≈ 25K tokens), use fallback
  if (jsonString.length > 100000) {
    console.log(`📊 Data too large for LLM (${jsonString.length} chars), using fallback formatting`);
    return formatDataFallback(mcpResult, userQuery, operation, sqlQuery, schema);
  }
  
  const formatPrompt = `You are a professional multilingual data assistant. Format this data response in a clear, professional way.

User asked: "${userQuery}"
Operation performed: ${operation.type}
Available database tables: ${schema.tables.join(', ')}
SQL Query executed: ${sqlQuery}

Raw data from database: ${jsonString}

CRITICAL FORMATTING REQUIREMENTS - FOLLOW THIS EXACT STRUCTURE:

**FORMAT TEMPLATE (MANDATORY):**

📊 **[Topic] Overview**
A total of [X] [items] [status description], showcasing [key characteristics]. The [items] include:

[List items in bullet format with proper formatting]

## [Main Data Section Title]
The [data description] for these [items] vary, with the most recent being [specific detail]. Other notable [details] include:

• **[Item 1]** for [Details] (Latest [Info]: [Date/Value])
• **[Item 2]** for [Details] (Latest [Info]: [Date/Value])
[Continue with consistent formatting]

## Summary of [Key Metric]
The [analysis] reveal [key insights]. [Summary statement with business value/conclusions].

**SPECIFIC FORMATTING RULES:**
1. Always start with an emoji and descriptive overview paragraph with total counts
2. Use clear ## section headings (like "Key Findings", "Data Overview")
3. Present data as structured bullet points, not narrative paragraphs
4. Use **bold** for all important numbers, titles, and key information
5. Include specific numbers and statistics prominently
6. Use consistent formatting for repeated items
7. End with a professional summary paragraph
8. Group related information under logical section headings
9. NEVER show raw JSON data to the user
10. Always format tabular data as clean Markdown tables with proper headers
11. Detect the language of the user's query and respond in the same language
12. **STICK TO THE DATA**: NEVER invent information not in the raw data

ENHANCED STATISTICAL ANALYSIS (integrate into sections):
- Always show total record count in opening
- Show unique value counts and percentages for categories
- Identify most/least common values with specific numbers
- Show date ranges and temporal patterns clearly
- Provide business insights based on data patterns
- Include data completeness and quality observations

**EXAMPLE STRUCTURE TO FOLLOW:**
📊 **Data Overview**
A total of [X] records found matching your query. The results show a variety of categories and data points relevant to your search.

## Key Findings
Based on the data analysis, here are the main insights:

• Most frequent category: [Category Name] with [X] occurrences
• Date range: [Start Date] to [End Date]
• Notable patterns: [Pattern description]

## Detailed Results
The complete analysis shows:

• **Item 1**: [Description with key metrics]
• **Item 2**: [Description with key metrics]
[etc.]

## Summary
The data analysis reveals [key insights based on actual data patterns], indicating [business or analytical conclusion based on findings].

Remember: The user should see a well-structured, scannable response with clear visual hierarchy, not narrative text.`;

  try {
    const response = await llm.invoke([new HumanMessage(formatPrompt)]);
    return response.content;
  } catch (error) {
    console.warn(`⚠️ Response formatting failed: ${error.message}`);
    // Enhanced fallback formatting - NO RAW JSON
    return formatDataFallback(mcpResult, userQuery, operation, sqlQuery, schema);
  }
}

/**
 * Enhanced fallback formatting function that creates user-friendly displays with statistical analysis
 */
function formatDataFallback(mcpResult, userQuery, operation, sqlQuery, schema) {
  const dataLength = Array.isArray(mcpResult) ? mcpResult.length : (mcpResult ? 1 : 0);
  const query = userQuery.toLowerCase();
  
  // Detect language for localized response
  const isItalian = /\b(voglio|vorrei|mostra|vedere|righe|dati|tabella|cerca|trova|quanti|cosa)\b/i.test(query);
  const isFrench = /\b(je\s+veux|montrer|voir|lignes|données|table|chercher|combien|qu['\']est)\b/i.test(query);
  const isSpanish = /\b(quiero|mostrar|ver|filas|datos|tabla|buscar|cuántos|qué\s+es)\b/i.test(query);
  const isGerman = /\b(ich\s+möchte|zeigen|sehen|zeilen|daten|tabelle|suchen|wie\s+viele|was\s+ist)\b/i.test(query);
  
  // Create user-friendly formatted data with statistical analysis
  const { formattedData, statistics } = createReadableDataFormatWithStats(mcpResult, dataLength);
  
  if (isItalian) {
    return `📊 **Risultati per: "${userQuery}"**

${formattedData}

📈 **Analisi Statistica:**
${statistics.italian}

**Dettagli tecnici:**
- **Query SQL eseguita:** \`${sqlQuery}\`
- **Tabelle disponibili:** ${schema.tables.join(', ')}
- **Record trovati:** ${dataLength}

💡 **Suggerimento:** ${dataLength === 0 ? 
  `Nessun dato trovato. Prova a esplorare le tabelle disponibili: ${schema.tables.join(', ')}` : 
  'Puoi esplorare ulteriormente i dati richiedendo breakdown specifici per campo, analisi temporali, o distribuzione per categorie.'}`;
  
  } else if (isFrench) {
    return `📊 **Résultats pour: "${userQuery}"**

${formattedData}

📈 **Analyse Statistique:**
${statistics.french}

**Détails techniques:**
- **Requête SQL exécutée:** \`${sqlQuery}\`
- **Tables disponibles:** ${schema.tables.join(', ')}
- **Enregistrements trouvés:** ${dataLength}

💡 **Suggestion:** ${dataLength === 0 ? 
  `Aucune donnée trouvée. Essayez d'explorer les tables disponibles: ${schema.tables.join(', ')}` : 
  'Vous pouvez explorer davantage les données en demandant des ventilations spécifiques par champ, des analyses temporelles, ou la distribution par catégories.'}`;
  
  } else if (isSpanish) {
    return `📊 **Resultados para: "${userQuery}"**

${formattedData}

📈 **Análisis Estadístico:**
${statistics.spanish}

**Detalles técnicos:**
- **Consulta SQL ejecutada:** \`${sqlQuery}\`
- **Tablas disponibles:** ${schema.tables.join(', ')}
- **Registros encontrados:** ${dataLength}

💡 **Sugerencia:** ${dataLength === 0 ? 
  `No se encontraron datos. Intenta explorar las tablas disponibles: ${schema.tables.join(', ')}` : 
  'Puedes explorar más los datos solicitando desglose específicos por campo, análisis temporal, o distribución por categorías.'}`;
  
  } else if (isGerman) {
    return `📊 **Ergebnisse für: "${userQuery}"**

${formattedData}

📈 **Statistische Analyse:**
${statistics.german}

**Technische Details:**
- **Ausgeführte SQL-Abfrage:** \`${sqlQuery}\`
- **Verfügbare Tabellen:** ${schema.tables.join(', ')}
- **Gefundene Datensätze:** ${dataLength}

💡 **Vorschlag:** ${dataLength === 0 ? 
  `Keine Daten gefunden. Versuchen Sie, die verfügbaren Tabellen zu erkunden: ${schema.tables.join(', ')}` : 
  'Sie können die Daten weiter erkunden, indem Sie spezifische Aufschlüsselungen nach Feldern, zeitliche Analysen oder Verteilungen nach Kategorien anfordern.'}`;
  
  } else {
    // Default to English
    return `📊 **Results for: "${userQuery}"**

${formattedData}

📈 **Statistical Analysis:**
${statistics.english}

**Technical Details:**
- **SQL Query executed:** \`${sqlQuery}\`
- **Available tables:** ${schema.tables.join(', ')}
- **Records found:** ${dataLength}

💡 **Suggestion:** ${dataLength === 0 ? 
  `No data found. Try exploring the available tables: ${schema.tables.join(', ')}` : 
  'You can further explore the data by requesting specific field breakdowns, temporal analysis, or distribution by categories.'}`;
  }
}

/**
 * Create readable data format with statistical analysis
 */
function createReadableDataFormatWithStats(mcpResult, dataLength) {
  if (dataLength === 0 || !mcpResult) {
    return {
      formattedData: '🔍 **Nessun dato trovato / No data found**',
      statistics: {
        italian: 'Nessun dato disponibile per l\'analisi statistica.',
        english: 'No data available for statistical analysis.',
        french: 'Aucune donnée disponible pour l\'analyse statistique.',
        spanish: 'No hay datos disponibles para análisis estadístico.',
        german: 'Keine Daten für statistische Analyse verfügbar.'
      }
    };
  }
  
  try {
    if (Array.isArray(mcpResult)) {
      // Handle array of objects (table data)
      if (mcpResult.length > 0 && typeof mcpResult[0] === 'object') {
        return createMarkdownTableWithStats(mcpResult);
      } else {
        // Simple array
        return createSimpleListWithStats(mcpResult);
      }
    } else if (typeof mcpResult === 'object') {
      // Single object
      return createKeyValueListWithStats(mcpResult);
    } else {
      // Primitive value
      return {
        formattedData: `**Valore:** ${mcpResult}`,
        statistics: {
          italian: `Valore singolo: ${mcpResult}`,
          english: `Single value: ${mcpResult}`,
          french: `Valeur unique: ${mcpResult}`,
          spanish: `Valor único: ${mcpResult}`,
          german: `Einzelwert: ${mcpResult}`
        }
      };
    }
  } catch (error) {
    console.warn('⚠️ Data formatting error:', error.message);
    return {
      formattedData: `**Dati trovati:** ${dataLength} record (formato complesso - contatta il supporto per assistenza nella visualizzazione)`,
      statistics: {
        italian: `${dataLength} record trovati ma con formato complesso.`,
        english: `${dataLength} records found but with complex format.`,
        french: `${dataLength} enregistrements trouvés mais avec format complexe.`,
        spanish: `${dataLength} registros encontrados pero con formato complejo.`,
        german: `${dataLength} Datensätze gefunden aber mit komplexem Format.`
      }
    };
  }
}

/**
 * Create a Markdown table with statistical analysis from array of objects
 */
function createMarkdownTableWithStats(data) {
  if (!data || data.length === 0) {
    return {
      formattedData: 'Nessun dato da visualizzare',
      statistics: {
        italian: 'Nessun dato per calcolare statistiche.',
        english: 'No data to calculate statistics.',
        french: 'Aucune donnée pour calculer les statistiques.',
        spanish: 'No hay datos para calcular estadísticas.',
        german: 'Keine Daten für Statistikberechnung.'
      }
    };
  }
  
  // Get all unique keys from all objects
  const allKeys = [...new Set(data.flatMap(obj => Object.keys(obj)))];
  
  // Limit to first 10 columns for readability
  const keys = allKeys.slice(0, 10);
  const hasMoreCols = allKeys.length > 10;
  
  // Create header
  let table = `| ${keys.join(' | ')} |\n`;
  table += `| ${keys.map(() => '---').join(' | ')} |\n`;
  
  // Limit to first 20 rows for readability
  const displayData = data.slice(0, 20);
  const hasMoreRows = data.length > 20;
  
  // Create rows
  displayData.forEach(row => {
    const values = keys.map(key => {
      const value = row[key];
      if (value === null || value === undefined) return '-';
      if (typeof value === 'string' && value.length > 50) {
        return value.substring(0, 47) + '...';
      }
      return String(value);
    });
    table += `| ${values.join(' | ')} |\n`;
  });
  
  // Calculate statistics for each column
  const columnStats = {};
  keys.forEach(key => {
    const values = data.map(row => row[key]).filter(val => val !== null && val !== undefined && val !== '');
    const uniqueValues = [...new Set(values)];
    
    columnStats[key] = {
      totalValues: values.length,
      uniqueValues: uniqueValues.length,
      mostCommon: getMostCommonValue(values),
      dataType: detectDataType(values)
    };
  });
  
  // Add summary information
  let summary = `\n📈 **Riepilogo dati:**\n`;
  summary += `- Righe visualizzate: ${displayData.length}${hasMoreRows ? ` di ${data.length} totali` : ''}\n`;
  summary += `- Colonne visualizzate: ${keys.length}${hasMoreCols ? ` di ${allKeys.length} totali` : ''}\n`;
  
  if (hasMoreRows) {
    summary += `\n💡 *Visualizzate solo le prime 20 righe per leggibilità. Usa filtri più specifici per vedere altri dati.*\n`;
  }
  
  if (hasMoreCols) {
    summary += `\n💡 *Visualizzate solo le prime 10 colonne. Colonne disponibili: ${allKeys.join(', ')}*\n`;
  }
  
  // Create statistical analysis
  const stats = {
    italian: createStatsText(columnStats, data.length, 'italian'),
    english: createStatsText(columnStats, data.length, 'english'),
    french: createStatsText(columnStats, data.length, 'french'),
    spanish: createStatsText(columnStats, data.length, 'spanish'),
    german: createStatsText(columnStats, data.length, 'german')
  };
  
  return {
    formattedData: table + summary,
    statistics: stats
  };
}

/**
 * Create a simple list with frequency analysis
 */
function createSimpleListWithStats(data) {
  const displayData = data.slice(0, 50); // Limit to 50 items
  const hasMore = data.length > 50;
  
  // Calculate frequency of each value
  const frequency = {};
  data.forEach(item => {
    const key = String(item);
    frequency[key] = (frequency[key] || 0) + 1;
  });
  
  // Sort by frequency (most common first)
  const sortedFreq = Object.entries(frequency)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 20); // Show top 20 most frequent
  
  let list = '**Valori più frequenti:**\n';
  sortedFreq.forEach(([value, count]) => {
    const percentage = ((count / data.length) * 100).toFixed(1);
    list += `• ${value} - ${count} volte (${percentage}%)\n`;
  });
  
  if (hasMore) {
    list += `\n💡 *Analizzati tutti i ${data.length} elementi, mostrati i 20 più frequenti.*`;
  }
  
  const uniqueCount = Object.keys(frequency).length;
  const mostCommon = sortedFreq[0];
  
  const stats = {
    italian: `**Valori totali:** ${data.length}\n**Valori unici:** ${uniqueCount}\n**Più frequente:** ${mostCommon[0]} (${mostCommon[1]} volte)`,
    english: `**Total values:** ${data.length}\n**Unique values:** ${uniqueCount}\n**Most frequent:** ${mostCommon[0]} (${mostCommon[1]} times)`,
    french: `**Valeurs totales:** ${data.length}\n**Valeurs uniques:** ${uniqueCount}\n**Plus fréquent:** ${mostCommon[0]} (${mostCommon[1]} fois)`,
    spanish: `**Valores totales:** ${data.length}\n**Valores únicos:** ${uniqueCount}\n**Más frecuente:** ${mostCommon[0]} (${mostCommon[1]} veces)`,
    german: `**Gesamtwerte:** ${data.length}\n**Eindeutige Werte:** ${uniqueCount}\n**Häufigster:** ${mostCommon[0]} (${mostCommon[1]} mal)`
  };
  
  return {
    formattedData: list,
    statistics: stats
  };
}

/**
 * Create a key-value list with analysis from an object
 */
function createKeyValueListWithStats(obj) {
  const entries = Object.entries(obj);
  
  let list = '**Dati trovati:**\n';
  
  entries.forEach(([key, value]) => {
    if (value === null || value === undefined) {
      list += `• **${key}:** (vuoto)\n`;
    } else if (Array.isArray(value)) {
      // Handle arrays better
      if (value.length === 0) {
        list += `• **${key}:** [Lista vuota]\n`;
      } else if (value.length <= 5) {
        list += `• **${key}:** [${value.join(', ')}]\n`;
      } else {
        list += `• **${key}:** [Lista di ${value.length} elementi: ${value.slice(0, 3).join(', ')}...]\n`;
      }
    } else if (typeof value === 'object') {
      // Handle nested objects with better expansion
      try {
        const keys = Object.keys(value);
        if (keys.length === 0) {
          list += `• **${key}:** (oggetto vuoto)\n`;
        } else if (keys.length <= 5) {
          // Show all properties for small objects
          const simplified = keys.slice(0, 5).map(k => {
            const v = value[k];
            if (typeof v === 'string' && v.length > 50) {
              return `${k}: ${v.substring(0, 47)}...`;
            } else if (typeof v === 'object') {
              return `${k}: [oggetto]`;
            }
            return `${k}: ${v}`;
          }).join(', ');
          list += `• **${key}:** {${simplified}}\n`;
        } else {
          // For larger objects, show summary
          const preview = keys.slice(0, 3).map(k => {
            const v = value[k];
            if (typeof v === 'string' && v.length > 30) {
              return `${k}: ${v.substring(0, 27)}...`;
            } else if (typeof v === 'object') {
              return `${k}: [oggetto]`;
            }
            return `${k}: ${v}`;
          }).join(', ');
          list += `• **${key}:** {${preview}... +${keys.length - 3} altre proprietà}\n`;
        }
      } catch (error) {
        list += `• **${key}:** [Oggetto non leggibile: ${error.message}]\n`;
      }
    } else if (typeof value === 'string' && value.length > 200) {
      list += `• **${key}:** ${value.substring(0, 197)}...\n`;
    } else {
      list += `• **${key}:** ${String(value)}\n`;
    }
  });
  
  // Only show meaningful statistics for single objects
  const nonEmptyFields = entries.filter(([,v]) => v !== null && v !== undefined && v !== '').length;
  const hasComplexData = entries.some(([,v]) => typeof v === 'object');
  
  let statsText = '';
  if (entries.length > 1) {
    statsText = `**Campi totali:** ${entries.length}\n**Campi con dati:** ${nonEmptyFields}`;
    if (hasComplexData) {
      statsText += '\n**Tipo:** Record con dati strutturati';
    }
  } else {
    statsText = 'Record singolo trovato';
  }
  
  const stats = {
    italian: statsText,
    english: statsText.replace('Campi totali', 'Total fields').replace('Campi con dati', 'Fields with data').replace('Record singolo trovato', 'Single record found').replace('Record con dati strutturati', 'Record with structured data'),
    french: statsText.replace('Campi totali', 'Champs totaux').replace('Campi con dati', 'Champs avec données').replace('Record singolo trovato', 'Enregistrement unique trouvé'),
    spanish: statsText.replace('Campi totali', 'Campos totales').replace('Campi con dati', 'Campos con datos').replace('Record singolo trovato', 'Registro único encontrado'),
    german: statsText.replace('Campi totali', 'Gesamtfelder').replace('Campi con dati', 'Felder mit Daten').replace('Record singolo trovato', 'Einzelner Datensatz gefunden')
  };
  
  return {
    formattedData: list,
    statistics: stats
  };
}

/**
 * Helper function to get the most common value in an array
 */
function getMostCommonValue(values) {
  if (values.length === 0) return null;
  
  const frequency = {};
  values.forEach(value => {
    const key = String(value);
    frequency[key] = (frequency[key] || 0) + 1;
  });
  
  return Object.entries(frequency)
    .sort(([,a], [,b]) => b - a)[0];
}

/**
 * Helper function to detect data type of values
 */
function detectDataType(values) {
  if (values.length === 0) return 'empty';
  
  const numericValues = values.filter(v => !isNaN(v) && v !== '');
  if (numericValues.length === values.length) return 'numeric';
  if (numericValues.length > values.length * 0.8) return 'mostly_numeric';
  
  const dateValues = values.filter(v => !isNaN(Date.parse(v)));
  if (dateValues.length > values.length * 0.5) return 'date';
  
  return 'text';
}

/**
 * Create statistical text in different languages
 */
function createStatsText(columnStats, totalRows, language) {
  const keys = Object.keys(columnStats);
  let text = '';
  
  const labels = {
    italian: {
      columnAnalysis: 'Analisi per colonna',
      values: 'valori',
      unique: 'unici',
      mostFrequent: 'più frequente',
      times: 'volte',
      dataType: 'tipo dati'
    },
    english: {
      columnAnalysis: 'Column analysis',
      values: 'values',
      unique: 'unique',
      mostFrequent: 'most frequent',
      times: 'times',
      dataType: 'data type'
    },
    french: {
      columnAnalysis: 'Analyse par colonne',
      values: 'valeurs',
      unique: 'uniques',
      mostFrequent: 'plus fréquent',
      times: 'fois',
      dataType: 'type de données'
    },
    spanish: {
      columnAnalysis: 'Análisis por columna',
      values: 'valores',
      unique: 'únicos',
      mostFrequent: 'más frecuente',
      times: 'veces',
      dataType: 'tipo de datos'
    },
    german: {
      columnAnalysis: 'Spaltenanalyse',
      values: 'Werte',
      unique: 'eindeutig',
      mostFrequent: 'häufigster',
      times: 'mal',
      dataType: 'Datentyp'
    }
  };
  
  const l = labels[language] || labels.english;
  
  text += `**${l.columnAnalysis}:**\n`;
  
  keys.slice(0, 5).forEach(key => { // Show stats for first 5 columns
    const stats = columnStats[key];
    const [mostCommonValue, frequency] = stats.mostCommon || ['N/A', 0];
    
    text += `• **${key}:** ${stats.totalValues} ${l.values}, ${stats.uniqueValues} ${l.unique}`;
    if (frequency > 1) {
      text += `, ${l.mostFrequent}: "${mostCommonValue}" (${frequency} ${l.times})`;
    }
    text += `\n`;
  });
  
  if (keys.length > 5) {
    text += `\n*${l.columnAnalysis} ${language === 'italian' ? 'limitata alle prime 5 colonne' : 'limited to first 5 columns'}*`;
  }
  
  return text;
}

/**
 * Checks if this is a column search query
 */
function isColumnSearchQuery(userQuery, schema) {
  const query = userQuery.toLowerCase();
  
  // Patterns for column search queries
  const columnSearchPatterns = [
    /\b(esiste|exists?|c['\']?è|is there).+(colonna|column).+(nome|name|simile|similar|like)/i,
    /\b(qual[ei]|which|what).+(colonne?|columns?).+(simile|similar|like|nome|name)/i,
    /\b(trova|find|cerca|search).+(colonne?|columns?).+(nome|name|simile|similar)/i,
    /\b(colonne?|columns?).+(disponibil[ei]|available).+(simile|similar|like)/i,
    /\b(mostra|show|elenca|list).+(colonne?|columns?).+(simile|similar|like)/i
  ];
  
  return columnSearchPatterns.some(pattern => pattern.test(query));
}

/**
 * Handle column search queries by analyzing the schema
 */
function handleColumnSearch(userQuery, schema) {
  const query = userQuery.toLowerCase();
  
  // Extract search term from the query
  let searchTerm = '';
  const searchTermPatterns = [
    /'([^']+)'/i,  // Single quotes
    /"([^"]+)"/i,  // Double quotes
    /simile a\s*['"]*([^'"?\s]+)['"]*\??/i, // Italian "simile a"
    /similar to\s*['"]*([^'"?\s]+)['"]*\??/i, // English "similar to"
    /like\s*['"]*([^'"?\s]+)['"]*\??/i,       // "like"
    /nome\s*['"]*([^'"?\s]+)['"]*\??/i        // "nome"
  ];
  
  for (const pattern of searchTermPatterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      searchTerm = match[1].trim();
      break;
    }
  }
  
  console.log(`🔍 Column search term extracted: "${searchTerm}"`);
  
  // Search for columns in the schema
  const columnsFound = [];
  if (schema.detailed) {
    for (const [tableName, tableInfo] of Object.entries(schema.detailed)) {
      if (tableInfo.columnNames && Array.isArray(tableInfo.columnNames)) {
        const matchingColumns = tableInfo.columnNames.filter(columnName => {
          if (!columnName) return false;
          const lowerColumnName = columnName.toLowerCase();
          const lowerSearchTerm = searchTerm.toLowerCase();
          
          // Various matching strategies
          return lowerColumnName.includes(lowerSearchTerm) ||
                 lowerSearchTerm.includes(lowerColumnName) ||
                 levenshteinDistance(lowerColumnName, lowerSearchTerm) <= 2; // Similar names
        });
        
        matchingColumns.forEach(columnName => {
          columnsFound.push({
            table: tableName,
            column: columnName,
            similarity: calculateSimilarity(columnName.toLowerCase(), searchTerm.toLowerCase())
          });
        });
      }
    }
  }
  
  // Sort by similarity
  columnsFound.sort((a, b) => b.similarity - a.similarity);
  
  // Format the response
  let formattedResponse = '';
  
  if (columnsFound.length === 0) {
    formattedResponse = `🔍 **Ricerca Colonne:**\n\n❌ **Nessuna colonna trovata simile a "${searchTerm}"**\n\n`;
    
    // Show available columns as suggestion
    if (schema.detailed) {
      formattedResponse += `📋 **Colonne disponibili:**\n\n`;
      for (const [tableName, tableInfo] of Object.entries(schema.detailed)) {
        if (tableInfo.columnNames && tableInfo.columnNames.length > 0) {
          formattedResponse += `**Tabella: ${tableName}**\n`;
          tableInfo.columnNames.forEach((col, idx) => {
            formattedResponse += `   ${idx + 1}. \`${col}\`\n`;
          });
          formattedResponse += '\n';
        }
      }
    }
  } else {
    formattedResponse = `🔍 **Ricerca Colonne:**\n\n✅ **Trovate ${columnsFound.length} colonne simili a "${searchTerm}"**\n\n`;
    
    columnsFound.forEach((item, idx) => {
      const similarityPercent = Math.round(item.similarity * 100);
      formattedResponse += `${idx + 1}. **\`${item.column}\`** (tabella: ${item.table}) - ${similarityPercent}% simile\n`;
    });
    
    formattedResponse += `\n💡 **Suggerimento:** Puoi usare queste colonne nelle tue query di ricerca dati.`;
  }
  
  return {
    columnsFound,
    searchTerm,
    formattedResponse
  };
}

/**
 * Calculate similarity between two strings (simple version)
 */
function calculateSimilarity(str1, str2) {
  if (str1 === str2) return 1.0;
  if (str1.includes(str2) || str2.includes(str1)) return 0.8;
  
  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  return Math.max(0, 1 - distance / maxLength);
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Analyze A2A context data instead of querying database
 * @param {string} userQuery - User's query
 * @param {Object} a2aContext - A2A context data from previous agents
 * @param {string} threadId - Thread identifier
 * @returns {Promise<Object>} - Analysis result
 */
async function analyzeA2AData(userQuery, a2aContext, threadId) {
  console.log(`🔍 Data Explorer: Analyzing A2A data for: \"${userQuery}\"`);
  
  try {
    const dataKeys = Object.keys(a2aContext);
    console.log(`📊 Available A2A data keys: ${dataKeys.join(', ')}`);

    // Dynamically discover and extract all datasets from the A2A context
    const discoveredData = [];

    for (const key of dataKeys) {
      const contextItem = a2aContext[key];
      if (!contextItem || typeof contextItem !== 'object') continue;

      console.log(`📊 Processing A2A context from key: ${key}`);

      const processMcpResult = (mcpResult, sourceHint) => {
        const toolName = mcpResult.toolName || sourceHint || 'unknown_tool';
        let data = mcpResult.data;

        if (!data) {
          console.log(`🤷 No data found for tool: ${toolName}`);
          return;
        }

        // Data can be a JSON string, parse it
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch (e) {
            console.warn(`⚠️ Could not parse JSON data for tool ${toolName}:`, data);
            return; // Skip if data is not valid JSON
          }
        }

        // The actual data is often nested inside the parsed object (e.g., { employees: [...] })
        // Let's find the actual array of records dynamically.
        let records = [];
        if (Array.isArray(data)) {
          records = data;
        } else if (typeof data === 'object' && data !== null) {
          // Find the first property that is an array, which is likely the data we want
          const arrayKey = Object.keys(data).find(k => Array.isArray(data[k]));
          if (arrayKey) {
            records = data[arrayKey];
            console.log(`📊 Extracted ${records.length} records from key '${arrayKey}' in tool ${toolName}`);
          } else {
             // If no array is found, maybe the object itself is the record
             records = [data];
             console.log(`📊 Treating the object from tool ${toolName} as a single record.`);
          }
        }

        if (records.length > 0) {
          discoveredData.push({
            source: toolName,
            count: records.length,
            records: records,
          });
        }
      };

      // Case 1: Multi-tool response with mcpData array
      if (contextItem.mcpData && Array.isArray(contextItem.mcpData)) {
        console.log(`📊 Found mcpData array with ${contextItem.mcpData.length} tool results`);
        for (const mcpResult of contextItem.mcpData) {
          processMcpResult(mcpResult, key);
        }
      }
      // Case 2: Single tool response with direct mcpData
      else if (contextItem.mcpData) {
        console.log(`📊 Found direct mcpData from single tool response`);
        processMcpResult({ 
            toolName: contextItem.toolUsed || key, 
            data: contextItem.mcpData 
        }, key);
      }
    }

    if (discoveredData.length === 0) {
      throw new Error('No processable datasets found in A2A context');
    }

    console.log(`📊 Discovered ${discoveredData.length} datasets to analyze.`);

    // Dynamically build the analysis prompt
    let dataForPrompt = '';
    let dataOverview = '';
    let totalRecords = 0;

    discoveredData.forEach(dataset => {
      const previewData = dataset.records.slice(0, 10);
      dataForPrompt += `\n\nDATASET SOURCE: \"${dataset.source}\" (${dataset.count} records):\n`;
      dataForPrompt += JSON.stringify(previewData, null, 2);
      if (dataset.count > 10) {
        dataForPrompt += `\n... and ${dataset.count - 10} more records.`;
      }
      
      dataOverview += `- ${dataset.source}: ${dataset.count} records\n`;
      totalRecords += dataset.count;
    });

    const fullAnalysisPrompt = `You are a data analyst. Analyze the following datasets to answer: \"${userQuery}\"

Here are the datasets retrieved from different tools:
${dataForPrompt}

Please provide a comprehensive analysis that:
1. Synthesizes information from all available datasets.
2. Identifies relationships, overlaps, or unique patterns across datasets.
3. Provides insights relevant to the user's question.
4. Answers the specific question: \"${userQuery}\"

Focus on creating a unified view from the provided data sources.`;

    const fullLlmResponse = await llm.invoke([new HumanMessage(fullAnalysisPrompt)]);

    // Create a concise summary for A2A context sharing
    const summaryPrompt = `Create a concise, structured summary of this data analysis that captures the key findings without exceeding 500 tokens.

ORIGINAL ANALYSIS:
${fullLlmResponse.content}

DATA OVERVIEW:
${dataOverview}
- Total Records Analyzed: ${totalRecords}

Create a summary with:
1. Key statistics and counts from the analysis.
2. Main findings relevant to: \"${userQuery}\"
3. Notable patterns or insights discovered across the datasets.
4. Clear, actionable information.

Keep it under 500 tokens and focus on the most important information for answering: \"${userQuery}\"`;

    const summaryResponse = await llm.invoke([new HumanMessage(summaryPrompt)]);

    const structuredSummary = {
      totalRecords: totalRecords,
      datasetCount: discoveredData.length,
      sources: discoveredData.map(d => ({ source: d.source, count: d.count })),
      keyFindings: summaryResponse.content,
      dataAnalyzed: true,
      queryAnswered: userQuery
    };

    logAgentActivity('data_explorer_agent', 'a2a_analysis_success', {
      userQuery,
      sources: discoveredData.map(d => d.source),
      totalRecords,
      fullResponseLength: fullLlmResponse.content.length,
      summaryLength: summaryResponse.content.length,
      threadId
    });

    return {
      success: true,
      agent: 'data_explorer',
      operation: { type: 'a2a_data_analysis' },
      dataSource: 'a2a_context',
      analysis: structuredSummary,
      formattedResponse: fullLlmResponse.content,
      a2aSummary: summaryResponse.content,
      userQuery,
      threadId,
      method: 'dynamic_a2a_context_analysis'
    };

  } catch (error) {
    console.error(`❌ Data Explorer A2A Analysis Error:`, error);
    
    return {
      success: false,
      agent: 'data_explorer',
      error: error.message,
      userQuery,
      threadId,
      fallback: 'Could not analyze A2A context data dynamically'
    };
  }
}

/**
 * Process execution results from the orchestrator
 */
async function processExecutionResults(executionResults, userQuery, threadId) {
  console.log(`🔄 Data Explorer: Processing ${executionResults.length} execution results...`);
  
  try {
    // Find the main data result (usually the first or most relevant)
    const dataResult = executionResults.find(result => 
      result.step === 'execute_data_query' || 
      result.tool === 'query_database' ||
      result.success === true
    ) || executionResults[0];
    
    if (!dataResult || !dataResult.tool_result) {
      throw new Error('No valid data result found in execution results');
    }
    
    console.log(`📊 Data Explorer: Found data result from tool: ${dataResult.tool}`);
    
    // Extract data from the MCP tool result
    const extractedData = extractDataFromMcpResult(dataResult.tool_result);
    
    if (!extractedData || (Array.isArray(extractedData) && extractedData.length === 0)) {
      return {
        success: false,
        agent: 'data_explorer',
        error: 'No data found in query results',
        userQuery,
        threadId,
        guidance: {
          message: 'La query è stata eseguita ma non ha restituito risultati.',
          suggestions: [
            'Prova a modificare i criteri di ricerca',
            'Verifica che i dati esistano nella tabella',
            'Controlla la sintassi della query'
          ]
        }
      };
    }
    
    // Determine operation type based on user query for formatting
    const dataOperation = await analyzeDataIntent(userQuery, []);
    
    // Format the response in a user-friendly way
    const formattedResponse = await formatDataResponse(
      extractedData, 
      userQuery, 
      dataOperation, 
      dataResult.input?.query || 'SQL Query executed', 
      null // schema not available here
    );
    
    // Log successful exploration
    logAgentActivity('data_explorer_agent', 'execution_results_processed', {
      operationType: dataOperation.type,
      dataReturned: Array.isArray(extractedData) ? extractedData.length : 1,
      userQuery,
      threadId
    });
    
    return {
      success: true,
      agent: 'data_explorer',
      operation: dataOperation,
      formattedResponse,
      rawData: extractedData,
      userQuery,
      threadId,
      executionMethod: 'orchestrator_plan',
      a2aSummary: `Processed ${Array.isArray(extractedData) ? extractedData.length : 1} data records for user query`
    };
    
  } catch (error) {
    console.error(`❌ Data Explorer error processing execution results:`, error);
    
    logAgentActivity('data_explorer_agent', 'execution_results_error', {
      error: error.message,
      userQuery,
      threadId
    });
    
    return {
      success: false,
      agent: 'data_explorer',
      error: error.message,
      userQuery,
      threadId,
      fallback: 'Could not process execution results from orchestrator'
    };
  }
}

module.exports = {
  runDataExplorerAgent
};
