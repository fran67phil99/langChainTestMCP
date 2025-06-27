// Test diretto della funzione getAllMcpTools
const { getAllMcpTools } = require('./src/utils/mcpUtils.commonjs.js');

async function testMcpToolsDirectly() {
  console.log('🧪 Test diretto getAllMcpTools...');
  console.log('='.repeat(50));
  
  try {
    const tools = await getAllMcpTools();
    
    console.log(`🎯 Risultato: ${tools.length} tool trovati`);
    
    if (tools.length > 0) {
      console.log('\n📋 Tool disponibili:');
      tools.forEach((tool, index) => {
        console.log(`${index + 1}. ${tool.name}`);
        console.log(`   Server: ${tool.serverName || tool.serverId}`);
        console.log(`   Descrizione: ${tool.description}`);
        console.log('');
      });
    } else {
      console.log('❌ Nessun tool trovato!');
    }
    
  } catch (error) {
    console.error('❌ Errore:', error.message);
    console.error('Stack:', error.stack);
  }
}

testMcpToolsDirectly();
