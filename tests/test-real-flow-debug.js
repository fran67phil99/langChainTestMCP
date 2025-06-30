#!/usr/bin/env node

/**
 * Test Real Flow Debug - Test the actual DataExplorerAgent with debug logging
 * This simulates the exact scenario from the user's trace
 */

const { runDataExplorerAgent } = require('../src/agents/dataExplorerAgent');
const { HumanMessage } = require('@langchain/core/messages');

console.log('🔍 Testing DataExplorerAgent with Real Flow Debug...\n');

// Mock the exact schema from the user's trace
const realSchema = {
  tables: ['_import_history', 'sqlite_sequence', '_table_metadata', 'dataset'],
  detailed: {
    '_import_history': {
      columnNames: ['id', 'filename', 'table_name', 'rows_imported', 'import_date', 'file_size', 'checksum', 'status'],
      columnCount: 8,
      method: 'fallback_select',
      rowCount: 1
    },
    'sqlite_sequence': {
      columnNames: ['name', 'seq'],
      columnCount: 2,
      method: 'fallback_select',
      rowCount: 1
    },
    '_table_metadata': {
      columnNames: ['table_name', 'description', 'created_date', 'last_updated', 'source_file', 'row_count'],
      columnCount: 6,
      method: 'fallback_select',
      rowCount: 1
    },
    'dataset': {
      columnNames: ['id', 'Title', 'Market', 'Univ__title', 'Title_cod', 'Comp__PASA', 'Comp__Silce', 'Comp__Code', 'Comp__Desc_', 'Hierarchy', 'Component_type', 'Component_type_Pasa', 'Issue', 'Channel', 'Channel_PASA', 'Commercial_offer', 'Sale_Date', 'Source', 'Issue_1', 'Sale_Data', 'Data_Recovery'],
      columnCount: 77,
      method: 'fallback_select',
      rowCount: 19907
    }
  },
  discoveryMethod: 'dynamic'
};

// Mock MCP tools with detailed logging
const mockTools = [
  {
    name: 'query_database',
    description: 'Execute SQL queries against the database and return structured data',
    call: async (params) => {
      console.log(`🔧 MOCK TOOL EXECUTION: query_database`);
      console.log(`   SQL Query: "${params.query}"`);
      
      // Simulate database response
      const mockResult = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            data: {
              query: params.query,
              rowCount: 5,
              columns: ['id', 'Title', 'Univ__title', 'Issue'],
              rows: [
                { id: 1, Title: 'Knight Rider #1', Univ__title: 'Knight Rider Car Build Up', Issue: '701' },
                { id: 2, Title: 'Marvel Heroes #5', Univ__title: 'Marvel Universe Collection', Issue: '105' },
                { id: 3, Title: 'Star Wars #12', Univ__title: 'Star Wars Saga', Issue: '212' },
                { id: 4, Title: 'DC Heroes #8', Univ__title: 'DC Universe', Issue: '308' },
                { id: 5, Title: 'Fantasy #3', Univ__title: 'Fantasy World', Issue: '103' }
              ]
            }
          })
        }]
      };
      
      console.log(`✅ MOCK TOOL RESULT: ${mockResult.content[0].text.length} chars`);
      return mockResult;
    }
  }
];

