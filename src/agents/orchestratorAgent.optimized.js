// Orchestrator Agent - Streamlined multilingual routing coordinator
const { HumanMessage, AIMessage } = require('@langchain/core/messages');
const { runPlannerAgent } = require('./plannerAgent');
const { runSynthesizerAgent } = require('./synthesizerAgent'); // Import the synthesizer
const { processWithLanguageSupport } = require('./languageAgent');
const { runDataExplorerAgent } = require('./dataExplorerAgent');
const { runMcpAgent, selectMcpTool } = require('./mcpAgent');
const { runGeneralAgent, runGeneralAgentWithContext } = require('./generalAgent');
const { runSqlSchemaAgent } = require('./sqlSchemaAgent');
const { initializeLangSmith, logAgentActivity } = require('../utils/langsmithConfig');
const { getAllMcpTools } = require('../utils/mcpUtils.commonjs'); // Import existing MCP tools function

// Initialize LangSmith tracing
initializeLangSmith();

// New function to execute a plan from the PlannerAgent
async function executePlan(plan, initialUserInput, chat_history, threadId, availableTools = []) {
    console.log('🚀 Executing plan:', JSON.stringify(plan, null, 2));
    const executionContext = {};

    // Handle different strategies from the revolutionary collaborative planner
    switch (plan.strategy) {
        case 'collaborative_discovery':
            console.log('🤝 Executing Collaborative Discovery Strategy');
            return await executeCollaborativeDiscoveryStrategy(plan.workflow, initialUserInput, chat_history, threadId, availableTools);
            
        case 'parallel_investigation':
            console.log('⚡ Executing Parallel Investigation Strategy');
            return await executeParallelInvestigationStrategy(plan.parallel_workflows, plan.sync_step, initialUserInput, chat_history, threadId, availableTools);
            
        case 'adaptive_chain':
            console.log('🔄 Executing Adaptive Chain Strategy');
            return await executeAdaptiveChainStrategy(plan.chain, initialUserInput, chat_history, threadId, availableTools);
            
        case 'simple':
            console.log('📝 Executing Simple Strategy');
            return await executeSimpleStrategy(plan.steps, initialUserInput, chat_history, threadId, availableTools);
            
        case 'internal_agents':
            console.log('🤖 Executing Internal Agents Strategy (Legacy)');
            return await executeInternalAgentsStrategy(plan.steps, initialUserInput, chat_history, threadId, availableTools);
            
        case 'hybrid':
            console.log('🔄 Executing Hybrid Strategy (Legacy)');
            return await executeHybridStrategy(plan.plan, initialUserInput, chat_history, threadId, availableTools);
            
        default:
            // Fallback: treat as old format (array of steps)
            console.log('📋 Executing Legacy Format (array of steps)');
            if (Array.isArray(plan)) {
                return await executeInternalAgentsStrategy(plan, initialUserInput, chat_history, threadId, availableTools);
            }
            
            // Ultimate fallback
            console.warn('⚠️ Unknown plan format, falling back to General Agent');
            const fallbackMessages = [...(chat_history || []), new HumanMessage(initialUserInput)];
            const result = await runGeneralAgent(fallbackMessages, threadId);
            return {
                response: result.finalResponse || result.response || "I'm unable to process this request.",
                technical_details: "Fallback due to unknown plan format"
            };
    }
}

