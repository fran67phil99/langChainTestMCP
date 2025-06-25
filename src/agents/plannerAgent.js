const { createTrackedLLM } = require('../utils/langsmithConfig');

// Initialize a dedicated LLM for the Planner Agent to ensure isolation and specific tuning if needed.
const llm = createTrackedLLM({
  modelName: "gpt-4o", // Using a powerful model for planning
  temperature: 0.0, // Low temperature for deterministic and structured output (JSON)
});

const prompt_template = `
# MISSION: Decompose a user's complex question into a step-by-step execution plan in JSON format.

# CONTEXT
You are a master planner agent. Your role is to analyze a user's request and a list of available tools to generate a clear, machine-readable JSON plan.
You do not execute the plan. You only create it.

# INPUTS
1.  **User Request:** The original question from the user.
    ---
    {user_request}
    ---
2.  **Available Tools:** A JSON array of tools you can use in your plan. Each tool has a 'name' and a 'description'.
    ---
    {available_tools}
    ---

# RULES
1.  **Analyze the Request:** First, understand what the user is asking. Is it a simple question solvable in one step, or a complex one requiring multiple steps?
2.  **Select the Right Tools:** For each step, choose the most appropriate tool from the 'Available Tools' list based on its description.
3.  **Handle Dependencies:** If a step needs information from a previous step, define it in the 'dependencies' array. Use the 'output_variable' from the previous step as an input for the current step's prompt (e.g., {variable_name}).
4.  **Generate JSON Output:** Your final output MUST be a valid JSON array of plan steps. Do not add any other text, explanation, or markdown formatting.
5.  **Simple Questions:** If the request can be answered in a single step, the plan should contain only one object.
6.  **Complex Questions:** Break down the request into logical, sequential steps.

# OUTPUT FORMAT (JSON)
Your output must be a JSON array following this structure:
[
  {
    "step_id": 1,
    "tool_to_use": "tool_name_from_list",
    "prompt": "The specific instruction for this step. Use {variable_name} for dependencies.",
    "dependencies": [],
    "output_variable": "variable_name_for_the_result"
  },
  {
    "step_id": 2,
    "tool_to_use": "another_tool_name",
    "prompt": "Instruction for step 2 that uses the result from step 1, like 'Find details for {variable_name_for_the_result}'.",
    "dependencies": [1],
    "output_variable": "another_result_variable"
  }
]

# TASK
Generate the JSON execution plan for the provided user request and available tools.
`;

/**
 * Generates an execution plan based on user input and available tools.
 * @param {{user_request: string, available_tools: string}} inputs - The user's request and the JSON string of available tools.
 * @returns {Promise<any>} The raw response from the language model, expected to be a JSON string.
 */
async function runPlannerAgent(inputs) {
    console.log('🧠 Planner Agent: Generating plan...');
    const { user_request, available_tools } = inputs;

    const formatted_prompt = prompt_template
        .replace('{user_request}', user_request)
        .replace('{available_tools}', available_tools);

    const response = await llm.invoke(formatted_prompt);
    
    // In a real scenario, you might add more robust error handling and parsing here
    return response.content;
}

module.exports = { runPlannerAgent };
