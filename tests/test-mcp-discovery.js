// Test rapido per il discovery MCP
const { getAllMcpTools } = require('./src/utils/mcpUtils.commonjs.js');

console.log('🔍 Testing MCP tools discovery...');

getAllMcpTools()
  .then(tools => {
    console.log(`✅ Discovered ${tools.length} tools:`);
    tools.forEach(tool => {
      console.log(`  - ${tool.name} (${tool.serverName || 'Unknown'})`);
    });
  })
  .catch(error => {
    console.error('❌ Error:', error.message);
    console.error('❌ Stack:', error.stack);
  });
