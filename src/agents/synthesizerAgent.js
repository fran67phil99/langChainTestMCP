const { ChatOpenAI } = require('@langchain/openai');
const { HumanMessage } = require('@langchain/core/messages');
const { logAgentActivity } = require('../utils/langsmithConfig');

/**
 * Runs the Synthesizer Agent to generate a final, coherent response from the results of a plan.
 * @param {string} originalQuery - The user's original query.
 * @param {object} executionContext - The context object containing the results of all plan steps.
 * @param {Array<object>} plan - The original plan that was executed.
 * @returns {Promise<string>} A single, synthesized natural language response.
 */
async function runSynthesizerAgent(originalQuery, executionContext, plan) {
    console.log('🔄 Synthesizer Agent: Starting response synthesis...');
    logAgentActivity('synthesizer', 'start', { originalQuery, executionContext });

    const llm = new ChatOpenAI({
        modelName: 'gpt-4o-mini',
        temperature: 0.1, // Low temperature for factual, consistent synthesis
    });

    const prompt = `
        You are a "Synthesizer" agent. Your job is to provide a final, comprehensive, and natural language answer to the user's original question based on the results gathered by a team of agents.

        **User's Original Question:**
        "${originalQuery}"

        **Execution Context (Data Gathered):**
        Here is the data collected by other agents in a step-by-step execution. Each key is a variable name from the plan, and its value is the data found.
        \`\`\`json
        ${JSON.stringify(executionContext, null, 2)}
        \`\`\`

        **Executed Plan:**
        This was the plan to answer the user's question:
        \`\`\`json
        ${JSON.stringify(plan, null, 2)}
        \`\`\`

        **Your Task:**
        1.  Carefully analyze the user's original question.
        2.  Review the data in the "Execution Context".
        3.  Understand how the "Executed Plan" led to the collected data.
        4.  Synthesize a single, clear, and helpful answer in the same language as the original question.
        5.  **DO NOT** just list the results. Weave them into a natural sentence.
        6.  **DO NOT** mention the plan, the steps, or the variable names (like 'reparto_top' or 'eta_media'). The user should feel like they are talking to a single, intelligent assistant.

        **Example:**
        -   **Original Question:** "What is the department with the most interns, and what is the average age of its employees?"
        -   **Execution Context:** \`{"reparto_top": "Engineering", "eta_media": "34"}\`
        -   **Correct Synthesized Answer:** "The department with the most interns is Engineering, and the average age of its employees is 34."
        -   **Incorrect Answer:** "The result for reparto_top is Engineering. The result for eta_media is 34."

        Now, provide the synthesized answer for the given question and context.

        **Final Answer:**
    `;

    try {
        const response = await llm.invoke([new HumanMessage(prompt)]);
        const synthesizedResponse = response.content.trim();
        
        console.log(`✅ Synthesizer Agent: Response generated successfully.`);
        logAgentActivity('synthesizer', 'success', { synthesizedResponse });

        return synthesizedResponse;
    } catch (error) {
        console.error('❌ Synthesizer Agent Error:', error);
        logAgentActivity('synthesizer', 'error', { error: error.message });
        // Fallback to a simple summary if synthesis fails
        return `I have completed the required tasks. The final result is: ${JSON.stringify(executionContext)}.`;
    }
}

module.exports = { runSynthesizerAgent };