async function executeInternalAgentsStrategy(steps, initialUserInput, chat_history, threadId, availableTools) {
    console.log('🤖 Executing Internal Agents Strategy');
    const executionContext = {};

    for (const step of steps) {
        console.log(`▶️ Executing Step ${step.step}: ${step.query}`);

        let stepResult;
        switch (step.agent) {
            case 'DataExplorerAgent':
                const dataMessages = [...(chat_history || []), new HumanMessage(step.query)];
                stepResult = await runDataExplorerAgent(dataMessages, availableTools, step.query, threadId);
                break;
            case 'GeneralAgent':
                const messages = [...(chat_history || []), new HumanMessage(step.query)];
                stepResult = await runGeneralAgent(messages, threadId);
                break;
            case 'McpAgent':
                stepResult = await executeMcpTool(step.query, null, availableTools, chat_history, threadId);
                break;
            case 'LanguageAgent':
                // For translation requests
                const languageMessages = [...(chat_history || []), new HumanMessage(step.query)];
                stepResult = await runGeneralAgent(languageMessages, threadId); // Fallback for now
                break;
            default:
                console.log(`⚠️ Unknown agent: ${step.agent}, falling back to GeneralAgent`);
                const fallbackMessages = [...(chat_history || []), new HumanMessage(step.query)];
                stepResult = await runGeneralAgent(fallbackMessages, threadId);
                break;
        }

        const stepKey = `step_${step.step}`;
        const resultData = stepResult.finalResponse || stepResult.formattedResponse || stepResult.response || stepResult;
        executionContext[stepKey] = resultData;
        console.log(`✅ Step ${step.step} result stored in '${stepKey}'.`);
    }

    console.log('✨ Internal agents execution complete. Calling Synthesizer Agent...');
    const finalResponse = await runSynthesizerAgent(initialUserInput, executionContext, 'en');

    return {
        response: finalResponse,
        technical_details: `Execution Context: ${JSON.stringify(executionContext, null, 2)}`
    };
}

async function executeHybridStrategy(planSteps, initialUserInput, chat_history, threadId, availableTools) {
    console.log('🔄 Executing Hybrid Strategy');
    const executionContext = {};
    let stepCounter = 1;

    for (const step of planSteps) {
        console.log(`▶️ Executing Hybrid Step ${stepCounter}: ${step.type}`);

        let stepResult;
        if (step.type === 'agent') {
            console.log(`🤖 Executing agent: ${step.agent} with query: ${step.query}`);
            switch (step.agent) {
                case 'DataExplorerAgent':
                    const dataMessages = [...(chat_history || []), new HumanMessage(step.query)];
                    stepResult = await runDataExplorerAgent(dataMessages, availableTools, step.query, threadId);
                    break;
                case 'GeneralAgent':
                    const messages = [...(chat_history || []), new HumanMessage(step.query)];
                    stepResult = await runGeneralAgent(messages, threadId);
                    break;
                case 'McpAgent':
                    stepResult = await executeMcpTool(step.query, null, availableTools, chat_history, threadId);
                    break;
                case 'LanguageAgent':
                    const languageMessages = [...(chat_history || []), new HumanMessage(step.query)];
                    stepResult = await runGeneralAgent(languageMessages, threadId); // Fallback for now
                    break;
                default:
                    console.log(`⚠️ Unknown agent: ${step.agent}, falling back to GeneralAgent`);
                    const fallbackMessages = [...(chat_history || []), new HumanMessage(step.query)];
                    stepResult = await runGeneralAgent(fallbackMessages, threadId);
                    break;
            }
        } else {
            console.warn(`⚠️ Unknown step type: ${step.type}, treating as agent`);
            const fallbackMessages = [...(chat_history || []), new HumanMessage(step.query)];
            stepResult = await runGeneralAgent(fallbackMessages, threadId);
        }

        const stepKey = `hybrid_step_${stepCounter}`;
        const resultData = stepResult.finalResponse || stepResult.formattedResponse || stepResult.response || stepResult;
        executionContext[stepKey] = resultData;
        console.log(`✅ Hybrid Step ${stepCounter} result stored in '${stepKey}'.`);
        stepCounter++;
    }

    console.log('✨ Hybrid strategy execution complete. Calling Synthesizer Agent...');
    const finalResponse = await runSynthesizerAgent(initialUserInput, executionContext, 'en');

    return {
        response: finalResponse,
        technical_details: `Hybrid Execution Context: ${JSON.stringify(executionContext, null, 2)}`
    };
}

