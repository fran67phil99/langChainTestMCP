// Test rapido per verificare il routing corretto
const { shouldUseDataExplorer } = require('../src/agents/orchestratorAgent.optimized.js');

async function testRouting() {
    console.log('🧪 Test routing queries...');
    
    // Mock di alcuni tools MCP
    const mockTools = [
        { name: 'list_tables', description: 'List database tables' },
        { name: 'query_sql', description: 'Execute SQL queries' }
    ];
    
    const testQueries = [
        'che tabelle ho a disposizione?',
        'what tables do I have available?',
        'mostra tabelle',
        'show tables',
        'list tables',
        'quali tabelle ci sono?',
        'which tables are available?',
        'database schema'
    ];
    
    console.log('\n📋 Test Pattern Recognition:');
    testQueries.forEach(query => {
        const shouldUseDE = shouldUseDataExplorer(query, mockTools);
        console.log(`${shouldUseDE ? '✅ DataExplorer' : '❌ Other'}: "${query}"`);
    });
}

testRouting();
