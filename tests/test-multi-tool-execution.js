// Test per verificare l'esecuzione multi-tool nell'McpAgent
require('dotenv').config();
const { mcp_client } = require('../mcp-api-server');
const { runOrchestration } = require('../src/agents/orchestratorAgent.optimized');

async function testMultiToolExecution() {
    console.log('🧪 Testing Multi-Tool Execution in McpAgent...\n');
    
    try {
        // Test query che dovrebbe richiedere più tool
        const queries = [
            {
                query: "Show me all employees and interns at Mauden",
                description: "Query that should trigger multiple tool execution"
            },
            {
                query: "List all company personnel data",
                description: "Comprehensive personnel query"
            },
            {
                query: "Get information about everyone working at Mauden",
                description: "Another comprehensive query"
            }
        ];
        
        for (const testCase of queries) {
            console.log(`\n🔍 Testing: ${testCase.description}`);
            console.log(`Query: "${testCase.query}"`);
            
            const result = await runOrchestration(testCase.query, `test-multi-${Date.now()}`);
            
            console.log(`\n📊 Results for "${testCase.query}":`);
            console.log(`- Success: ${result.success || result.finalResponse ? 'Yes' : 'No'}`);
            console.log(`- Agent used: ${result.agent || 'Unknown'}`);
            
            if (result.method) {
                console.log(`- Method: ${result.method}`);
            }
            
            if (result.toolsUsed && Array.isArray(result.toolsUsed)) {
                console.log(`- Multiple tools used: ${result.toolsUsed.length} tools`);
                console.log(`- Tools: ${result.toolsUsed.join(', ')}`);
                console.log(`✅ MULTI-TOOL EXECUTION DETECTED!`);
            } else if (result.toolUsed) {
                console.log(`- Single tool used: ${result.toolUsed}`);
                console.log(`⚠️ Single tool execution (may need improvement)`);
            }
            
            if (result.toolCount) {
                console.log(`- Tool count: ${result.toolCount}`);
            }
            
            if (result.mcpData && Array.isArray(result.mcpData)) {
                console.log(`- Data sources: ${result.mcpData.length} sources`);
                result.mcpData.forEach((source, index) => {
                    console.log(`  ${index + 1}. ${source.toolName}: ${source.success ? 'Success' : 'Failed'}`);
                });
            }
            
            // Mostra un preview della risposta
            if (result.finalResponse) {
                const preview = result.finalResponse.length > 200 
                    ? result.finalResponse.substring(0, 200) + '...'
                    : result.finalResponse;
                console.log(`\n💬 Response preview: ${preview}`);
            }
            
            console.log('\n' + '='.repeat(80));
        }
        
        console.log('\n🎯 Multi-Tool Execution Test Summary:');
        console.log('- Tested queries that should require multiple data sources');
        console.log('- Check if McpAgent executes multiple tools when needed');
        console.log('- Verify that responses combine data from all relevant sources');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

// Esegui il test
if (require.main === module) {
    testMultiToolExecution().then(() => {
        console.log('\n✅ Multi-Tool Execution test completed');
        process.exit(0);
    }).catch(error => {
        console.error('❌ Test failed:', error);
        process.exit(1);
    });
}

module.exports = { testMultiToolExecution };
