const assert = require('assert');
const sinon = require('sinon');

// Mocking dependencies before importing the orchestrator
const plannerAgentModule = require('../src/agents/plannerAgent');
const dataExplorerAgentModule = require('../src/agents/dataExplorerAgent');
const mcpAgentModule = require('../src/agents/mcpAgent');
const generalAgentModule = require('../src/agents/generalAgent');
const synthesizerAgentModule = require('../src/agents/synthesizerAgent'); // Import the synthesizer module

// 1. Mock the PlannerAgent to return a predefined plan
const mockPlan = [
    {
        "step_id": 1,
        "tool_to_use": "data_explorer_agent",
        "prompt": "Qual è il dipartimento con il maggior numero di stagisti?",
        "dependencies": [],
        "output_variable": "reparto_top"
    },
    {
        "step_id": 2,
        "tool_to_use": "data_explorer_agent",
        "prompt": "Qual è l'età media dei dipendenti nel dipartimento '{reparto_top}'?",
        "dependencies": [1],
        "output_variable": "eta_media"
    }
];
sinon.stub(plannerAgentModule, 'runPlannerAgent').resolves(JSON.stringify(mockPlan));

// 2. Mock the DataExplorerAgent to return specific results for each step
sinon.stub(dataExplorerAgentModule, 'runDataExplorerAgent').callsFake(async (prompt) => {
    if (prompt.includes('maggior numero di stagisti')) {
        return { response: 'Ingegneria' };
    }
    if (prompt.includes('età media dei dipendenti nel dipartimento \'Ingegneria\'')) {
        return { response: '34' };
    }
    return { response: 'Unknown prompt for DataExplorer' };
});

// 3. Mock the new SynthesizerAgent
const mockSynthesizedResponse = "Il dipartimento con più stagisti è Ingegneria e l'età media dei suoi dipendenti è 34.";
sinon.stub(synthesizerAgentModule, 'runSynthesizerAgent').resolves(mockSynthesizedResponse);

// 4. Mock MCP and General agents
sinon.stub(mcpAgentModule, 'selectMcpTool').resolves([]); // No extra MCP tools
sinon.stub(mcpAgentModule, 'runMcpAgent').resolves({ response: 'MCP Agent Result' });
sinon.stub(generalAgentModule, 'runGeneralAgent').resolves({ response: 'General Agent Fallback' });

// Now, import the orchestrator after mocks are set up
const { runOrchestration } = require('../src/agents/orchestratorAgent.optimized');

// --- Test Execution ---
async function runPlannerTest() {
    console.log('🧪 Running test for Planner-Executor flow...');

    const complexQuery = "Qual è il dipartimento con più stagisti e qual è l'età media dei suoi dipendenti?";
    const chatHistory = [];

    const result = await runOrchestration(complexQuery, chatHistory);

    console.log('✅ Test finished. Final result:', result);

    // --- Assertions ---
    try {
        // Assert that the final response is the synthesized one
        assert.strictEqual(result.response, mockSynthesizedResponse, 'Test Failed: The final response should be the synthesized one.');

        // Assert that the execution context was built correctly
        const expectedContext = '{"reparto_top":"Ingegneria","eta_media":"34"}';
        // The compact JSON string is now in technical_details
        const technicalDetails = JSON.parse(result.technical_details.replace('Execution Context: ', ''));
        assert.deepStrictEqual(technicalDetails, JSON.parse(expectedContext), 'Test Failed: Execution context is incorrect.');


        console.log('🎉 All assertions passed!');
    } catch (error) {
        console.error('🔥 Test Assertion Failed:', error.message);
    }
}

runPlannerTest();
