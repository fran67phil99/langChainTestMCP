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

    // Generate dynamic prompt based on the type of query and available data
    const dataTypes = Object.keys(executionContext);
    const hasComplexData = dataTypes.some(key => 
        typeof executionContext[key] === 'object' && executionContext[key] !== null
    );
    
    const prompt = `
        You are an expert AI assistant providing a comprehensive answer to the user's question based on collected data and analysis.

        **User's Original Question:**
        "${originalQuery}"

        **Available Data:**
        ${JSON.stringify(executionContext, null, 2)}

        **RESPONSE GUIDELINES:**
        1. **Be Natural and Conversational**: Write as if you're having a natural conversation with the user
        2. **Adapt to Content**: Let the nature of the data and question determine your response structure
        3. **Use Clear Organization**: When appropriate, use headings (##) and bullet points for readability
        4. **Focus on Value**: Highlight the most important and relevant information first
        5. **Be Comprehensive but Concise**: Cover all important aspects without being verbose
        6. **Use the Same Language**: Respond in the same language as the user's question

        **FORMATTING PRINCIPLES:**
        - Start with a direct answer or key insight
        - Use **bold** for important information (numbers, dates, key terms)
        - Add relevant emojis sparingly for visual appeal (📊, ✅, �, etc.)
        - Create logical sections only when they add clarity
        - Include specific details and examples when available
        - End with a practical summary or next steps if relevant

        **IMPORTANT RULES:**
        - DO NOT mention "execution context", "plan", "steps", or "variables" 
        - DO NOT follow a rigid template - adapt to the content naturally
        - DO NOT force sections if the response flows better as paragraphs
        - Make the user feel like they're talking to one intelligent assistant
        - Be helpful, accurate, and engaging

        Please provide a natural, well-structured response that directly answers the user's question:
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
