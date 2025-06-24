// Test script per debuggare il routing dell'orchestratore
require('dotenv').config();

const { shouldUseDataExplorer } = require('../src/agents/orchestratorAgent.optimized');

async function testRouting() {
  console.log('🔍 Testing routing decisions...');
  
  // Mock MCP tools che include tool di dati
  const mockMcpTools = [
    {
      name: 'get_dati_csv_mcp',
      description: 'Recupera i dati di tutti i dipendenti di Mauden dal dataset server tramite REST API',
      serverName: 'my-mcp-server'
    },
    {
      name: 'get_stagisti_mcp', 
      description: 'Recupera la lista degli stagisti di Mauden dal dataset server tramite REST API',
      serverName: 'my-mcp-server'
    }
  ];
  
  const testQueries = [
    "Which are the titles that have the same Product Titles?",
    "Which are all the universal titles that includes the string 'ISS International Space Station Build Up'?",
    "How many records are there?",
    "Show me the data",
    "What's the weather like?",
    "Hello, how are you?"
  ];
  
  for (const query of testQueries) {
    console.log(`\n📝 Testing query: "${query}"`);
    try {
      const shouldUse = await shouldUseDataExplorer(query, mockMcpTools);
      console.log(`✅ Result: ${shouldUse ? 'DATA_EXPLORER' : 'NOT_DATA_EXPLORER'}`);
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }
  }
}

testRouting().catch(console.error);
