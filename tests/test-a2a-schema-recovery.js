#!/usr/bin/env node

/**
 * A2A SCHEMA RECOVERY TEST
 * Test del sistema di recovery dello schema quando l'orchestratore fornisce solo un riassunto
 */

const { runDataExplorerAgent } = require('../src/agents/dataExplorerAgent');

// Load environment configuration
require('dotenv').config();

console.log('🔄 A2A SCHEMA RECOVERY TEST');
console.log('='.repeat(50));

async function testSchemaRecovery() {
    console.log('🧪 Testing schema recovery when only summary is available...');
    
    // Simuliamo il contesto A2A dell'orchestratore con solo riassunto
    const orchestratorA2AContext = {
        schema_context: {
            agent: "sql_schema",
            success: true,
            summary: "Schema discovered with 4 tables: _import_history, sqlite_sequence, _table_metadata, dataset. Dataset table contains 77 columns including Universal titles, sales data, and publication information.",
            analysis: "Database schema analysis completed",
            method: "fallback_discovery",
            userQuery: "discover_schema"
        }
    };

    // Tool che simula un database reale per la recovery dello schema
    const mockToolsWithSchemaRecovery = [
        {
            name: 'query_database',
            description: 'Execute SQL queries against the database and return structured data',
            call: async (params) => {
                console.log(`🔧 MOCK DATABASE: Executing ${params?.query?.substring(0, 50) || 'query'}...`);
                
                // Simula le risposte del database per la schema discovery
                if (params?.query?.includes('sqlite_master')) {                        return {
                            success: true,
                            data: {
                                query: params?.query,
                                columns: ['name'],
                                rows: [
                                    { name: '_import_history' },
                                    { name: 'sqlite_sequence' },
                                    { name: '_table_metadata' },
                                    { name: 'dataset' }
                                ]
                            }
                        };
                    }
                    
                    // Simula PRAGMA table_info per ogni tabella
                    if (params?.query?.includes('PRAGMA table_info')) {
                        const tableName = params.query.match(/PRAGMA table_info\((\w+)\)/)?.[1];
                    if (tableName === 'dataset') {                            return {
                                success: true,
                                data: {
                                    query: params?.query,
                                    columns: ['cid', 'name', 'type', 'notnull', 'dflt_value', 'pk'],
                                    rows: [
                                        { cid: 0, name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 1 },
                                        { cid: 1, name: 'Title', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
                                        { cid: 2, name: 'Market', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
                                        { cid: 3, name: 'Univ__title', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
                                        { cid: 4, name: 'Title_cod', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
                                        { cid: 5, name: 'Issue', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 0 },
                                        { cid: 6, name: 'Sale_Date', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
                                        { cid: 7, name: 'Channel', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 }
                                    ]
                                }
                            };
                        } else {
                            return {
                                success: true,
                                data: {
                                    query: params?.query,
                                    columns: ['cid', 'name', 'type', 'notnull', 'dflt_value', 'pk'],
                                    rows: [
                                        { cid: 0, name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 1 },
                                        { cid: 1, name: 'name', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 }
                                    ]
                                }
                            };
                        }
                    }
                    
                    // Simula SELECT * FROM table LIMIT 1 per fallback
                    if (params?.query?.includes('SELECT * FROM') && params.query.includes('LIMIT 1')) {
                        const tableName = params.query.match(/FROM\s+"?(\w+)"?\s+LIMIT/)?.[1];
                    if (tableName === 'dataset') {                            return {
                                success: true,
                                data: {
                                    query: params?.query,
                                    columns: ['id', 'Title', 'Market', 'Univ__title', 'Title_cod', 'Issue', 'Sale_Date', 'Channel'],
                                    rows: [{
                                        id: 1,
                                        Title: 'LB40 - KNIGHT RIDER B/U BEL # 1E-LB40',
                                        Market: 'BE',
                                        Univ__title: '9U - Knight Rider Car Build Up',
                                        Title_cod: 'LB40',
                                        Issue: 701,
                                        Sale_Date: '01/07/2024',
                                        Channel: 'SUB'
                                    }]
                                }
                            };
                        } else {
                            return {
                                success: true,
                                data: {
                                    query: params?.query,
                                    columns: ['id', 'name'],
                                    rows: [{ id: 1, name: 'test' }]
                                }
                            };
                        }
                    }
                    
                    // Simula query finale per i dati utente
                    return {
                        success: true,
                        data: {
                            query: params?.query,
                        columns: ['Universal_Title', 'Start_Publication_Date', 'End_Publication_Date', 'Last_Issue', 'Last_Sale_Date'],
                        rows: [
                            {
                                Universal_Title: '9U - Knight Rider Car Build Up',
                                Start_Publication_Date: '01/05/2024',
                                End_Publication_Date: '01/07/2024',
                                Last_Issue: 701,
                                Last_Sale_Date: '01/07/2024'
                            },
                            {
                                Universal_Title: '8U - Star Wars Collection',
                                Start_Publication_Date: '15/04/2024',
                                End_Publication_Date: '15/06/2024',
                                Last_Issue: 350,
                                Last_Sale_Date: '15/06/2024'
                            }
                        ]
                    }
                };
            }
        }
    ];

    const userQuery = "Full list of the titles for each Universal title - Which are the titles running by range of publication date? Which is the last issue of each collection? Which is the last sales date for each title?";
    
    console.log(`📝 Query: "${userQuery}"`);
    console.log(`📊 A2A Context: Orchestrator-style summary only`);
    
    try {
        const startTime = Date.now();
        
        const result = await runDataExplorerAgent(
            [], // messages
            mockToolsWithSchemaRecovery, // availableTools with schema recovery
            userQuery, // userQuery
            'schema-recovery-test', // threadId
            orchestratorA2AContext // orchestrator A2A context with summary only
        );
        
        const executionTime = Date.now() - startTime;
        
        console.log('');
        console.log('📋 RISULTATO DEL TEST:');
        console.log('='.repeat(30));
        console.log(`✅ Success: ${result.success}`);
        console.log(`⏱️ Execution Time: ${executionTime}ms`);
        console.log(`🤖 Agent: ${result.agent}`);
        console.log(`📊 Schema Recovered: ${result.schema ? 'YES ✅' : 'NO ❌'}`);
        console.log(`📝 SQL Generated: ${result.sql ? 'YES ✅' : 'NO ❌'}`);
        console.log(`📊 Data Retrieved: ${result.data ? 'YES ✅' : 'NO ❌'}`);
        
        if (result.error) {
            console.log(`❌ Error: ${result.error}`);
        }
        
        if (result.data) {
            console.log(`📄 Response Preview: ${JSON.stringify(result.data).substring(0, 200)}...`);
        }
        
        console.log('');
        
        // Verifica che il sistema abbia recuperato lo schema e risposto alle domande
        const schemaRecovered = result.success && !result.error;
        const hasDataResponse = result.data && (
            JSON.stringify(result.data).includes('Universal') ||
            JSON.stringify(result.data).includes('Issue') ||
            JSON.stringify(result.data).includes('Sale')
        );
        
        if (schemaRecovered && hasDataResponse) {
            console.log('🎉 SUCCESS: Il sistema recupera correttamente lo schema dal summary A2A!');
            console.log('✅ RECOVERY DELLO SCHEMA FUNZIONANTE');
            console.log('🔄 L\'orchestratore può usare summary A2A senza problemi');
        } else if (schemaRecovered) {
            console.log('⚠️ PARZIALE: Schema recuperato ma risposta incompleta');
            console.log('🔧 Potrebbero servire aggiustamenti al formato della risposta');
        } else {
            console.log('❌ FALLIMENTO: Recovery dello schema non riuscita');
            console.log('🔄 Serve debugging aggiuntivo');
        }
        
    } catch (error) {
        console.log('❌ ERROR durante il test:', error.message);
        console.log('🔧 Stack trace:', error.stack);
    }
}

// Execute test
if (require.main === module) {
    testSchemaRecovery().catch(error => {
        console.error('❌ Test failed:', error);
        process.exit(1);
    });
}

module.exports = { testSchemaRecovery };
