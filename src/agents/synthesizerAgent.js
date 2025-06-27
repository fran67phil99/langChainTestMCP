const { ChatOpenAI } = require('@langchain/openai');
const { HumanMessage } = require('@langchain/core/messages');
const { logAgentActivity } = require('../utils/langsmithConfig');

console.log('Synthesizer Agent: Loading...');

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

        **CRITICAL FORMATTING REQUIREMENTS:**
        You MUST follow this exact structure for your response:

        1. **Brief Overview/Introduction** - Start with a clear, emoji-enhanced summary paragraph
        2. **Main Content Sections** - Use clear ## headings to organize information
        3. **Data Presentation** - Use bullet points, numbered lists, and tables for structured data
        4. **Key Statistics/Highlights** - Emphasize important numbers and insights
        5. **Summary/Conclusion** - End with actionable insights or next steps

        **SPECIFIC FORMATTING RULES:**
        - Always use descriptive headings like "## Universal Titles Overview" or "## Latest Issues and Sales Dates"
        - Present lists as clean bullet points with consistent formatting
        - Use **bold** for important numbers, dates, and key information
        - Include relevant emojis (📊, ✅, 📋, etc.) but don't overuse them
        - Group related information logically under clear sections
        - Use "Issue X for..." format for version/issue information
        - Always include total counts and summary statistics
        - End with a professional summary paragraph

        **Example Structure:**
        📊 **[Topic] Overview**
        A total of X [items] are currently [status], showcasing [key characteristics]. The [items] include:
        
        • Item 1 - Description
        • Item 2 - Description
        [etc.]

        ## [Section Title]
        The [data type] for these [items] vary, with the most recent being [specific detail]. Other notable [details] include:
        
        • **Issue X** for [Item] (Latest [Data]: [Date])
        • **Issue Y** for [Item] (Latest [Data]: [Date])
        [etc.]

        ## Summary of [Key Metric]
        The [summary information] with [key insights]. In summary, [conclusion with business value].

        **Your Task:**
        1. Carefully analyze the user's original question
        2. Review the data in the "Execution Context" 
        3. Understand how the "Executed Plan" led to the collected data
        4. Synthesize a comprehensive answer following the EXACT formatting structure above
        5. **DO NOT** mention the plan, steps, or variable names - the user should feel like they're talking to a single intelligent assistant
        6. Use the same language as the original question
        7. Ensure the response is scannable with clear visual hierarchy

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
