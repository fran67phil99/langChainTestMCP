// Test rapido per verificare il caricamento degli strumenti MCP
const { runOrchestratorOptimized } = require('../src/agents/orchestratorAgent.optimized');

async function testMcpToolsReload() {
    console.log('🔧 Test MCP Tools Reload...');
    
    try {
        // Simula una query che dovrebbe usare il Data Explorer
        const testQuery = "Within which issue we received expected returns for the Comp. Silce 808647?";
        const threadId = 'test-reload-' + Date.now();
        
        console.log(`🔍 Testing query: "${testQuery}"`);
        console.log(`🧵 Thread ID: ${threadId}`);
        
        const result = await runOrchestratorOptimized(testQuery, threadId, []);
        
        console.log('📊 Orchestrator Result:');
        console.log('Selected Agent:', result.selectedAgent);
        console.log('Success:', !result.error);
        
        if (result.error) {
            console.log('❌ Error:', result.error);
        } else {
            console.log('✅ Response:', result.finalResponse);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testMcpToolsReload();
