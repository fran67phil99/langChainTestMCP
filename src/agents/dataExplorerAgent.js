// Data Explorer Agent - Specialized agent for intelligent data exploration with A2A communication
const { HumanMessage } = require('@langchain/core/messages');
const { createTrackedLLM, logAgentActivity } = require('../utils/langsmithConfig');
const { runSqlSchemaAgent } = require('./sqlSchemaAgent');

// Initialize LLM for data exploration with LangSmith tracing
const llm = createTrackedLLM({
  modelName: "gpt-3.5-turbo",
  temperature: 0.3, // Lower temperature for more consistent data queries
});

/**
 * Data Explorer Agent - Converts natural language requests into appropriate data operations
 * Uses Agent-to-Agent (A2A) communication with SQL Schema Agent for optimal results
 * @param {Array} messages - Message history
 * @param {Array} availableTools - Available MCP tools
 * @param {string} userQuery - User's query in English
 * @param {string} threadId - Thread identifier
 * @returns {Promise<Object>} - Data exploration result
 */
async function runDataExplorerAgent(messages, availableTools, userQuery, threadId) {
  console.log(`🔍 Data Explorer Agent: Analyzing request: "${userQuery}"`);
  
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
    
    // 2. A2A Communication: Request schema from SQL Schema Agent
    console.log(`🤝 Data Explorer: Requesting schema from SQL Schema Agent...`);
    const schemaRequest = {
      action: 'discover_schema',
      from: 'data_explorer',
      threadId: threadId
    };
    
    const schemaResult = await runSqlSchemaAgent(schemaRequest, availableTools, threadId);
    
    if (!schemaResult.success) {
      throw new Error(`Schema discovery failed: ${schemaResult.error}`);
    }
      // 3. Check if we have valid schema data
    if (!schemaResult.schema.tables || schemaResult.schema.tables.length === 0) {
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
      // 5. A2A Communication: Request optimized query generation
    console.log(`🤝 Data Explorer: Requesting optimized query from SQL Schema Agent...`);
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
    
    if (!queryResult.success) {
      throw new Error(`Query generation failed: ${queryResult.error}`);
    }
    
    const optimizedQuery = queryResult.query;
    console.log(`📝 Data Explorer: Generated optimized query: ${optimizedQuery}`);
    
    // 6. Find the best MCP tool for database operations
    const mcpTool = findBestMcpTool(availableTools);
    if (!mcpTool) {
      throw new Error('No suitable MCP database tool found');
    }
      // 7. Execute the optimized query using the MCP tool
    console.log(`🤝 Data Explorer: Executing query with MCP tool: ${mcpTool.name}`);
    const mcpResult = await mcpTool.call({ query: optimizedQuery });    // 8. Extract actual data from MCP response structure
    const extractedData = extractDataFromMcpResult(mcpResult);
    
    // 9. Format the response in a user-friendly way
    const formattedResponse = await formatDataResponse(extractedData, userQuery, dataOperation, optimizedQuery, schemaResult.schema);
      // Log successful exploration
    logAgentActivity('data_explorer_agent', 'exploration_success', {
      operationType: dataOperation.type,
      sqlQuery: optimizedQuery,
      tablesUsed: schemaResult.schema.tables,
      dataReturned: Array.isArray(extractedData) ? extractedData.length : 1,
      threadId
    });
    
    return {
      success: true,
      agent: 'data_explorer',
      operation: dataOperation,
      schema: schemaResult.schema,
      sqlQuery: optimizedQuery,
      rawData: mcpResult,
      formattedResponse,
      userQuery,
      threadId,
      collaboratedWith: {
        sqlSchemaAgent: true,
        mcpTool: mcpTool.name
      }
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
    // If the query mentions specific table names, it's not generic
  const mentionsSpecificTable = /\b(table|tabella|data|dati|database|db|collection|schema)\b/i.test(query);
  if (mentionsSpecificTable) {
    console.log(`🎯 Data Explorer: Query mentions specific table/data source - NOT generic`);
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
  const analysisPrompt = `You are a multilingual data exploration assistant. Analyze this user request and determine the best data operation.

User Request: "${userQuery}"

Detect the language and intent, then respond with the appropriate operation type:

Available operations:
- preview: Show first N rows of data 
  Keywords: "prime/primi/first/top/initial" + "righe/rows/lines/records", "mostra/show/display", "anteprima/preview"
- search: Search for specific data with criteria
  Keywords: "cerca/search/find/filter/where" + specific criteria, "contiene/contains/like"
- summary: Get data statistics/aggregations
  Keywords: "riassunto/summary/stats/count/total/average/sum", "statistiche/analytics"
- count: Count total records
  Keywords: "conta/count/quanti/how many/combien", "numero/number"
- schema: Describe data structure
  Keywords: "struttura/structure/schema/describe/columns/fields", "cos'è/what is"
- custom_query: Complex custom operations
  Keywords: specific SQL terms, complex filtering, joins, etc.

Respond with JSON only:
{
  "type": "operation_type",
  "parameters": {
    "limit": number_for_preview,
    "search_criteria": "criteria_if_search",
    "table_hint": "table_name_if_mentioned"
  },
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "detected_language": "language_code"
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
    let operationType = 'preview';
    let limit = 10;
    
    // Basic pattern matching for fallback
    if (/\b(cerca|search|find|filter|where)\b/i.test(query)) {
      operationType = 'search';
    } else if (/\b(conta|count|quanti|how\s+many|total)\b/i.test(query)) {
      operationType = 'count';
    } else if (/\b(struttura|structure|schema|describe|columns)\b/i.test(query)) {
      operationType = 'schema';
    } else if (/\b(riassunto|summary|stats|statistics|analytics)\b/i.test(query)) {
      operationType = 'summary';
    }
    
    // Extract number if mentioned
    const numberMatch = query.match(/\b(\d+)\b/);
    if (numberMatch && operationType === 'preview') {
      limit = parseInt(numberMatch[1]);
    }
    
    return {
      type: operationType,
      parameters: { limit },
      confidence: 0.6,
      reasoning: 'Fallback analysis based on keyword detection',
      detected_language: 'auto-detected'
    };
  }
}

/**
 * Finds the best MCP tool for database operations - completely dynamic
 */
function findBestMcpTool(availableTools) {
  // Dynamic priority-based search - no hardcoded tool names
  const dbOperationPatterns = [
    // Direct database operations
    { patterns: ['query', 'sql', 'execute', 'run'], priority: 10 },
    { patterns: ['database', 'db'], priority: 9 },
    { patterns: ['select', 'insert', 'update', 'delete'], priority: 8 },
    { patterns: ['call', 'invoke', 'exec'], priority: 7 },
    
    // Data operations
    { patterns: ['data', 'fetch', 'get', 'retrieve'], priority: 6 },
    { patterns: ['table', 'record', 'row'], priority: 5 },
    { patterns: ['search', 'find', 'lookup'], priority: 4 },
    
    // Generic operations
    { patterns: ['read', 'load', 'access'], priority: 3 },
    { patterns: ['process', 'handle', 'manage'], priority: 2 },
    { patterns: ['tool', 'function', 'method'], priority: 1 }
  ];
  
  let bestTool = null;
  let bestScore = 0;
  
  for (const tool of availableTools) {
    const toolName = tool.name.toLowerCase();
    const toolDesc = (tool.description || '').toLowerCase();
    let score = 0;
    
    // Calculate score based on pattern matching
    for (const { patterns, priority } of dbOperationPatterns) {
      for (const pattern of patterns) {
        if (toolName.includes(pattern)) {
          score += priority * 2; // Name matches get double weight
        }
        if (toolDesc.includes(pattern)) {
          score += priority;
        }
      }
    }
    
    // Bonus for tools that seem to be primary database interfaces
    if (toolName.length < 20 && toolName.includes('query')) {
      score += 15;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestTool = tool;
    }
  }
  
  if (bestTool) {
    console.log(`🎯 Data Explorer: Selected MCP tool: ${bestTool.name} (score: ${bestScore})`);
    return bestTool;
  }
  
  // Fallback: any tool that might work
  const fallbackTool = availableTools.find(tool => {
    const toolName = tool.name.toLowerCase();
    const toolDesc = (tool.description || '').toLowerCase();
    
    return toolName.length > 3 && (
      toolName.includes('data') || 
      toolName.includes('query') ||
      toolDesc.includes('data') ||
      toolDesc.includes('query') ||
      toolDesc.includes('database')
    );
  });
  
  if (fallbackTool) {
    console.log(`🎯 Data Explorer: Using fallback tool: ${fallbackTool.name}`);
  }
    return fallbackTool;
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
  if (!mcpResult) return null;
  
  // If it's already the correct format (array or plain object without content), return as is
  if (Array.isArray(mcpResult)) {
    return mcpResult;
  }
  
  if (typeof mcpResult === 'object' && !mcpResult.content) {
    return mcpResult;
  }
  
  // Handle MCP response format with content field
  if (mcpResult.content && Array.isArray(mcpResult.content)) {
    const textContent = mcpResult.content.find(item => item.type === 'text');
    if (textContent && textContent.text) {
      try {
        const parsed = JSON.parse(textContent.text);
        
        // If it's a successful response with data
        if (parsed.success && parsed.data) {
          // If data has rows, return the rows (this is the most common case for SQL queries)
          if (parsed.data.rows && Array.isArray(parsed.data.rows)) {
            return parsed.data.rows;
          }
          // If data has tables, return the tables  
          if (parsed.data.tables && Array.isArray(parsed.data.tables)) {
            return parsed.data.tables;
          }
          // If data is an array itself, return it
          if (Array.isArray(parsed.data)) {
            return parsed.data;
          }
          // Otherwise return the data object (might be a single record or metadata)
          return parsed.data;
        }
        
        // If it's just data without success wrapper
        if (parsed.data) {
          if (Array.isArray(parsed.data)) {
            return parsed.data;
          }
          if (parsed.data.rows && Array.isArray(parsed.data.rows)) {
            return parsed.data.rows;
          }
          return parsed.data;
        }
        
        // If the parsed JSON is an array, return it
        if (Array.isArray(parsed)) {
          return parsed;
        }
        
        // Return the parsed JSON as is
        return parsed;
      } catch (error) {
        console.warn('⚠️ Failed to parse MCP text content as JSON:', error.message);
        // Return the raw text if JSON parsing fails
        return textContent.text;
      }
    }
  }
  
  // If nothing matches, return original
  return mcpResult;
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

CRITICAL FORMATTING INSTRUCTIONS:
1. Detect the language of the user's query
2. Respond in the same language as the user's query
3. NEVER show raw JSON data to the user
4. ALWAYS format tabular data as clean Markdown tables with proper headers
5. For lists, use bullet points or numbered lists
6. For single records, use key-value pairs in readable format
7. Limit tables to 20 rows and 10 columns for readability
8. If data exceeds limits, mention how many total records/columns exist

ADVANCED DATA ANALYSIS REQUIREMENTS:
- For single records: Show all field values clearly, don't just count fields
- For multiple records: Provide statistical insights (counts, frequencies, percentages)
- For repeated values: Show how many times each value appears
- Calculate and show totals, averages, min/max where applicable
- Identify patterns, trends, or notable observations in the data
- Group similar data and show distribution
- For text data: Show unique values and their frequencies (only if multiple records)
- For numerical data: Provide basic statistics (sum, average, range)
- AVOID statistical analysis for single records - just present the data clearly

Format the response as:
- A brief summary of what was found (with appropriate emoji)
- Key statistics and insights section
- The data presented as Markdown table, list, or structured text
- Data analysis section with patterns and observations
- Technical details (SQL query) in a collapsible section at the end
- Suggestions for next steps based on the data patterns found

Use professional business tone and appropriate emojis for visual appeal.

EXAMPLE FORMATS:
For tabular data: Use proper Markdown table syntax with | separators
For lists: Use • bullet points or numbered lists
For single values: Use **Label:** Value format
For empty results: Explain what was searched and suggest alternatives

If the data is empty, null, or shows an error, explain that no results were found and suggest:
- Checking available tables: ${schema.tables.join(', ')}
- Verifying the query syntax
- Trying a different approach

Remember: NO RAW JSON should ever be visible to the user. Always convert data to human-readable format.`;

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
  'Puoi fare altre domande sui dati o richiedere analisi diverse come conteggi, medie, o raggruppamenti.'}`;
  
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
  'Vous pouvez poser d\'autres questions sur les données ou demander des analyses différentes comme des comptes, moyennes, ou regroupements.'}`;
  
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
  'Puedes hacer más preguntas sobre los datos o solicitar análisis diferentes como conteos, promedios, o agrupaciones.'}`;
  
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
  'Sie können weitere Fragen zu den Daten stellen oder verschiedene Analysen wie Zählungen, Durchschnitte oder Gruppierungen anfordern.'}`;
  
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
  'You can ask more questions about the data or request different analyses like counts, averages, or groupings.'}`;
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
    /simile a\s*['"]*([^'"?\s]+)['"]*\??/i,  // Italian "simile a"
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

module.exports = {
  runDataExplorerAgent
};
