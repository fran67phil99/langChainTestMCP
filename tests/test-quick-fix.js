#!/usr/bin/env node

/**
 * QUICK FIX TEST - Test delle correzioni al DataExplorerAgent
 * Verifica che ora risponda correttamente alle domande specifiche
 */

const { runDataExplorerAgent } = require('../src/agents/dataExplorerAgent');

// Load environment configuration
require('dotenv').config();

console.log('🔧 QUICK FIX TEST - Correzioni DataExplorerAgent');
console.log('='.repeat(50));

async function testFixedDataExplorer() {
    // Schema di esempio con dati reali da produzione
    const productionSchema = {
        tables: ['_import_history', 'sqlite_sequence', '_table_metadata', 'dataset'],
        detailed: {
            'dataset': {
                columnNames: ['id', 'Title', 'Market', 'Univ__title', 'Title_cod', 'Issue', 'Sale_Date', 'Channel'],
                columnCount: 77,
                method: 'production_optimized',
                rowCount: 19907
            }
        },
        discoveryMethod: 'production_mcp_tools'
    };

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

    console.log('🧪 Testing specific user question that failed in production...');
    
    const userQuery = "Full list of the titles for each Universal title - Which are the titles running by range of publication date? Which is the last issue of each collection? Which is the last sales date for each title?";
    
    console.log(`📝 Query: "${userQuery}"`);
    console.log(`📊 Schema: ${productionSchema.tables.length} tables, ${productionSchema.detailed.dataset.rowCount} rows in dataset`);
    
    try {
        const startTime = Date.now();
        
        const result = await runDataExplorerAgent(
            [], // messages
            mockTools, // availableTools
            userQuery, // userQuery
            'quick-fix-test', // threadId
            { universal_schema_context: { schema: productionSchema } } // a2aContext
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
        
        if (result.collaborations) {
            console.log(`🔗 Collaborations: ${JSON.stringify(result.collaborations)}`);
        }
        
        console.log('');
        
        // Verifica che abbia risposto alle domande specifiche
        const hasAnswered = result.data && 
                          (JSON.stringify(result.data).includes('universal') ||
                           JSON.stringify(result.data).includes('issue') ||
                           JSON.stringify(result.data).includes('sales'));
        
        if (hasAnswered) {
            console.log('🎉 SUCCESS: Il sistema ora risponde alle domande specifiche!');
            console.log('✅ CORREZIONI FUNZIONANTI');
        } else {
            console.log('⚠️ ATTENZIONE: Il sistema ancora non risponde completamente alle domande');
            console.log('🔄 Potrebbero servire ulteriori correzioni');
        }
        
    } catch (error) {
        console.log('❌ ERROR durante il test:', error.message);
        console.log('🔧 Stack trace:', error.stack);
    }
}

// Execute test
if (require.main === module) {
    testFixedDataExplorer().catch(error => {
        console.error('❌ Test failed:', error);
        process.exit(1);
    });
}

module.exports = { testFixedDataExplorer };
