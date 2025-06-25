// Orchestrator Agent - Streamlined multilingual routing coordinator
const { HumanMessage, AIMessage } = require('@langchain/core/messages');
const { runPlannerAgent } = require('./plannerAgent');
const { runSynthesizerAgent } = require('./synthesizerAgent'); // Import the synthesizer
const { processWithLanguageSupport } = require('./languageAgent');
const { runDataExplorerAgent } = require('./dataExplorerAgent');
const { runMcpAgent } = require('./mcpAgent');
const { runGeneralAgent } = require('./generalAgent');
const { initializeLangSmith, logAgentActivity } = require('../utils/langsmithConfig');

// Initialize LangSmith tracing
initializeLangSmith();

// New function to execute a plan from the PlannerAgent
async function executePlan(plan, initialUserInput, chat_history) {
    console.log('🚀 Executing plan:', JSON.stringify(plan, null, 2));
    const executionContext = {}; // Stores results from each step

    for (const step of plan) {
        console.log(`▶️ Executing Step ${step.step_id}: ${step.prompt}`);

        // 1. Hydrate the prompt with data from previous steps
        let hydratedPrompt = step.prompt;
        if (step.dependencies && step.dependencies.length > 0) {
            for (const depId of step.dependencies) {
                const dependentStep = plan.find(s => s.step_id === depId);
                const outputVar = dependentStep.output_variable;
                if (executionContext[outputVar]) {
                    const placeholder = new RegExp(`{${outputVar}}`, 'g');
                    hydratedPrompt = hydratedPrompt.replace(placeholder, executionContext[outputVar]);
                } else {
                    throw new Error(`Execution error: Could not find result for dependency '${outputVar}' from step ${depId}.`);
                }
            }
        }
        console.log(`   Prompt after hydration: ${hydratedPrompt}`);

        // 2. Select and run the appropriate tool
        let stepResult;
        switch (step.tool_to_use) {
            case 'data_explorer_agent':
                stepResult = await runDataExplorerAgent(hydratedPrompt, chat_history);
                break;
            case 'mcp_agent':
                stepResult = await runMcpAgent(hydratedPrompt, chat_history);
                break;
            case 'general_agent':
                stepResult = await runGeneralAgent(hydratedPrompt, chat_history);
                break;
            default:
                // Handle other dynamic MCP tools
                console.log(`Attempting to run dynamic MCP tool: ${step.tool_to_use}`);
                stepResult = await runMcpAgent(hydratedPrompt, chat_history, step.tool_to_use);
                break;
        }

        // 3. Store the result in the execution context
        if (step.output_variable) {
            const resultText = stepResult.response || stepResult;
            executionContext[step.output_variable] = resultText;
            console.log(`✅ Step ${step.step_id} result stored in '${step.output_variable}': "${resultText}"`);
        }
    }

    // Phase 3: Call the Synthesizer Agent to craft the final response
    console.log('✨ Plan execution complete. Calling Synthesizer Agent...');
    const finalSynthesizedResponse = await runSynthesizerAgent(initialUserInput, executionContext, plan);

    return {
        response: finalSynthesizedResponse,
        technical_details: `Execution Context: ${JSON.stringify(executionContext, null, 2)}`
    };
}

// Main Orchestration Function (Planner-Executor Model)
async function runOrchestration(userInput, threadId, chat_history = []) {
    console.log(`🚀 Orchestrator v2 (Planner-Executor): Starting for: \"${userInput}\"`);
    logAgentActivity('orchestrator_v2', 'start', { userInput, threadId });

    try {
        // 1. Handle multilingual input using the existing language agent utility
        const { finalResponse, englishProcessing } = await processWithLanguageSupport(userInput, async (englishQuery) => {
            
            // 2. Generate a plan using the Planner Agent
            console.log(`🧠 Calling Planner Agent for query: \"${englishQuery}\"`);
            let plan = await runPlannerAgent(englishQuery, chat_history);
            
            // Ensure the plan is a JSON object
            if (typeof plan === 'string') {
                try {
                    plan = JSON.parse(plan);
                } catch (e) {
                    console.error("Error parsing planner output:", e);
                    plan = null; // Invalidate plan if parsing fails
                }
            }

            logAgentActivity('orchestrator_v2', 'plan_generated', { plan });

            // If planner returns a direct answer (e.g., for simple questions)
            if (plan && plan.direct_answer) {
                 console.log(`✅ Planner provided a direct answer.`);
                 return { 
                    response: plan.direct_answer,
                    technical_details: "Response generated directly by the Planner Agent."
                };
            }

            // 3. Execute the plan
            if (plan && Array.isArray(plan) && plan.length > 0) {
                console.log(`▶️ Executing plan with ${plan.length} steps.`);
                const executionResult = await executePlan(plan, englishQuery, chat_history);
                logAgentActivity('orchestrator_v2', 'plan_executed', { executionResult });
                return executionResult;
            } else {
                // Fallback to General Agent if planner fails or returns no plan
                console.warn(`⚠️ Planner did not return a valid plan. Falling back to General Agent.`);
                logAgentActivity('orchestrator_v2', 'planner_failed_fallback', { userInput: englishQuery });
                const messages = [...(chat_history || []), new HumanMessage(englishQuery)];
                const generalResult = await runGeneralAgent(messages, threadId);
                return {
                    response: generalResult.finalResponse,
                    technical_details: "Fallback to General Agent as no valid plan was generated."
                };
            }
        });

        logAgentActivity('orchestrator_v2', 'completed', { finalResponse });
        
        // 4. Format and return the final output
        return {
            messages: [...(chat_history || []), new HumanMessage(userInput), new AIMessage(finalResponse)],
            userQuery: userInput,
            response: englishProcessing.response, // For test assertions
            finalResponse: finalResponse, // For chat history
            technical_details: englishProcessing.technical_details,
            threadId: threadId,
            selectedAgent: 'planner_executor_flow'
        };

    } catch (error) {
        console.error('❌ Orchestrator v2 Error:', error);
        logAgentActivity('orchestrator_v2', 'error', { error: error.message });
        return {
            messages: [...(chat_history || []), new HumanMessage(userInput)],
            error: error.message,
            finalResponse: `I'm sorry, an error occurred during orchestration: ${error.message}`
        };
    }
}

module.exports = { 
  runOrchestration, // Export the main planner-based orchestrator function
};
