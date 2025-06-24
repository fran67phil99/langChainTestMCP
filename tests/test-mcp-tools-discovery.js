// Test per verificare la scoperta dei tool MCP
const { getAllMcpTools } = require('../src/utils/mcpUtils.commonjs.js');

async function testMcpToolsDiscovery() {
    console.log('🔍 Test MCP Tools Discovery...');
    
    try {
        const tools = await getAllMcpTools();
        console.log(`✅ Trovati ${tools.length} tool MCP`);
        
        if (tools.length === 0) {
            console.log('❌ Nessun tool MCP trovato - possibili cause:');
            console.log('   - Server MCP non avviati');
            console.log('   - Configurazione MCP non corretta');
            console.log('   - Problema di connessione ai server');
            return;
        }
        
        // Cerca tool di database
        const databaseTools = tools.filter(tool => 
            tool.name.includes('database') || 
            tool.name.includes('sql') || 
            tool.name.includes('query') ||
            tool.name.includes('data') ||
            tool.name.includes('csv') ||
            tool.name.includes('table') ||
            tool.name.includes('schema')
        );
        
        console.log(`🔍 Tool di database trovati: ${databaseTools.length}`);
        
        if (databaseTools.length === 0) {
            console.log('❌ Nessun tool di database trovato');
            console.log('📋 Tool disponibili:');
            tools.forEach(tool => {
                console.log(`   - ${tool.name} (${tool.serverName})`);
            });
        } else {
            console.log('✅ Tool di database disponibili:');
            databaseTools.forEach(tool => {
                console.log(`   - ${tool.name} (${tool.serverName})`);
                if (tool.description) {
                    console.log(`     ${tool.description}`);
                }
            });
        }
        
        // Cerca tool con "collection" nel nome o descrizione
        const collectionTools = tools.filter(tool => 
            tool.name.toLowerCase().includes('collection') ||
            (tool.description && tool.description.toLowerCase().includes('collection'))
        );
        
        console.log(`🔍 Tool con "collection": ${collectionTools.length}`);
        collectionTools.forEach(tool => {
            console.log(`   - ${tool.name}: ${tool.description || 'No description'}`);
        });
        
    } catch (error) {
        console.error('❌ Errore durante la scoperta dei tool MCP:', error);
        console.log('Possibili cause:');
        console.log('   - Server MCP non avviati');
        console.log('   - Errore di configurazione');
        console.log('   - Problema di rete o timeout');
    }
}

testMcpToolsDiscovery();
