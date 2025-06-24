// Test per verificare la scoperta dello schema tramite Data Explorer Agent
const { runDataExplorerAgent } = require('../src/agents/dataExplorerAgent.js');
const { getAllMcpTools } = require('../src/utils/mcpUtils.commonjs.js');
const { HumanMessage } = require('@langchain/core/messages');

async function testSchemaDiscovery() {
    console.log('🔍 Test Schema Discovery via Data Explorer Agent...');
    
    try {
        // 1. Carica i tool MCP
        console.log('📋 Loading MCP tools...');
        const mcpTools = await getAllMcpTools();
        console.log(`✅ Loaded ${mcpTools.length} MCP tools`);
        
        // 2. Prepara la query per testare la scoperta delle colonne
        const testQuery = "esiste una colonna con un nome simile a 'collection'?";
        const messages = [new HumanMessage(testQuery)];
        const threadId = 'test-schema-discovery';
        
        console.log(`🔍 Testing query: "${testQuery}"`);
        
        // 3. Esegui il Data Explorer Agent
        const result = await runDataExplorerAgent(messages, mcpTools, testQuery, threadId);
        
        console.log('📊 Data Explorer Agent Result:');
        console.log('Success:', result.success);
        console.log('Agent:', result.agent);
        
        if (result.success) {
            console.log('✅ Schema discovery successful!');
            console.log('Formatted Response:', result.formattedResponse);
        } else {
            console.log('❌ Schema discovery failed:');
            console.log('Error:', result.error);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

testSchemaDiscovery();
