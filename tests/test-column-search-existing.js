// Test per verificare la ricerca delle colonne con termine esistente
const { runDataExplorerAgent } = require('../src/agents/dataExplorerAgent.js');
const { getAllMcpTools } = require('../src/utils/mcpUtils.commonjs.js');
const { HumanMessage } = require('@langchain/core/messages');

async function testColumnSearchExisting() {
    console.log('🔍 Test Column Search with Existing Term...');
    
    try {
        // 1. Carica i tool MCP
        const mcpTools = await getAllMcpTools();
        console.log(`✅ Loaded ${mcpTools.length} MCP tools`);
        
        // 2. Test con termine esistente
        const testQuery = "esiste una colonna con un nome simile a 'commercial'?";
        const messages = [new HumanMessage(testQuery)];
        const threadId = 'test-column-search-commercial';
        
        console.log(`🔍 Testing query: "${testQuery}"`);
        
        // 3. Esegui il Data Explorer Agent
        const result = await runDataExplorerAgent(messages, mcpTools, testQuery, threadId);
        
        console.log('📊 Data Explorer Agent Result:');
        console.log('Success:', result.success);
        console.log('Operation:', result.operation);
        
        if (result.success) {
            console.log('✅ Column search successful!');
            console.log('------- FORMATTED RESPONSE -------');
            console.log(result.formattedResponse);
            console.log('------- END RESPONSE -------');
        } else {
            console.log('❌ Column search failed:', result.error);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

testColumnSearchExisting();
