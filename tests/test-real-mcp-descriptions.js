// Test per verificare che le descrizioni MCP vengano REALMENTE dai server
const { getAllMcpTools } = require('../src/utils/mcpUtils.commonjs');

async function testMcpRealDescriptions() {
    console.log('🧪 Testing MCP Tool Real Descriptions (From Servers)');
    console.log('=' .repeat(60));
    
    try {
        console.log('🔍 Discovering MCP tools from servers...');
        const tools = await getAllMcpTools();
        
        console.log(`\n📋 Found ${tools.length} tools:`);
        tools.forEach((tool, index) => {
            console.log(`\n${index + 1}. 🔧 ${tool.name}`);
            console.log(`   📝 Description: "${tool.description}"`);
            console.log(`   🏠 Server: ${tool.serverName} (${tool.serverId})`);
            console.log(`   🆔 Type: ${tool.mcpTool ? 'MCP Tool' : 'HTTP Tool'}`);
            
            // Analizza la descrizione per capire se è reale o fallback
            if (tool.description === 'Tool description not provided by server') {
                console.log('   ⚠️ WARNING: Using fallback description - server didn\'t provide one');
            } else if (tool.description.includes('Tool from')) {
                console.log('   ❌ PROBLEM: Using old fallback format');
            } else if (tool.description.includes('[Mauden')) {
                console.log('   ❌ CRITICAL: Still using hardcoded [Mauden] prefix!');
            } else {
                console.log('   ✅ GOOD: Real description from server');
            }
            
            // Analizza la specifica del tool
            if (tool.inputSchema || tool.schema) {
                const schema = tool.inputSchema || tool.schema;
                if (schema.properties) {
                    const params = Object.keys(schema.properties);
                    console.log(`   📋 Parameters: ${params.length > 0 ? params.join(', ') : 'none'}`);
                } else {
                    console.log('   📋 Parameters: no schema info');
                }
            }
        });
        
        // Analisi delle descrizioni
        console.log('\n🎯 DESCRIPTION ANALYSIS:');
        
        const realDescriptions = tools.filter(tool => 
            tool.description !== 'Tool description not provided by server' &&
            !tool.description.includes('Tool from') &&
            !tool.description.includes('[Mauden')
        );
        
        const fallbackDescriptions = tools.filter(tool => 
            tool.description === 'Tool description not provided by server'
        );
        
        const problematicDescriptions = tools.filter(tool => 
            tool.description.includes('Tool from') ||
            tool.description.includes('[Mauden')
        );
        
        console.log(`✅ Real descriptions from servers: ${realDescriptions.length}/${tools.length}`);
        console.log(`⚠️ Fallback descriptions (server didn't provide): ${fallbackDescriptions.length}/${tools.length}`);
        console.log(`❌ Problematic descriptions (hardcoded): ${problematicDescriptions.length}/${tools.length}`);
        
        if (problematicDescriptions.length > 0) {
            console.log('\n❌ PROBLEMATIC TOOLS:');
            problematicDescriptions.forEach(tool => {
                console.log(`   - ${tool.name}: "${tool.description}"`);
            });
        }
        
        if (realDescriptions.length > 0) {
            console.log('\n✅ GOOD EXAMPLES (Real from servers):');
            realDescriptions.slice(0, 3).forEach(tool => {
                console.log(`   - ${tool.name}: "${tool.description}"`);
            });
        }
        
        // Verifica che le descrizioni contengano informazioni reali sui tool
        const descriptiveTools = tools.filter(tool => 
            tool.description.length > 20 && 
            !tool.description.includes('Tool description not provided') &&
            !tool.description.includes('Tool from')
        );
        
        console.log(`\n📈 QUALITY ASSESSMENT:`);
        console.log(`Total tools: ${tools.length}`);
        console.log(`With real descriptions: ${realDescriptions.length} (${Math.round(realDescriptions.length/tools.length*100)}%)`);
        console.log(`Descriptive (>20 chars): ${descriptiveTools.length} (${Math.round(descriptiveTools.length/tools.length*100)}%)`);
        
        if (realDescriptions.length === tools.length) {
            console.log('\n🎉 PERFECT! All descriptions come from the servers themselves!');
        } else if (realDescriptions.length > tools.length * 0.5) {
            console.log('\n✅ GOOD! Most descriptions come from servers.');
        } else {
            console.log('\n⚠️ NEEDS WORK: Many tools still using fallback descriptions.');
        }
        
        return {
            total: tools.length,
            real: realDescriptions.length,
            fallback: fallbackDescriptions.length,
            problematic: problematicDescriptions.length,
            tools: tools
        };
        
    } catch (error) {
        console.error('❌ Error testing MCP descriptions:', error.message);
        console.error('This might indicate servers are not running or accessible.');
        return { error: error.message };
    }
}

// Funzione per mostrare esattamente cosa viene inviato al planner
function showPlannerInput(tools) {
    console.log('\n📤 WHAT THE PLANNER RECEIVES:');
    console.log('=' .repeat(50));
    
    const plannerToolsFormat = tools.map(tool => {
        const name = tool.name || 'Unknown Tool';
        const description = tool.description || 'No description available';
        const schema = tool.schema || tool.input_schema;
        const params = schema?.properties ? Object.keys(schema.properties).join(', ') : 'no parameters';
        return `- ${name}: ${description} (params: ${params})`;
    }).join('\n');
    
    console.log(plannerToolsFormat);
    
    console.log('\n🎯 PLANNER WILL SEE:');
    console.log(`${tools.length} tools with their actual descriptions from MCP servers`);
    console.log('No more hardcoded [Mauden MCP Server] prefixes!');
}

async function main() {
    const result = await testMcpRealDescriptions();
    
    if (!result.error && result.tools) {
        showPlannerInput(result.tools);
    }
    
    console.log('\n🎯 CONCLUSION:');
    console.log('The descriptions should now come directly from MCP servers,');
    console.log('not from hardcoded configuration files!');
}

if (require.main === module) {
    main();
}

module.exports = { testMcpRealDescriptions, showPlannerInput };
