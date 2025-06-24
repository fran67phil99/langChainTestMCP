// Test diretto del Data Explorer Agent
require('dotenv').config();

const { runDataExplorerAgent } = require('../src/agents/dataExplorerAgent');
const { getAllMcpTools } = require('../src/utils/mcpUtils.commonjs'); // Importa la funzione di discovery

async function testDataExplorer() {
  console.log('🧪 Testing Data Explorer Agent with REAL tools...');
  
  // 1. Scopri i tool reali dal server MCP
  console.log('🔍 Discovering real MCP tools...');
  const realMcpTools = await getAllMcpTools();
  
  if (!realMcpTools || realMcpTools.length === 0) {
    console.error('❌ No real MCP tools discovered. Make sure the MCP server is running and configured correctly in mcp_servers_standard.json.');
    return;
  }
  
  console.log(`✅ Discovered ${realMcpTools.length} real tools.`);

  const testQuery = "Which are the titles that have the same Product Titles?";
  const threadId = 'test-thread-123';
  
  try {
    console.log(`📝 Testing query: "${testQuery}"`);
    
    const result = await runDataExplorerAgent(
      [], // messages
      realMcpTools, // Usa i tool reali scoperti
      testQuery,
      threadId
    );
    
    console.log('✅ Data Explorer Result:');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Error testing Data Explorer:', error.message);
    console.error(error.stack);
  }
}

testDataExplorer().catch(console.error);