async function testRealFlowScenario() {
  console.log('🧪 Test: Exact scenario from user trace\n');
  
  // This is the exact query from the user's trace
  const problemQuery = "using schema_context, identify all Universal titles and collections, retrieve their full list of titles, determine which titles are currently running based on publication date range, and find the latest issue of each collection";
  
  // Simulate A2A context with schema (like in the real flow)
  const a2aContext = {
    schema_context: {
      agent: 'sql_schema',
      schema: realSchema,
      success: true
    }
  };
  
  const messages = [new HumanMessage(problemQuery)];
  
  console.log(`📝 Query: "${problemQuery}"`);
  console.log(`📊 Schema Available: ${realSchema.tables.join(', ')}`);
  console.log(`🔧 Tools Available: ${mockTools.map(t => t.name).join(', ')}`);
  console.log(`📋 A2A Context: ${Object.keys(a2aContext).join(', ')}`);
  
  console.log('\n🚀 Starting DataExplorerAgent execution...\n');
  
  try {
    const result = await runDataExplorerAgent(
      messages,
      mockTools,
      problemQuery,
      'flow-debug-001',
      a2aContext
    );
    
    console.log('\n📋 EXECUTION RESULT:');
    console.log('==========================================');
    console.log(`✅ Success: ${result.success}`);
    console.log(`🤖 Agent: ${result.agent}`);
    
    if (result.success) {
      console.log(`📝 SQL Query Generated: ${result.sqlQuery ? `"${result.sqlQuery}"` : 'NONE ❌'}`);
      console.log(`🔧 MCP Agent Used: ${result.collaboratedWith?.mcpAgent ? 'YES ✅' : 'NO ❌'}`);
      console.log(`📊 Real Data Retrieved: ${result.data ? 'YES ✅' : 'NO ❌'}`);
      
      if (result.data) {
        console.log(`   Data Type: ${Array.isArray(result.data) ? `Array[${result.data.length}]` : typeof result.data}`);
        if (Array.isArray(result.data) && result.data.length > 0) {
          console.log(`   Sample Data: ${JSON.stringify(result.data[0], null, 2)}`);
        }
      }
      
      if (result.formattedResponse) {
        console.log(`📄 Response Length: ${result.formattedResponse.length} chars`);
        console.log(`📄 Response Preview: "${result.formattedResponse.substring(0, 200)}..."`);
      }
      
      console.log(`🔗 Collaborations: ${JSON.stringify(result.collaboratedWith, null, 2)}`);
    } else {
      console.log(`❌ Error: ${result.error}`);
    }
    
  } catch (error) {
    console.error('\n❌ EXECUTION FAILED:');
    console.error(`   Error: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
  }
}

async function testSimpleScenario() {
  console.log('\n\n🧪 Test: Simple Universal titles query\n');
  
  const simpleQuery = "Show me all Universal titles from the dataset";
  const messages = [new HumanMessage(simpleQuery)];
  
  console.log(`📝 Query: "${simpleQuery}"`);
  console.log('\n🚀 Starting simple query execution...\n');
  
  try {
    const result = await runDataExplorerAgent(
      messages,
      mockTools,
      simpleQuery,
      'flow-debug-002'
    );
    
    console.log('\n📋 SIMPLE QUERY RESULT:');
    console.log('========================================');
    console.log(`✅ Success: ${result.success}`);
    console.log(`📝 SQL Generated: ${result.sqlQuery ? 'YES ✅' : 'NO ❌'}`);
    console.log(`🔧 Query Executed: ${result.data ? 'YES ✅' : 'NO ❌'}`);
    
    if (result.success && result.sqlQuery) {
      console.log(`   Generated SQL: "${result.sqlQuery}"`);
    }
    
  } catch (error) {
    console.error('\n❌ SIMPLE QUERY FAILED:');
    console.error(`   Error: ${error.message}`);
  }
}

async function runFlowDebugTests() {
  console.log('🔍 Real Flow Debug Test Suite');
  console.log('==============================');
  console.log('Testing the exact scenario that causes problems in production\n');
  
  await testRealFlowScenario();
  await testSimpleScenario();
  
  console.log('\n🎯 Debug Analysis:');
  console.log('===================');
  console.log('Based on the debug logs above, we can identify:');
  console.log('1. Where exactly the DataExplorerAgent flow stops');
  console.log('2. Whether schema detection works correctly');
  console.log('3. Whether query generation is triggered');
  console.log('4. Whether MCP Agent tool selection works');
  console.log('5. Whether SQL execution happens');
  
  console.log('\n📋 Expected Debug Log Sequence:');
  console.log('1. 🔍 Data Explorer: DEBUG - About to check conditions...');
  console.log('2. 🔍 Data Explorer: DEBUG - Checking column search query...');
  console.log('3. 🔍 Data Explorer: DEBUG - Checking generic request...');
  console.log('4. 🔍 Data Explorer: DEBUG - Proceeding to query generation...');
  console.log('5. 🤝 Data Explorer: Requesting optimized query from SQL Schema Agent...');
  console.log('6. 🤖 Data Explorer: Using MCP Agent for dynamic tool selection...');
  console.log('7. ✅ Data Explorer: Query executed successfully via MCP Agent');
}

// Use real environment configuration - load from .env
require('dotenv').config();

// Execute debug tests
runFlowDebugTests().catch(console.error);