// Helper function to execute MCP tools with simplified interface
async function executeMcpTool(query, toolName, availableTools, chat_history, threadId) {
    try {
        // Find the specific tool if toolName is provided
        // Smart tool selection - can return single tool or array of tools
        let selectedTools = null;
        if (toolName) {
            selectedTools = availableTools.find(tool => tool.name === toolName);
            if (!selectedTools) {
                console.warn(`🔍 Specified MCP tool '${toolName}' not found, using auto-selection`);
            }
        }
        
        // If no specific tool or not found, use smart auto-selection
        if (!selectedTools) {
            selectedTools = await selectMcpTool(query, availableTools);
        }
        
        // Execute with MCP Agent (supports both single tool and multiple tools)
        const messages = [...(chat_history || []), new HumanMessage(query)];
        return await runMcpAgent(messages, selectedTools, query, threadId, availableTools);
    } catch (error) {
        console.error(`❌ Error executing MCP tool:`, error);
        return {
            response: `Error executing MCP tool: ${error.message}`,
            finalResponse: `Error executing MCP tool: ${error.message}`
        };
    }
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

            logAgentActivity('orchestrator_v2', 'plan_generated', { plan });

            // The new planner returns a structured object, not a string
            if (!plan || typeof plan !== 'object') {
                console.error("Invalid plan returned from planner:", plan);
                plan = null;
            }

            // If planner returns a direct answer (e.g., for simple questions)
            if (plan && plan.direct_answer) {
                 console.log(`✅ Planner provided a direct answer.`);
                 return { 
                    response: plan.direct_answer,
                    technical_details: "Response generated directly by the Planner Agent."
                };
            }

            // 3. Execute the plan with the new strategy-based approach
            if (plan && (plan.strategy || Array.isArray(plan))) {
                console.log(`▶️ Executing plan with strategy: ${plan.strategy || 'legacy_format'}.`);
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
        });        
        
        // Extract and validate final response with robust fallback
        const finalResponse = processingResult?.finalResponse;
        const englishProcessing = processingResult?.englishProcessing;

        logAgentActivity('orchestrator_v2', 'completed', { finalResponse });
        
        // Enhanced defensive check with multiple fallback levels
        let aiMessageContent;
        
        if (finalResponse && typeof finalResponse === 'string' && finalResponse.trim().length > 0) {
          // Check for problematic content in the final response (more specific patterns)
          const problematicPatterns = [
            /\bnon definito\b/i,  // Only match "non definito" as whole words
            /\bundefined\b/i,     // Only match "undefined" as whole words (not "undefinedValue")
            /\bNaN\b/i,           // Only match "NaN" as whole words
            /\bnull\s+response\b/i, // Only match "null response" patterns
            /\berror.*null\b/i,     // Only match error patterns with null
            /\bnull.*error\b/i      // Only match null error patterns
          ];
          
          const hasProblematicContent = problematicPatterns.some(pattern => pattern.test(finalResponse));
          
          if (hasProblematicContent) {
            console.log(`⚠️ Final response contains problematic content, using fallback`);
            aiMessageContent = "Mi dispiace, si è verificato un problema nella generazione della risposta. Ti prego di riprovare la tua domanda.";
          } else {
            aiMessageContent = finalResponse;
          }
        } else if (englishProcessing?.response && typeof englishProcessing.response === 'string') {
          aiMessageContent = englishProcessing.response;
        } else if (englishProcessing?.finalResponse && typeof englishProcessing.finalResponse === 'string') {
          aiMessageContent = englishProcessing.finalResponse;
        } else {
          // Last resort fallback
          aiMessageContent = "Mi dispiace, non sono riuscito a generare una risposta valida. Ti prego di riprovare.";
        }
        
        // Final validation to ensure we never return undefined/null
        if (!aiMessageContent || typeof aiMessageContent !== 'string' || aiMessageContent.trim().length === 0) {
          aiMessageContent = "Mi dispiace, si è verificato un errore tecnico. Ti prego di riprovare la tua richiesta.";
        }

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
        
        // Provide error message in Italian since this is the primary language
        const errorMessage = "Mi dispiace, si è verificato un errore durante l'elaborazione della tua richiesta. Ti prego di riprovare.";
        
        return {
            messages: [...(chat_history || []), new HumanMessage(userInput), new AIMessage(errorMessage)],
            error: error.message,
            finalResponse: errorMessage
        };
    }
}

