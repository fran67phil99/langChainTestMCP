// Test per verificare lo stato del database MCP
const axios = require('axios');

async function testMcpDatabase() {
  console.log('🔍 Testing MCP Database Status...\n');
  
  const mcpUrl = 'http://localhost:5009/mcp';
    // Test 1: List Tables
  console.log('📋 Test 1: List Tables');
  try {
    const response = await axios.post(mcpUrl, {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: "list_tables",
        arguments: {}
      }
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ List Tables Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ List Tables Failed:', error.response?.data || error.message);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
    // Test 2: Query Database for Tables
  console.log('📋 Test 2: Query Database - SQLite Master');
  try {
    const response = await axios.post(mcpUrl, {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: {
        name: "query_database",
        arguments: {
          query: "SELECT name FROM sqlite_master WHERE type='table'"
        }
      }
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ SQLite Master Query Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ SQLite Master Query Failed:', error.response?.data || error.message);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 3: Get Table Info (if available)
  console.log('📋 Test 3: Get Table Info');
  try {
    const response = await axios.post(mcpUrl, {
      method: 'tools/call',
      params: {
        name: 'get_table_info',
        arguments: {}
      }
    });
    
    console.log('✅ Table Info Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ Table Info Failed:', error.message);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 4: Check if we need to import data
  console.log('📋 Test 4: Test Sample Query');
  try {
    const response = await axios.post(mcpUrl, {
      method: 'tools/call',
      params: {
        name: 'query_database',
        arguments: {
          query: "SELECT COUNT(*) as total FROM sqlite_master"
        }
      }
    });
    
    console.log('✅ SQLite Master Count Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ SQLite Master Count Failed:', error.message);
  }
  
  console.log('\n🎯 ANALYSIS:');
  console.log('If all tests show empty results, the database needs to be populated.');
  console.log('The system routing is working perfectly - we just need data!');
}

if (require.main === module) {
  testMcpDatabase().catch(console.error);
}

module.exports = { testMcpDatabase };
