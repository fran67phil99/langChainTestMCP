// Test rapido per il discovery MCP
const { getAllMcpTools } = require('../src/utils/mcpUtils.commonjs.js');

console.log('🔍 Testing MCP tools discovery...');
console.log('═══════════════════════════════════════════════════════════════════════════════');

getAllMcpTools()
  .then(tools => {
    console.log(`✅ Discovered ${tools.length} total tools:\n`);
    
    // Raggruppa per server
    const serverGroups = {};
    tools.forEach(tool => {
      const serverName = tool.serverName || 'Unknown';
      if (!serverGroups[serverName]) {
        serverGroups[serverName] = [];
      }
      serverGroups[serverName].push(tool);
    });
    
    // Mostra per server
    Object.entries(serverGroups).forEach(([serverName, serverTools]) => {
      console.log(`📡 ${serverName} (${serverTools.length} tools):`);
      serverTools.forEach((tool, index) => {
        console.log(`   ${index + 1}. ${tool.name}`);
      });
      console.log('');
    });
    
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    console.log(`🎯 Total: ${tools.length} tools from ${Object.keys(serverGroups).length} servers`);
  })
  .catch(error => {
    console.error('❌ Error:', error.message);
    console.error('❌ Stack:', error.stack);
  });