// Revolutionary A2A Collaborative Strategy Functions

async function executeCollaborativeDiscoveryStrategy(workflow, initialUserInput, chat_history, threadId, availableTools) {
    console.log('🤝 Starting Collaborative Discovery Workflow');
    const a2aContext = {}; // Shared context for A2A communication
    let finalResult = null;

    for (const step of workflow) {
        console.log(`▶️ Step ${step.step}: ${step.agent} - ${step.task}`);
        
        // Prepare A2A context for the agent
        let stepInput = step.task;
        // NON concatenare il contesto come stringa. Viene passato come oggetto a executeAgentTask.
        // Questo previene il superamento del limite di token, specialmente per il GeneralAgent.

        let stepResult = await executeAgentTask(step.agent, stepInput, chat_history, threadId, availableTools, a2aContext);
        
        // Store result in A2A context if sharing is requested
        if (step.a2a_share) {
            // Determine if we should use summary or full data based on context
            let contextData = stepResult;
            
            // Check if this is data that will be needed by GeneralAgent for final synthesis
            const isDataCritical = step.a2a_share.includes('data') || 
                                  step.a2a_share.includes('results') ||
                                  step.a2a_share.includes('issues') ||
                                  step.a2a_share.includes('sales') ||
                                  step.a2a_share.includes('titles');
            
            if (stepResult.a2aSummary && !isDataCritical) {
                // Use summary only for non-critical data (like schema discovery)
                contextData = {
                    agent: stepResult.agent,
                    success: stepResult.success,
                    summary: stepResult.a2aSummary,
                    analysis: stepResult.analysis,
                    method: stepResult.method,
                    userQuery: stepResult.userQuery
                };
                console.log(`   📋 Using concise A2A summary (${stepResult.a2aSummary.length} chars vs ${JSON.stringify(stepResult).length} chars)`);
            } else if (stepResult.a2aSummary && isDataCritical) {
                // For critical data, preserve both summary and essential data
                contextData = {
                    agent: stepResult.agent,
                    success: stepResult.success,
                    summary: stepResult.a2aSummary,
                    data: stepResult.data,
                    response: stepResult.response,
                    formattedResponse: stepResult.formattedResponse,
                    analysis: stepResult.analysis,
                    method: stepResult.method,
                    userQuery: stepResult.userQuery
                };
                console.log(`   📋 Preserving critical data with summary (${stepResult.a2aSummary.length} chars summary + data)`);
            }
            
            a2aContext[step.a2a_share] = contextData;
            console.log(`   💾 Stored result in A2A context: ${step.a2a_share}`);
        }

        finalResult = stepResult;
    }

    return {
        response: finalResult.finalResponse || finalResult.response || finalResult,
        technical_details: "Collaborative Discovery Strategy executed",
        a2a_context: Object.keys(a2aContext)
    };
}

async function executeParallelInvestigationStrategy(parallelWorkflows, syncStep, initialUserInput, chat_history, threadId, availableTools) {
    console.log('⚡ Starting Parallel Investigation');
    
    // Execute all parallel workflows simultaneously
    const parallelPromises = parallelWorkflows.map(async (workflow) => {
        console.log(`▶️ Parallel: ${workflow.agent} - ${workflow.task}`);
        const result = await executeAgentTask(workflow.agent, workflow.task, chat_history, threadId, availableTools, {});
        return { context: workflow.context, result: result };
    });

    const parallelResults = await Promise.all(parallelPromises);
    console.log('⚡ All parallel investigations completed');

    // Combine results at sync point
    if (syncStep) {
        const combinedInput = `${syncStep.task}\n\nParallel Investigation Results:\n` + 
            parallelResults.map(pr => `${pr.context}: ${JSON.stringify(pr.result)}`).join('\n');
        
        const syncResult = await executeAgentTask(syncStep.agent, combinedInput, chat_history, threadId, availableTools, {});
        
        return {
            response: syncResult.finalResponse || syncResult.response || syncResult,
            technical_details: "Parallel Investigation Strategy executed",
            parallel_results_count: parallelResults.length
        };
    }

    // No sync step, return combined results
    const combinedResponse = parallelResults.map(pr => `${pr.context}: ${pr.result.finalResponse || pr.result.response || pr.result}`).join('\n\n');
    return {
        response: combinedResponse,
        technical_details: "Parallel Investigation Strategy executed (no sync)",
        parallel_results_count: parallelResults.length
    };
}

