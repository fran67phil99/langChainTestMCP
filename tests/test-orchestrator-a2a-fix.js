#!/usr/bin/env node

/**
 * ORCHESTRATOR A2A CONTEXT TEST
 * Simula il problema specifico dell'orchestratore che salva solo summary invece dello schema completo
 */

const { runDataExplorerAgent } = require('../src/agents/dataExplorerAgent');

// Load environment configuration
require('dotenv').config();

console.log('🎭 ORCHESTRATOR A2A CONTEXT TEST');
console.log('='.repeat(50));

async function testOrchestratorA2AContext() {
    // Tool di esempio
    const mockTools = [
        {
            name: 'query_database',
            description: 'Execute SQL queries against the database and return structured data',
            call: async (params) => {
                console.log(`🔧 EXECUTING SQL: ${params.query.substring(0, 100)}...`);
                return {
                    success: true,
                    data: {
                        summary: "Query eseguita con successo",
                        universal_titles: ['9U - Knight Rider Car Build Up', '8U - Star Wars Collection'],
                        collections: ['BE', 'FR', 'IT'], 
                        latest_issues: [701, 350, 225],
                        latest_sales: ['01/07/2024', '15/06/2024', '30/05/2024']
                    }
                };
            }
        }
    ];

    const userQuery = "Full list of the titles for each Universal title - Which are the titles running by range of publication date? Which is the last issue of each collection? Which is the last sales date for each title?";
    
    console.log('🧪 Testing with Orchestrator-style A2A context (summary only)...');
    
    // Simula il contesto A2A come salvato dall'orchestratore
    // quando l'agente ha un a2aSummary
    const orchestratorA2AContext = {
        schema_context: {
            agent: 'sql_schema',
            success: true,
            summary: 'Schema discovered with 4 tables: _import_history, sqlite_sequence, _table_metadata, dataset. Dataset table contains 77 columns including Universal titles, sales data, and publication information.',
            analysis: 'Database schema analysis completed',
            method: 'fallback_discovery',
            userQuery: 'discover_schema'
            // NOTA: Manca il campo "schema" con la struttura completa!
        }
    };
    
    console.log(`📝 Query: "${userQuery}"`);
    console.log(`📊 A2A Context: schema_context with summary only (simulating orchestrator issue)`);
    
    try {
        const startTime = Date.now();
        
        const result = await runDataExplorerAgent(
            [], // messages
            mockTools, // availableTools
            userQuery, // userQuery
            'orchestrator-a2a-test', // threadId
            orchestratorA2AContext // a2aContext - simula il problema dell'orchestratore
        );
        
        const executionTime = Date.now() - startTime;
        
        console.log('');
        console.log('📋 RISULTATO DEL TEST:');
        console.log('='.repeat(30));
        console.log(`✅ Success: ${result.success}`);
        console.log(`⏱️ Execution Time: ${executionTime}ms`);
        console.log(`🤖 Agent: ${result.agent}`);
        console.log(`📝 SQL Generated: ${result.sql ? 'YES ✅' : 'NO ❌'}`);
        console.log(`🔧 MCP Used: ${result.mcpAgent ? 'YES ✅' : 'NO ❌'}`);
        console.log(`📊 Data Retrieved: ${result.data ? 'YES ✅' : 'NO ❌'}`);
        
        if (result.error) {
            console.log(`❌ Error: ${result.error}`);
        }
        
        if (result.data) {
            console.log(`📄 Response Preview: ${JSON.stringify(result.data).substring(0, 200)}...`);
        }
        
        console.log('');
        
        // Verifica specifica per il problema dell'orchestratore
        if (result.success && result.data) {
            console.log('🎉 SUCCESS: Il sistema gestisce correttamente il contesto A2A dell\'orchestratore!');
            console.log('✅ CORREZIONE DELL\'ORCHESTRATORE FUNZIONANTE');
        } else if (result.error && result.error.includes('No database tables found')) {
            console.log('❌ FALLIMENTO: Il sistema non riesce ancora a gestire il summary dell\'orchestratore');
            console.log('🔄 Il DataExplorerAgent dovrebbe attivare schema discovery quando trova solo summary');
        } else {
            console.log('⚠️ RISULTATO INASPETTATO: Verifica manuale necessaria');
        }
        
    } catch (error) {
        console.log('❌ ERROR durante il test:', error.message);
        console.log('🔧 Stack trace:', error.stack);
    }
}

// Execute test
if (require.main === module) {
    testOrchestratorA2AContext().catch(error => {
        console.error('❌ Test failed:', error);
        process.exit(1);
    });
}

module.exports = { testOrchestratorA2AContext };
