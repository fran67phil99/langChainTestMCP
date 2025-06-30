/**
 * Semantic Analyzer - Dynamic schema and query analysis utility
 * Provides intelligent mapping between user intent and database schema
 */

const { HumanMessage } = require('@langchain/core/messages');
const { createTrackedLLM } = require('./langsmithConfig');

const llm = createTrackedLLM({
  modelName: "gpt-4o-mini",
  temperature: 0.2,
});

/**
 * Analyzes schema columns and maps them to semantic concepts
 */
async function analyzeSchemaSemantics(schema) {
  if (!schema.detailed || Object.keys(schema.detailed).length === 0) {
    return {
      titleColumns: [],
      dateColumns: [],
      collectionColumns: [],
      issueColumns: [],
      salesColumns: [],
      idColumns: []
    };
  }

  const analysisPrompt = `CRITICAL: You MUST respond with ONLY valid JSON. No explanations, no markdown, no extra text.

DATABASE SCHEMA:
${JSON.stringify(schema.detailed, null, 2)}

Analyze the schema columns and categorize them semantically. Look at these patterns:

TITLE/NAME: "title", "name", "desc", ending with "_title"/"_name"
DATE: "date", "time", "created", "updated", "sale_date", etc.
COLLECTION: "collection", "category", "univ_", "universal", "market", "channel"
ISSUE/SEQUENCE: "issue", "number", "seq", "episode", "volume"
SALES/BUSINESS: "sale", "price", "cost", "stock", "qty", business metrics
ID/REFERENCE: "id", "code", "ref", "key", identifiers

Return ONLY this JSON structure:
{
  "titleColumns": [{"table": "table_name", "column": "column_name", "confidence": 0.9}],
  "dateColumns": [{"table": "table_name", "column": "column_name", "confidence": 0.9}],
  "collectionColumns": [{"table": "table_name", "column": "column_name", "confidence": 0.9}],
  "issueColumns": [{"table": "table_name", "column": "column_name", "confidence": 0.9}],
  "salesColumns": [{"table": "table_name", "column": "column_name", "confidence": 0.9}],
  "idColumns": [{"table": "table_name", "column": "column_name", "confidence": 0.9}]
}`;

  try {
    const response = await llm.invoke([new HumanMessage(analysisPrompt)]);
    let content = response.content.trim();
    
    // Clean up response - remove any markdown or extra text
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    // If response starts with non-JSON text, try to extract JSON
    if (!content.startsWith('{')) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        content = jsonMatch[0];
      }
    }
    
    const analysis = JSON.parse(content);
    console.log(`🧠 Semantic Analysis: Identified column categories`);
    return analysis;
  } catch (error) {
    console.warn(`⚠️ Semantic analysis failed: ${error.message}`);
    return {
      titleColumns: [],
      dateColumns: [],
      collectionColumns: [],
      issueColumns: [],
      salesColumns: [],
      idColumns: []
    };
  }
}

/**
 * Generates intelligent SQL based on user intent and semantic schema mapping
 */
