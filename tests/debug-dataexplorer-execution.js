#!/usr/bin/env node

/**
 * Debug DataExplorerAgent Query Execution
 * Investigate why real SQL queries are not being executed
 */

const { runDataExplorerAgent } = require('../src/agents/dataExplorerAgent');
const { HumanMessage } = require('@langchain/core/messages');

console.log('🔍 Debugging DataExplorerAgent Query Execution...\n');

// Mock schema with real structure
const mockSchema = {
  tables: ['dataset'],
  detailed: {
    dataset: {
      columnNames: ['id', 'Title', 'Market', 'Univ__title', 'Title_cod', 'Sale_Date', 'Issue'],
      columnCount: 7,
      method: 'fallback_select',
      rowCount: 19907
    }
  },
  discoveryMethod: 'dynamic'
};

// Mock tools that simulate the real MCP database tool
const mockAvailableTools = [
  {
    name: 'query_database',
    description: 'Execute SQL queries against the database and return structured data',
    call: async (params) => {
      console.log(`🔧 Mock Database Tool Called with SQL: "${params.query}"`);
      
      // Simulate real database response based on query
      if (params.query?.includes('Universal') || params.query?.includes('Univ__title')) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              data: {
                query: params.query,
                rowCount: 3,
                columns: ['id', 'Title', 'Univ__title', 'Issue'],
                rows: [
                  { id: 1, Title: 'Knight Rider #1', Univ__title: 'Knight Rider Car Build Up', Issue: '701' },
                  { id: 2, Title: 'Marvel Heroes #5', Univ__title: 'Marvel Universe Collection', Issue: '105' },
                  { id: 3, Title: 'Star Wars #12', Univ__title: 'Star Wars Saga', Issue: '212' }
                ]
              }
            })
          }]
        };
      }
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            data: { query: params.query, rowCount: 0, columns: [], rows: [] }
          })
        }]
      };
    }
  }
];

async function debugDataExplorerFlow() {
  console.log('🧪 Test 1: Simulate the problematic query from your trace\n');
  
  const testQuery = "identify all Universal titles and collections, retrieve their full list of titles";
  const messages = [new HumanMessage(testQuery)];
  
  // Create A2A context with schema (simulating what happens in real flow)
  const a2aContext = {
    schema_context: {
      agent: 'sql_schema',
      schema: mockSchema,
      success: true
    }
  };
  
  console.log(`📝 Input Query: "${testQuery}"`);
  console.log(`📊 Mock Schema Available: ${mockSchema.tables.join(', ')}`);
  console.log(`🔧 Mock Tools Available: ${mockAvailableTools.map(t => t.name).join(', ')}`);
  
  try {
    const result = await runDataExplorerAgent(
      messages,
      mockAvailableTools,
      testQuery,
      'debug-test-001',
      a2aContext
    );
    
    console.log('\n✅ DataExplorerAgent Result:');
    console.log(`   Success: ${result.success}`);
    console.log(`   Agent: ${result.agent}`);
    
    if (result.success) {
      console.log(`   SQL Query Generated: ${result.sqlQuery || 'NONE'}`);
      console.log(`   Data Retrieved: ${result.data ? 'YES' : 'NO'}`);
      console.log(`   MCP Agent Used: ${result.collaboratedWith?.mcpAgent ? 'YES' : 'NO'}`);
      
      if (result.data) {
        console.log(`   Data Type: ${Array.isArray(result.data) ? 'Array' : typeof result.data}`);
        console.log(`   Data Length: ${Array.isArray(result.data) ? result.data.length : 'N/A'}`);
      }
      
      if (result.formattedResponse) {
        console.log(`   Formatted Response Length: ${result.formattedResponse.length} chars`);
      }
    } else {
      console.log(`   Error: ${result.error}`);
    }
    
  } catch (error) {
    console.error('❌ Test Failed:', error.message);
    console.error('Full Error:', error);
  }
}

async function debugSimpleQuery() {
  console.log('\n🧪 Test 2: Simple query that should definitely execute\n');
  
  const testQuery = "Show me all Universal titles from the dataset table";
  const messages = [new HumanMessage(testQuery)];
  
  console.log(`📝 Input Query: "${testQuery}"`);
  
  try {
    const result = await runDataExplorerAgent(
      messages,
      mockAvailableTools,
      testQuery,
      'debug-test-002'
    );
    
    console.log('\n✅ Simple Query Result:');
    console.log(`   Success: ${result.success}`);
    console.log(`   SQL Generated: ${result.sqlQuery || 'NONE'}`);
    console.log(`   Real Query Executed: ${result.data ? 'YES' : 'NO'}`);
    
  } catch (error) {
    console.error('❌ Simple Test Failed:', error.message);
  }
}

async function runDebugTests() {
  console.log('🔍 DataExplorerAgent Query Execution Debug');
  console.log('==========================================');
  console.log('Investigating why SQL queries are not being executed\n');
  
  await debugDataExplorerFlow();
  await debugSimpleQuery();
  
  console.log('\n🎯 Debug Summary:');
  console.log('- Check if SQL queries are actually generated');
  console.log('- Verify if MCP Agent tool selection works');
  console.log('- Confirm if tool execution happens');
  console.log('- Identify where the flow breaks down');
  
  console.log('\n📋 Expected Flow:');
  console.log('1. Schema Discovery ✅');
  console.log('2. Intent Analysis ❓');
  console.log('3. Query Generation ❓'); 
  console.log('4. Tool Selection via MCP Agent ❓');
  console.log('5. Query Execution ❓');
  console.log('6. Result Formatting ❓');
}

// Set minimal environment for testing
process.env.OPENAI_API_KEY = 'test-key-for-debug';

// Execute debug tests
runDebugTests().catch(console.error);
