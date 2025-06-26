const { createTrackedLLM } = require('../utils/langsmithConfig');

// Initialize a dedicated LLM for the Planner Agent to ensure isolation and specific tuning if needed.
const llm = createTrackedLLM({
  modelName: "gpt-4o", // Using a powerful model for planning
  temperature: 0.0, // Low temperature for deterministic and structured output (JSON)
});

const plannerPromptTemplate = `
You are a master planner agent. Your role is to analyze a user's query and create a clear, step-by-step execution plan for other agents to follow. The plan must be a JSON array of "steps".

**Query Analysis & Plan Generation Rules:**

1.  **Decomposition:** Break down complex, multi-part, or ambiguous queries into a logical sequence of simple, atomic steps.
2.  **Agent Selection:** For each step, identify the most appropriate agent to handle it. Available agents are:
    *   \`DataExplorerAgent\`: For queries requiring data retrieval, SQL generation, or database interaction.
    *   \`GeneralAgent\`: For conversational questions, greetings, or topics outside the database scope.
3.  **Parameter Definition:** For each step, define the \`query\` parameter. This should be a clear, self-contained instruction for the designated agent.
4.  **Clarification:** If the user's query is ambiguous, incomplete, or requires more information (e.g., a missing date range), your FIRST and ONLY step should be to ask a clarifying question back to the user. Use the \`GeneralAgent\` for this.
    *   **Example:**
        *   User Query: "Show me sales by date."
        *   Your Plan: \`[{"step": 1, "agent": "GeneralAgent", "query": "Could you please specify the date range for the sales you're interested in?"}]\`
5.  **SQL Focus:** For \`DataExplorerAgent\` steps, the \`query\` should be a clear natural language question that can be translated into a SQL query. Do NOT generate SQL code yourself.
6.  **Output Format:** The final output MUST be a valid JSON array of step objects. Each object must contain \`step\`, \`agent\`, and \`query\`. Do not add any extra text, explanations, or markdown formatting around the JSON.

**Input:**

*   **User Query:** The user's request.
*   **Conversation History:** A summary of the previous turns in the conversation.

**Examples:**

*   **User Query:** "Qual è il titolo con le vendite più recenti?"
    *   **Plan:**
        \`\`\`json
        [
          {
            "step": 1,
            "agent": "DataExplorerAgent",
            "query": "Find the title with the most recent sales date."
          }
        ]
        \`\`\`

*   **User Query:** "Ciao, come stai? E poi, mostrami i dati degli stagisti."
    *   **Plan:**
        \`\`\`json
        [
          {
            "step": 1,
            "agent": "GeneralAgent",
            "query": "Respond to the user's greeting: 'Ciao, come stai?'"
          },
          {
            "step": 2,
            "agent": "DataExplorerAgent",
            "query": "Retrieve all data for the interns."
          }
        ]
        \`\`\`

**Generate the plan for the following request:**

**User Query:** "{userInput}"
**Available Tools:**
{availableTools}
**Conversation History:**
{chatHistory}
`;

/**
 * Generates an execution plan based on user input, available tools, and conversation history.
 * @param {{user_request: string, available_tools: Array, chat_history: Array}} inputs - The user's request, available tools, and conversation history.
 * @returns {Promise<any>} The raw response from the language model, expected to be a JSON string.
 */
async function runPlannerAgent(inputs) {
    console.log('🧠 Planner Agent: Generating plan...');
    const { user_request, available_tools, chat_history } = inputs;

    // Format available tools for the prompt
    const toolsDescription = available_tools && available_tools.length > 0 
        ? available_tools.map(tool => `- ${tool.name}: ${tool.description || 'No description'}`).join('\n')
        : 'No tools available';

    // Format chat history for the prompt  
    const historyDescription = chat_history && chat_history.length > 0
        ? chat_history.map(msg => `${msg._getType ? msg._getType() : 'unknown'}: ${msg.content}`).join('\n')
        : 'No previous conversation';

    const formatted_prompt = plannerPromptTemplate
        .replace('{userInput}', user_request)
        .replace('{availableTools}', toolsDescription)
        .replace('{chatHistory}', historyDescription);

    const response = await llm.invoke(formatted_prompt);
    
    // In a real scenario, you might add more robust error handling and parsing here
    return response.content;
}

module.exports = { runPlannerAgent };
