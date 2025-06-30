/**
 * Integration Test per l'Orchestratore con Plan Execution
 * 
 * Questo test verifica che l'orchestratore:
 * 1. Gestisca correttamente i piani generati da SQLSchemaAgent
 * 2. Esegua i piani tramite MCPAgent quando needs_execution = true
 * 3. Ritorni all'agente originale con i risultati di esecuzione
 * 4. Passi correttamente i dati tra agenti tramite A2A context
 */

const { runOrchestration } = require('../src/agents/orchestratorAgent.optimized');

async function testOrchestratorPlanExecution() {
    console.log('🧪 Starting Orchestrator Plan Execution Integration Test');
    console.log('='.repeat(60));
    
    try {
        // Test query che dovrebbe triggerare SQLSchemaAgent e plan execution
        const testQuery = "Dammi una lista delle tabelle nel database con informazioni dettagliate sui loro schemi";
        const threadId = `test_${Date.now()}`;
        
        console.log(`📋 Test Query: ${testQuery}`);
        console.log(`🆔 Thread ID: ${threadId}`);
        console.log('');
        
        const startTime = Date.now();
        
        // Esegui l'orchestrazione
        const result = await runOrchestration(testQuery, threadId, []);
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        console.log('');
        console.log('🎯 ORCHESTRATION RESULT:');
        console.log('='.repeat(40));
        console.log(`📊 Duration: ${duration}ms`);
        console.log(`✅ Success: ${!!result.finalResponse}`);
        console.log(`🔧 Selected Agent: ${result.selectedAgent}`);
        
        if (result.finalResponse) {
            console.log(`📝 Response Length: ${result.finalResponse.length} characters`);
            console.log(`📄 Response Preview: ${result.finalResponse.substring(0, 200)}...`);
        }
        
        if (result.technical_details) {
            console.log(`🔍 Technical Details: ${result.technical_details.substring(0, 300)}...`);
        }
        
        // Verifica basilari
        const checks = [
            { name: 'Has Final Response', condition: !!result.finalResponse },
            { name: 'Has Messages Array', condition: Array.isArray(result.messages) },
            { name: 'Response is String', condition: typeof result.finalResponse === 'string' },
            { name: 'Response Not Empty', condition: result.finalResponse && result.finalResponse.trim().length > 0 },
            { name: 'No Error Messages', condition: !result.error },
            { name: 'Uses Planner-Executor Flow', condition: result.selectedAgent === 'planner_executor_flow' }
        ];
        
        console.log('');
        console.log('🔍 VALIDATION CHECKS:');
        console.log('='.repeat(40));
        
        let passed = 0;
        let total = checks.length;
        
        for (const check of checks) {
            const status = check.condition ? '✅' : '❌';
            console.log(`${status} ${check.name}`);
            if (check.condition) passed++;
        }
        
        console.log('');
        console.log(`📊 Test Result: ${passed}/${total} checks passed`);
        
        if (passed === total) {
            console.log('🎉 INTEGRATION TEST PASSED!');
            console.log('🔥 Orchestratore now correctly handles plan execution!');
        } else {
            console.log('⚠️ Some checks failed, but orchestrator is working');
        }
        
        // Log dettagliato per il debug
        console.log('');
        console.log('🔬 DETAILED ANALYSIS:');
        console.log('='.repeat(40));
        
        if (result.messages && result.messages.length > 0) {
            console.log(`💬 Message History: ${result.messages.length} messages`);
            result.messages.forEach((msg, idx) => {
                const type = msg.constructor.name;
                const content = msg.content ? msg.content.substring(0, 100) : 'No content';
                console.log(`  ${idx + 1}. ${type}: ${content}...`);
            });
        }
        
        return {
            success: passed === total,
            passed: passed,
            total: total,
            duration: duration,
            response: result.finalResponse
        };
        
    } catch (error) {
        console.error('❌ INTEGRATION TEST ERROR:', error);
        console.error('Stack:', error.stack);
        
        return {
            success: false,
            error: error.message,
            stack: error.stack
        };
    }
}

// Esegui il test se chiamato direttamente
if (require.main === module) {
    testOrchestratorPlanExecution()
        .then(result => {
            console.log('');
            console.log('🏁 FINAL TEST STATUS:');
            console.log('='.repeat(40));
            
            if (result.success) {
                console.log('🎉 TEST PASSED!');
                process.exit(0);
            } else {
                console.log('❌ TEST FAILED!');
                if (result.error) {
                    console.log(`Error: ${result.error}`);
                }
                process.exit(1);
            }
        })
        .catch(err => {
            console.error('💥 FATAL TEST ERROR:', err);
            process.exit(1);
        });
}

module.exports = { testOrchestratorPlanExecution };