async function executeAdaptiveChainStrategy(chain, initialUserInput, chat_history, threadId, availableTools) {
    console.log('🔄 Starting Adaptive Chain');
    let chainContext = {};
    let finalResult = null;

    for (const chainStep of chain) {
        if (chainStep.step && chainStep.agent) {
            // Regular step
            console.log(`▶️ Chain Step ${chainStep.step}: ${chainStep.agent} - ${chainStep.task}`);
            let stepResult = await executeAgentTask(chainStep.agent, chainStep.task, chat_history, threadId, availableTools, {});
            chainContext[`step_${chainStep.step}`] = stepResult;
            finalResult = stepResult;
            
        } else if (chainStep.adaptive_decision) {
            // Adaptive decision point
            console.log(`🧠 Adaptive Decision: ${chainStep.adaptive_decision}`);
            // For now, we'll log the decision but continue with the next step
            // In a more advanced implementation, we could parse the condition and branch accordingly
        }
    }

    return {
        response: finalResult?.finalResponse || finalResult?.response || finalResult || "Adaptive chain completed",
        technical_details: "Adaptive Chain Strategy executed",
        chain_steps: Object.keys(chainContext).length
    };
}

async function executeSimpleStrategy(steps, initialUserInput, chat_history, threadId, availableTools) {
    console.log('📝 Executing Simple Strategy');
    
    if (!steps || steps.length === 0) {
        return {
            response: "No execution steps provided",
            technical_details: "Simple strategy with empty steps"
        };
    }

    // Execute the first (and likely only) step
    const step = steps[0];
    console.log(`▶️ Simple Step: ${step.agent} - ${step.query || step.task}`);
    
    const result = await executeAgentTask(step.agent, step.query || step.task, chat_history, threadId, availableTools, {});
    
    return {
        response: result.finalResponse || result.response || result,
        technical_details: "Simple Strategy executed"
    };
}

