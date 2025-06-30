// Test per verificare che le descrizioni MCP siano corrette
const { getAllMcpTools } = require('../src/utils/mcpUtils.commonjs');

async function testMcpToolDescriptions() {
    console.log('🧪 Testing MCP Tool Descriptions After Fix');
    console.log('=' .repeat(50));
    
    try {
        console.log('🔍 Discovering MCP tools...');
        const tools = await getAllMcpTools();
        
        console.log(`\n📋 Found ${tools.length} tools:`);
        tools.forEach((tool, index) => {
            console.log(`\n${index + 1}. ${tool.name}`);
            console.log(`   Description: ${tool.description}`);
            console.log(`   Server: ${tool.serverName} (${tool.serverId})`);
            
            // Check for problematic descriptions
            if (tool.description.includes('[Mauden')) {
                console.log('   ❌ PROBLEM: Still contains hardcoded [Mauden] prefix!');
            } else {
                console.log('   ✅ Description looks clean');
            }
        });
        
        // Summary
        const problematicTools = tools.filter(tool => 
            tool.description.includes('[Mauden') || 
            tool.description.includes('Mauden MCP Server') ||
            tool.description.includes('Mauden SQL MCP Server')
        );
        
        console.log('\n🎯 SUMMARY:');
        console.log(`Total tools: ${tools.length}`);
        console.log(`Problematic descriptions: ${problematicTools.length}`);
        
        if (problematicTools.length === 0) {
            console.log('✅ SUCCESS: All tool descriptions are now clean!');
        } else {
            console.log('❌ PROBLEM: Some tools still have incorrect descriptions:');
            problematicTools.forEach(tool => {
                console.log(`   - ${tool.name}: ${tool.description}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error testing MCP tools:', error.message);
    }
}

testMcpToolDescriptions();
