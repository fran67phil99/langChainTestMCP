// Orchestrator Agent - Streamlined multilingual routing coordinator
const { HumanMessage, AIMessage } = require('@langchain/core/messages');
const { runPlannerAgent } = require('./plannerAgent');
const { runSynthesizerAgent } = require('./synthesizerAgent'); // Import the synthesizer
const { processWithLanguageSupport } = require('./languageAgent');
const { runDataExplorerAgent } = require('./dataExplorerAgent');
const { runMcpAgent } = require('./mcpAgent');
const { runGeneralAgent } = require('./generalAgent');
const { initializeLangSmith, logAgentActivity } = require('../utils/langsmithConfig');
const { getAllMcpTools } = require('../utils/mcpUtils.commonjs'); // Import existing MCP tools function

// Initialize LangSmith tracing
initializeLangSmith();

// New function to execute a plan from the PlannerAgent
async function executePlan(plan, initialUserInput, chat_history, threadId, availableTools = []) {
    console.log('🚀 Executing plan:', JSON.stringify(plan, null, 2));
    const executionContext = {}; // Stores results from each step

    for (const step of plan) {
        console.log(`▶️ Executing Step ${step.step}: ${step.query}`);

        // The current planner format uses: step, agent, query
        // Map agent names to function calls
        let stepResult;
        switch (step.agent) {
            case 'DataExplorerAgent':
                // DataExplorerAgent expects: (messages, availableTools, userQuery, threadId)  
                const dataMessages = [...(chat_history || []), new HumanMessage(step.query)];
                stepResult = await runDataExplorerAgent(dataMessages, availableTools, step.query, threadId);
                break;
            case 'GeneralAgent':
                // GeneralAgent expects an array of messages, not a string
                const messages = [...(chat_history || []), new HumanMessage(step.query)];
                stepResult = await runGeneralAgent(messages, threadId);
                break;
            case 'McpAgent':
                stepResult = await runMcpAgent(step.query, chat_history);
                break;
            default:
                console.log(`⚠️ Unknown agent: ${step.agent}, falling back to GeneralAgent`);
                const fallbackMessages = [...(chat_history || []), new HumanMessage(step.query)];
                stepResult = await runGeneralAgent(fallbackMessages, threadId);
                break;
        }

        // Store the result with step number as key
        const stepKey = `step_${step.step}`;
        // Try different response field names depending on the agent type
        const resultData = stepResult.finalResponse || stepResult.formattedResponse || stepResult.response || stepResult;
        executionContext[stepKey] = resultData;
        console.log(`✅ Step ${step.step} result stored in '${stepKey}'.`);
    }

    // Phase 3: Call the Synthesizer Agent to craft the final response
    console.log('✨ Plan execution complete. Calling Synthesizer Agent...');
    // The new synthesizer expects (userRequest, technicalResult, language).
    // We pass the english query as userRequest and 'en' as language.
    // The response will be in English, and processWithLanguageSupport will translate it back.
    const finalSynthesizedResponse = await runSynthesizerAgent(initialUserInput, executionContext, 'en');

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
        // 1. Handle multilingual input. The result of the inner function (planner or fallback) 
        // will be in processingResult.englishProcessing.response and the translated final response in processingResult.finalResponse.
        const processingResult = await processWithLanguageSupport(userInput, async (englishQuery) => {
              // 2. Generate a plan using the Planner Agent
            console.log(`🧠 Calling Planner Agent for query: \"${englishQuery}\"`);
            
            // Get available MCP tools for the planner
            const availableTools = await getAllMcpTools();
            console.log(`🔍 Retrieved ${availableTools.length} tools for planning`);
            
            let plan = await runPlannerAgent({
                user_request: englishQuery,
                available_tools: availableTools,
                chat_history: chat_history
            });
              // Ensure the plan is a JSON object
            if (typeof plan === 'string') {
                try {
                    // Remove markdown code blocks if present
                    let cleanPlan = plan.trim();
                    if (cleanPlan.startsWith('```json')) {
                        cleanPlan = cleanPlan.replace(/```json\s*/, '').replace(/```\s*$/, '');
                    } else if (cleanPlan.startsWith('```')) {
                        cleanPlan = cleanPlan.replace(/```\s*/, '').replace(/```\s*$/, '');
                    }
                    plan = JSON.parse(cleanPlan);
                } catch (e) {
                    console.error("Error parsing planner output:", e);
                    console.error("Raw planner output:", plan);
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
                const executionResult = await executePlan(plan, englishQuery, chat_history, threadId, availableTools);
                logAgentActivity('orchestrator_v2', 'plan_executed', { executionResult });
                return executionResult;
            } else {
                // Fallback to General Agent if planner fails or returns no plan
                console.warn(`⚠️ Planner did not return a valid plan. Falling back to General Agent.`);
                logAgentActivity('orchestrator_v2', 'planner_failed_fallback', { userInput: englishQuery });
                const messages = [...(chat_history || []), new HumanMessage(englishQuery)];
                const generalResult = await runGeneralAgent(messages, threadId);

                // Defensive check for the result from generalAgent
                const responseText = generalResult && (generalResult.finalResponse || generalResult.response) 
                                     ? (generalResult.finalResponse || generalResult.response) 
                                     : "I am unable to provide a response at this time.";

                return {
                    response: responseText,
                    technical_details: "Fallback to General Agent as no valid plan was generated."
                };
            }
        });        const finalResponse = processingResult.finalResponse;
        const englishProcessing = processingResult.englishProcessing;

        logAgentActivity('orchestrator_v2', 'completed', { finalResponse });
        
        // Defensive check to prevent creating an AIMessage with an undefined value
        const aiMessageContent = finalResponse || englishProcessing?.response || "I apologize, but I couldn't generate a valid response.";

        // 4. Format and return the final output
        return {
            messages: [...(chat_history || []), new HumanMessage(userInput), new AIMessage(aiMessageContent)],
            userQuery: userInput,
            response: englishProcessing.response, // For test assertions
            finalResponse: aiMessageContent, // For chat history
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