async function generateSemanticQuery(userIntent, schema, semanticMapping) {
  const queryPrompt = `You are an expert SQL query generator. Create precise, executable SQL queries based on user intent and semantic column analysis.

USER INTENT: "${userIntent}"

AVAILABLE TABLES: ${schema.tables.join(', ')}

SEMANTIC COLUMN MAPPING:
- Title/Name columns: ${semanticMapping.titleColumns.map(c => `${c.table}.${c.column} (confidence: ${c.confidence})`).join(', ') || 'None identified'}
- Date columns: ${semanticMapping.dateColumns.map(c => `${c.table}.${c.column} (confidence: ${c.confidence})`).join(', ') || 'None identified'}
- Collection/Category columns: ${semanticMapping.collectionColumns.map(c => `${c.table}.${c.column} (confidence: ${c.confidence})`).join(', ') || 'None identified'}
- Issue/Sequence columns: ${semanticMapping.issueColumns.map(c => `${c.table}.${c.column} (confidence: ${c.confidence})`).join(', ') || 'None identified'}
- Sales/Business columns: ${semanticMapping.salesColumns.map(c => `${c.table}.${c.column} (confidence: ${c.confidence})`).join(', ') || 'None identified'}
- ID/Reference columns: ${semanticMapping.idColumns.map(c => `${c.table}.${c.column} (confidence: ${c.confidence})`).join(', ') || 'None identified'}

INTELLIGENT QUERY PATTERNS:

1. **"Full list" requests → DISTINCT SELECT with meaningful columns**
   - Select title/name columns for identification
   - Include collection/category for grouping context
   - Order by logical sequence (names, dates)
   - Example: SELECT DISTINCT title_col, collection_col FROM main_table ORDER BY title_col

2. **"Latest/last [something] for each [grouping]" → MAX() with GROUP BY**
   - Use MAX() on date or sequence columns
   - GROUP BY the collection/category column
   - Include descriptive columns for context
   - Example: SELECT collection_col, MAX(date_col) as latest_date, MAX(issue_col) as latest_issue FROM main_table GROUP BY collection_col

3. **"Running by date range" → Date range analysis**
   - Use MIN() and MAX() dates grouped by collections
   - Filter out null dates
   - Include date ranges for active periods
   - Example: SELECT collection_col, MIN(date_col) as start_date, MAX(date_col) as end_date FROM main_table WHERE date_col IS NOT NULL GROUP BY collection_col

4. **"Latest sales date for each title" → Sales-focused aggregation**
   - Use MAX() on sales date columns
   - GROUP BY title/name columns
   - Include relevant business metrics
   - Example: SELECT title_col, MAX(sales_date_col) as latest_sale FROM main_table GROUP BY title_col

QUERY CONSTRUCTION RULES:

- **Main Table**: Use the primary data table (usually the largest or most comprehensive)
- **Column Selection**: Choose high-confidence semantic matches first
- **NULL Handling**: Always filter out or handle NULL values in date/numeric operations
- **Meaningful Aliases**: Use descriptive aliases for calculated columns
- **Performance**: Use LIMIT when appropriate to avoid overwhelming results
- **Ordering**: Order results logically (dates DESC for latest, names ASC for lists)

CRITICAL REQUIREMENTS:
- Generate complete, executable SQL
- Use only columns that exist in the semantic mapping
- Handle NULL values appropriately with IS NOT NULL or COALESCE
- Use meaningful column aliases
- Include appropriate GROUP BY for aggregations
- Order results logically

EXAMPLE TRANSFORMATIONS:
- "Universal titles" → Look for title columns with "universal" or collection-type columns
- "Latest issue" → MAX(issue_column) with appropriate grouping
- "Publication date range" → MIN/MAX of date columns grouped by collections
- "Sales dates" → Focus on sales-related date columns

Generate the SQL query that best answers the user's request using the available semantic mappings.

Return only the SQL query, no explanations.`;

  try {
    const response = await llm.invoke([new HumanMessage(queryPrompt)]);
    let sqlQuery = response.content.trim();
    
    // Clean up response
    sqlQuery = sqlQuery.replace(/```sql\n?/g, '').replace(/```\n?/g, '').trim();
    
    console.log(`🧠 Generated semantic query: ${sqlQuery}`);
    return sqlQuery;
  } catch (error) {
    console.error(`❌ Semantic query generation failed: ${error.message}`);
    throw error;
  }
}

/**
 * Analyzes user intent and suggests optimal data operations
 */
async function analyzeUserIntentSemantics(userQuery) {
  const intentPrompt = `CRITICAL: Return ONLY valid JSON. No explanations or extra text.

USER QUERY: "${userQuery}"

Analyze the query and return ONLY this JSON:
{
  "mainEntity": "titles|collections|sales|issues|data",
  "operationType": "list|latest|count|summary|search|analysis|complex",
  "requiresGrouping": true,
  "groupingCriteria": "collection|title|category|null",
  "temporalAspects": ["latest", "range", "period"],
  "aggregationNeeds": ["max", "min", "count"],
  "keyTerms": ["universal", "title", "issue", "sale"],
  "complexity": "simple|moderate|complex"
}`;

  try {
    const response = await llm.invoke([new HumanMessage(intentPrompt)]);
    let content = response.content.trim();
    
    // Clean up response - remove any markdown or extra text
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    // If response starts with non-JSON text, try to extract JSON
    if (!content.startsWith('{')) {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        content = jsonMatch[0];
      }
    }
    
    const intent = JSON.parse(content);
    console.log(`🧠 Intent Analysis: ${intent.operationType} operation on ${intent.mainEntity}`);
    return intent;
  } catch (error) {
    console.warn(`⚠️ Intent analysis failed: ${error.message}`);
    return {
      mainEntity: "unknown",
      operationType: "complex",
      requiresGrouping: false,
      groupingCriteria: null,
      temporalAspects: [],
      aggregationNeeds: [],
      keyTerms: [],
      complexity: "complex"
    };
  }
}

module.exports = {
  analyzeSchemaSemantics,
  generateSemanticQuery,
  analyzeUserIntentSemantics
};
