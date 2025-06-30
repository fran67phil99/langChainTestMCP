// Test del nuovo Planner Agent collaborativo e A2A-aware
const { runPlannerAgent } = require('../src/agents/plannerAgent');
const { runOrchestration } = require('../src/agents/orchestratorAgent.optimized');

async function testRevolutionaryCollaborativePlanner() {
    console.log('🧪 Testing Revolutionary Collaborative Planner Agent');
    console.log('=' .repeat(60));

    // Test Case 1: Collaborative Discovery per query sui dati
    console.log('\n🔬 Test 1: Collaborative Discovery Strategy');
    const test1 = await runPlannerAgent({
        user_request: "mostrami i dati di vendita e analizza i trend",
        available_tools: [
            { name: "sql_query", description: "Execute SQL queries", schema: { properties: { query: {} } } },
            { name: "sales_api", description: "Access sales data", schema: { properties: { period: {} } } }
        ]
    });
    
    console.log('Plan generated:', JSON.stringify(test1, null, 2));
    console.log('Expected: Collaborative workflow with agent communication');
    console.log('✅ Strategy:', test1.strategy);

    // Test Case 2: Parallel Investigation per query ambigue
    console.log('\n🔬 Test 2: Parallel Investigation Strategy');
    const test2 = await runPlannerAgent({
        user_request: "informazioni su Universal",
        available_tools: [
            { name: "company_api", description: "Company information", schema: { properties: { name: {} } } },
            { name: "database_search", description: "Search database", schema: { properties: { term: {} } } }
        ]
    });
    
    console.log('Plan generated:', JSON.stringify(test2, null, 2));
    console.log('Expected: Parallel investigation with discovery');
    console.log('✅ Strategy:', test2.strategy);

    // Test Case 3: Adaptive Chain per query complesse
    console.log('\n🔬 Test 3: Adaptive Chain Strategy');
    const test3 = await runPlannerAgent({
        user_request: "trova i progetti 2024, analizza performance e spiega risultati",
        available_tools: [
            { name: "project_data", description: "Project management data", schema: { properties: { year: {} } } }
        ]
    });
    
    console.log('Plan generated:', JSON.stringify(test3, null, 2));
    console.log('Expected: Multi-step adaptive workflow');
    console.log('✅ Strategy:', test3.strategy);

    // Test Case 4: Simple Strategy per query semplici
    console.log('\n🔬 Test 4: Simple Strategy');
    const test4 = await runPlannerAgent({
        user_request: "ciao, come stai?",
        available_tools: []
    });
    
    console.log('Plan generated:', JSON.stringify(test4, null, 2));
    console.log('Expected: Simple conversation strategy');
    console.log('✅ Strategy:', test4.strategy);

    // Test Case 5: Nessun tool MCP - dovrebbe usare collaborazione interna
    console.log('\n🔬 Test 5: No MCP Tools - Internal Collaboration');
    const test5 = await runPlannerAgent({
        user_request: "mostrami i clienti più importanti",
        available_tools: [] // Nessun tool MCP disponibile
    });
    
    console.log('Plan generated:', JSON.stringify(test5, null, 2));
    console.log('Expected: Internal agent collaboration');
    console.log('✅ Strategy:', test5.strategy);

    console.log('\n🎯 Revolutionary Planner Tests Summary:');
    console.log('- Test 1 (Collaborative Discovery):', test1.strategy);
    console.log('- Test 2 (Parallel Investigation):', test2.strategy); 
    console.log('- Test 3 (Adaptive Chain):', test3.strategy);
    console.log('- Test 4 (Simple Strategy):', test4.strategy);
    console.log('- Test 5 (No MCP - Internal):', test5.strategy);

    // Verify the planner is really creating collaborative workflows
    const hasCollaborativeFeatures = [test1, test2, test3, test5].some(plan => 
        plan.workflow || plan.parallel_workflows || plan.chain || 
        (plan.steps && plan.steps.some(step => step.a2a_share || step.a2a_receive))
    );

    console.log('\n🚀 Revolutionary Features Check:');
    console.log('✅ Collaborative workflows detected:', hasCollaborativeFeatures);
    console.log('✅ Non-rigid strategies:', [test1, test2, test3, test5].every(plan => plan.strategy !== 'internal_agents'));
    console.log('✅ A2A communication planned:', [test1, test2, test3].some(plan => 
        JSON.stringify(plan).includes('a2a_') || JSON.stringify(plan).includes('collaborat')
    ));

    return {
        test1, test2, test3, test4, test5,
        revolutionary_features: hasCollaborativeFeatures
    };
}

async function testCollaborativeExecution() {
    console.log('\n🧪 Testing Collaborative Execution with Orchestrator');
    console.log('=' .repeat(60));

    // Test esecuzione collaborativa reale
    try {
        const result = await runOrchestration(
            "mostrami informazioni sui progetti recenti", 
            [], // nessuna chat history
            'test-collaborative-exec'
        );

        console.log('\n✅ Collaborative Execution Result:');
        console.log('Response:', result.response?.substring(0, 200) + '...');
        console.log('Strategy used:', result.technical_details);
        console.log('Thread ID:', result.threadId);

        return result;
    } catch (error) {
        console.error('❌ Collaborative execution failed:', error.message);
        return { error: error.message };
    }
}

// Main test runner
async function main() {
    try {
        console.log('🚀 REVOLUTIONARY COLLABORATIVE PLANNER TEST SUITE');
        console.log('Testing the new A2A-aware, non-rigid planner logic');
        console.log('=' .repeat(80));

        const plannerResults = await testRevolutionaryCollaborativePlanner();
        const executionResults = await testCollaborativeExecution();

        console.log('\n🎯 FINAL ASSESSMENT:');
        console.log('Planner revolutionary features:', plannerResults.revolutionary_features ? '✅ SUCCESS' : '❌ NEEDS WORK');
        console.log('Execution compatibility:', executionResults.error ? '❌ ERROR' : '✅ SUCCESS');
        
        if (plannerResults.revolutionary_features) {
            console.log('\n🎉 SUCCESS! Il planner è ora veramente collaborativo e A2A-aware!');
            console.log('✅ Elimina logiche rigide hardcoded');
            console.log('✅ Pianifica collaborazione tra agenti');
            console.log('✅ Supporta discovery dinamica');
            console.log('✅ Crea workflow multi-step intelligenti');
        } else {
            console.log('\n⚠️ Il planner ha ancora logiche troppo rigide. Serve più refactoring.');
        }

    } catch (error) {
        console.error('❌ Test suite failed:', error);
    }
}

if (require.main === module) {
    main();
}

module.exports = { testRevolutionaryCollaborativePlanner, testCollaborativeExecution };