// Helper function to execute any agent task with plan execution support
async function executeAgentTask(agentName, task, chat_history, threadId, availableTools, a2aContext = {}) {
    console.log(`🎯 Executing agent: ${agentName} with task: ${task.substring(0, 100)}...`);
    
    let result = null;
    
    switch (agentName) {
        case 'McpAgent':
            result = await executeMcpTool(task, null, availableTools, chat_history, threadId);
            break;
        case 'DataExplorerAgent':
            const dataMessages = [...(chat_history || []), new HumanMessage(task)];
            // Pass A2A context to Data Explorer Agent for collaborative workflows
            result = await runDataExplorerAgent(dataMessages, availableTools, task, threadId, a2aContext);
            break;
        case 'GeneralAgent':
            const generalMessages = [...(chat_history || []), new HumanMessage(task)];
            // Pass A2A context to General Agent for collaborative workflows
            result = await runGeneralAgentWithContext(generalMessages, threadId, a2aContext);
            break;
        case 'LanguageAgent':
            const languageMessages = [...(chat_history || []), new HumanMessage(task)];
            result = await processWithLanguageSupport(languageMessages, threadId);
            break;
        case 'SQLSchemaAgent':
            // Format request for SQLSchemaAgent
            const schemaRequest = {
                action: 'discover_schema', // Default action for schema discovery
                from: 'orchestrator',
                task: task,
                chat_history: chat_history,
                a2a_context: a2aContext
            };
            result = await runSqlSchemaAgent(schemaRequest, availableTools, threadId);
            break;
        default:
            console.log(`⚠️ Unknown agent: ${agentName}, falling back to GeneralAgent`);
            const fallbackMessages = [...(chat_history || []), new HumanMessage(task)];
            result = await runGeneralAgent(fallbackMessages, threadId);
            break;
    }
    
    // 🔥 CRITICAL FIX: Handle plans that need execution
    if (result && result.needs_execution === true && result.plan) {
        console.log(`🔄 Agent ${agentName} returned a plan that needs execution. Starting plan execution loop...`);
        
        let executionLoop = 0;
        const maxExecutionLoops = 10; // Prevent infinite loops
        
        while (result.needs_execution === true && result.plan && executionLoop < maxExecutionLoops) {
            executionLoop++;
            console.log(`📋 Execution Loop ${executionLoop}: Executing ${result.plan.length} plan steps`);
            
            // Execute each step in the plan
            const planResults = [];
            for (const planStep of result.plan) {
                const toolName = planStep.tool_name || planStep.tool;
                const toolInput = planStep.parameters || planStep.input;
                const inputSummary = typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput);
                
                console.log(`  ▶️ Executing plan step: ${toolName} - ${inputSummary.substring(0, 80)}...`);
                
                // Execute the plan step using MCP Agent
                const stepResult = await executeMcpTool(toolInput, toolName, availableTools, chat_history, threadId);
                planResults.push({
                    step: planStep.step || `step_${planResults.length + 1}`,
                    tool: toolName,
                    input: toolInput,
                    tool_result: stepResult.response || stepResult.finalResponse || stepResult,
                    success: stepResult.success !== false,
                    context: planStep.context || {}
                });
                
                console.log(`  ✅ Plan step completed: ${toolName}`);
            }
            
            // Return to the original agent with the execution results
            console.log(`🔙 Returning execution results to ${agentName}`);
            
            // Call the agent again with the execution results
            switch (agentName) {
                case 'SQLSchemaAgent':
                    // Format request with execution results for SQLSchemaAgent
                    const schemaRequestWithResults = {
                        action: 'discover_schema',
                        from: 'orchestrator',
                        task: task,
                        execution_results: planResults,
                        chat_history: chat_history,
                        A2A_context: a2aContext
                    };
                    result = await runSqlSchemaAgent(schemaRequestWithResults, availableTools, threadId);
                    break;

                case 'DataExplorerAgent':
                     const dataMessages = [...(chat_history || []), new HumanMessage(task)];
                     const contextWithResults = { ...a2aContext, execution_results: planResults };
                     result = await runDataExplorerAgent(dataMessages, availableTools, task, threadId, contextWithResults);
                     break;

                default:
                    console.log(`⚠️ Agent ${agentName} not supported for plan execution callback, breaking loop.`);
                    // For unsupported agents, just break the loop by clearing the plan
                    result.needs_execution = false; 
                    break;
            }
            
            console.log(`🔍 Agent ${agentName} returned: needs_execution=${result.needs_execution}`);
            
            // If the agent has finished processing and has a final result, use it
            if (result.needs_execution === false && result.formattedResponse) {
                console.log(`✅ Agent ${agentName} completed with formatted response`);
                break;
            }
        }
        
        if (executionLoop >= maxExecutionLoops) {
            console.error(`❌ Plan execution loop exceeded max attempts (${maxExecutionLoops}) for agent ${agentName}.`);
            result.error = `Plan execution loop timed out for agent ${agentName}.`;
            result.needs_execution = false; // Stop execution
        }
        
        console.log(`✅ Plan execution completed for ${agentName} after ${executionLoop} loop(s)`);
    }
    
    return result;
}

module.exports = { 
  runOrchestration, // Export the main planner-based orchestrator function
};
