const { createTrackedLLM } = require('../utils/langsmithConfig');

// Initialize a dedicated LLM for the Planner Agent to ensure isolation and specific tuning if needed.
const llm = createTrackedLLM({
  modelName: "gpt-4.1-2025-04-14", // Using a powerful model for planning
  temperature: 0.0, // Low temperature for deterministic and structured output (JSON)
});

const plannerPromptTemplate = `
You are an advanced A2A (Agent-to-Agent) orchestration planner. Your role is to create intelligent, collaborative execution plans that leverage the full potential of agent communication and dynamic discovery.

**CORE REVOLUTION: ELIMINATE RIGID LOGIC!**
- **NO MORE DECISION TREES**: Don't follow "if data query → check MCP → yes/no" patterns
- **EMBRACE COLLABORATION**: Agents can discover, share, and build on each other's findings
- **DYNAMIC WORKFLOWS**: Let agents adapt and refine plans based on real-time discoveries
- **MULTI-STEP INTELLIGENCE**: Complex queries need orchestrated agent collaboration, not single choices

**A2A COLLABORATION CAPABILITIES:**

**🔧 McpAgent**: 
- Discovers and executes ANY MCP tools (SQL, APIs, weather, company data, etc.)
- **A2A Power**: Can share discovered data with other agents for deeper analysis
- **Collaboration Examples**: "Find data via MCP tools, then let DataExplorerAgent analyze patterns"

**📊 DataExplorerAgent**: 
- SQL database queries, data analysis, pattern recognition
- **A2A Power**: Can receive data from McpAgent and perform advanced analytics
- **Collaboration Examples**: "Analyze data from McpAgent", "Cross-reference MCP data with database"

**🗃️ SQLSchemaAgent**:
- Database schema discovery, table relationships
- **A2A Power**: Can provide schema context to other agents for better queries
- **Collaboration Examples**: "Discover schema, share with DataExplorerAgent for optimized queries"

**💬 GeneralAgent**: 
- Conversations, explanations, synthesis of complex results
- **A2A Power**: Can process and explain results from any combination of agents
- **Collaboration Examples**: "Take findings from multiple agents and create clear explanations"

**🌐 LanguageAgent**: 
- Translations, multilingual processing
- **A2A Power**: Can translate content from any agent's output
- **Collaboration Examples**: "Translate DataExplorerAgent results to multiple languages"

**REVOLUTIONARY PLANNING APPROACHES:**

🚀 **Collaborative Discovery Workflow** - Let agents discover together and build on findings:
\`{"strategy": "collaborative_discovery", "workflow": [
  {"step": 1, "agent": "McpAgent", "task": "discover available tools and initial data", "a2a_share": "findings_context"},
  {"step": 2, "agent": "DataExplorerAgent", "task": "analyze data patterns from McpAgent discoveries", "a2a_receive": "findings_context"},
  {"step": 3, "agent": "GeneralAgent", "task": "synthesize insights from both agents", "a2a_receive": "all_findings"}
]}\`

🚀 **Parallel Investigation Strategy** - Multiple agents explore different aspects simultaneously:
\`{"strategy": "parallel_investigation", "parallel_workflows": [
  {"agent": "McpAgent", "task": "explore external tool capabilities", "context": "external_discovery"},
  {"agent": "DataExplorerAgent", "task": "explore internal database capabilities", "context": "internal_discovery"}
], "sync_step": {"agent": "GeneralAgent", "task": "combine all discoveries and create unified response"}}\`

🚀 **Adaptive Chain Strategy** - Agents adapt based on previous agent results:
\`{"strategy": "adaptive_chain", "chain": [
  {"step": 1, "agent": "McpAgent", "task": "initial discovery and data gathering"},
  {"step": 2, "adaptive_decision": "if McpAgent finds data → DataExplorerAgent analyzes; if no data → SQLSchemaAgent explores schema"},
  {"step": 3, "agent": "GeneralAgent", "task": "process results from whichever path was taken"}
]}\`

**EXAMPLES OF TRULY COLLABORATIVE PLANNING:**

*Revolutionary Example 1: No More "MCP vs Database" Binary Choice*
- Query: "mostrami i dati di vendita"
- OLD WAY: "check MCP tools → if sales tool exists use McpAgent else use DataExplorerAgent"
- NEW WAY: "Let agents collaborate to find the best data sources"
- Output: \`{"strategy": "collaborative_discovery", "workflow": [
  {"step": 1, "agent": "McpAgent", "task": "discover any sales-related MCP tools and gather available data", "a2a_share": "sales_discovery"},
  {"step": 2, "agent": "DataExplorerAgent", "task": "explore internal database for additional sales data not covered by MCP tools", "a2a_receive": "sales_discovery"},
  {"step": 3, "agent": "GeneralAgent", "task": "combine MCP and database findings into comprehensive sales report", "a2a_receive": "all_sales_data"}
]}\`

*Revolutionary Example 2: Complex Multi-Step Collaboration*
- Query: "analizza i trend dei progetti 2024 e spiegami cosa significano"
- NEW WAY: Orchestrated collaboration with real-time adaptation
- Output: \`{"strategy": "adaptive_chain", "chain": [
  {"step": 1, "agent": "McpAgent", "task": "discover project data sources and gather 2024 project information"},
  {"step": 2, "agent": "DataExplorerAgent", "task": "perform trend analysis on project data from step 1", "a2a_receive": "project_data", "a2a_share": "trend_analysis"},
  {"step": 3, "agent": "GeneralAgent", "task": "interpret trend analysis and create clear explanations of what trends mean for business", "a2a_receive": "trend_analysis"}
]}\`

*Revolutionary Example 3: Ambiguous Query with Dynamic Discovery*
- Query: "informazioni su Universal"
- NEW WAY: Let multiple agents discover what "Universal" means in this context
- Output: \`{"strategy": "parallel_investigation", "parallel_workflows": [
  {"agent": "McpAgent", "task": "search all available MCP tools for any Universal-related data", "context": "universal_external"},
  {"agent": "DataExplorerAgent", "task": "explore database for any Universal entities, companies, or references", "context": "universal_internal"},
  {"agent": "SQLSchemaAgent", "task": "discover database schema to understand what Universal data structures exist", "context": "universal_schema"}
], "sync_step": {"agent": "GeneralAgent", "task": "analyze all Universal discoveries and present most relevant information"}}\`

**FOR SIMPLE QUERIES: USE SIMPLE PLANS (BUT CONSIDER COLLABORATION POTENTIAL)**

*Simple but Collaboration-Ready Example:*
- Query: "hello"
- Output: \`{"strategy": "simple", "steps": [{"step": 1, "agent": "GeneralAgent", "query": "hello"}]}\`

*Simple Data Query with Collaboration Potential:*
- Query: "list employees"
- Output: \`{"strategy": "collaborative_discovery", "workflow": [
  {"step": 1, "agent": "McpAgent", "task": "find employee data from any available MCP tools", "a2a_share": "employee_data"},
  {"step": 2, "agent": "DataExplorerAgent", "task": "if MCP data is incomplete, supplement with database employee information", "a2a_receive": "employee_data", "conditional": true}
]}\`

**CURRENT REQUEST:**

User Query: "{userInput}"
Available MCP Tools: {availableTools}

**YOUR REVOLUTIONARY TASK:** 
Design an intelligent, collaborative execution plan that breaks away from rigid logic. Think about:
1. How can agents discover and share information?
2. What collaboration patterns would yield the best results?
3. How can agents adapt and build on each other's findings?
4. What multi-step workflows would solve this query comprehensively?

**OUTPUT FORMAT:**
- For simple queries: \`{"strategy": "simple", "steps": [...]}\`
- For collaborative workflows: \`{"strategy": "collaborative_discovery", "workflow": [...]}\`
- For parallel investigation: \`{"strategy": "parallel_investigation", "parallel_workflows": [...], "sync_step": {...}}\`
- For adaptive chains: \`{"strategy": "adaptive_chain", "chain": [...]}\`

Output ONLY valid JSON (no extra text):`;

/**
 * Generates a revolutionary collaborative execution plan based on user input and available tools.
 * @param {{user_request: string, available_tools: Array, chat_history: Array}} inputs - The user's request, available tools, and conversation history.
 * @returns {Promise<any>} The execution plan with strategy and details.
 */
async function runPlannerAgent(inputs) {
    console.log('🧠 Revolutionary Planner Agent: Designing collaborative workflow...');
    const { user_request, available_tools, chat_history } = inputs;

    // Format available tools for the prompt with more detail
    const toolsDescription = available_tools && available_tools.length > 0 
        ? available_tools.map(tool => {
            const name = tool.name || 'Unknown Tool';
            const description = tool.description || 'No description available';
            const schema = tool.schema || tool.input_schema;
            const params = schema?.properties ? Object.keys(schema.properties).join(', ') : 'no parameters';
            
            // Verifica se la descrizione sembra essere hardcoded
            if (description.includes('[Mauden') || description.includes('Mauden MCP Server')) {
                console.warn(`⚠️ Tool ${name} has hardcoded description: ${description}`);
            }
            
            return `- ${name}: ${description} (params: ${params})`;
          }).join('\n')
        : 'No MCP tools available - perfect opportunity for internal agent collaboration!';

    const formatted_prompt = plannerPromptTemplate
        .replace('{userInput}', user_request)
        .replace('{availableTools}', toolsDescription);

    console.log('🧠 Revolutionary Planner Agent: Available MCP Tools:');
    console.log(toolsDescription);
    
    // Verifica qualità delle descrizioni
    const hardcodedTools = available_tools?.filter(tool => 
        tool.description?.includes('[Mauden') || 
        tool.description?.includes('Mauden MCP Server')
    ) || [];
    
    if (hardcodedTools.length > 0) {
        console.warn(`⚠️ ${hardcodedTools.length} tools have hardcoded descriptions - they should come from MCP servers!`);
    }
    console.log('🧠 Revolutionary Planner Agent: Designing collaborative plan for:', user_request);

    const response = await llm.invoke(formatted_prompt);
    
    try {
        // Parse the JSON response
        const plan = JSON.parse(response.content);
        
        console.log('🧠 Revolutionary Planner Agent: Plan created!');
        console.log('📋 Strategy:', plan.strategy);
        
        // Enhanced logging for different strategy types
        if (plan.strategy === 'collaborative_discovery' && plan.workflow) {
            console.log('🤝 Collaborative Workflow Steps:');
            plan.workflow.forEach((step, index) => {
                console.log(`   Step ${step.step}: ${step.agent} - ${step.task}`);
                if (step.a2a_share) console.log(`      → Shares: ${step.a2a_share}`);
                if (step.a2a_receive) console.log(`      ← Receives: ${step.a2a_receive}`);
            });
        } else if (plan.strategy === 'parallel_investigation') {
            console.log('⚡ Parallel Investigation:');
            plan.parallel_workflows?.forEach((workflow, index) => {
                console.log(`   Parallel ${index + 1}: ${workflow.agent} - ${workflow.task}`);
            });
            if (plan.sync_step) {
                console.log(`   Sync: ${plan.sync_step.agent} - ${plan.sync_step.task}`);
            }
        } else if (plan.strategy === 'adaptive_chain' && plan.chain) {
            console.log('🔄 Adaptive Chain:');
            plan.chain.forEach((step, index) => {
                if (step.step) {
                    console.log(`   Step ${step.step}: ${step.agent} - ${step.task}`);
                } else if (step.adaptive_decision) {
                    console.log(`   Adaptive Decision: ${step.adaptive_decision}`);
                }
            });
        } else if (plan.steps) {
            console.log('📝 Execution Steps:');
            plan.steps.forEach((step, index) => {
                console.log(`   Step ${step.step}: ${step.agent} - ${step.query || step.task}`);
            });
        }

        return plan;
    } catch (error) {
        console.error('🧠 Revolutionary Planner Agent: Error parsing plan response:', error);
        console.error('🧠 Raw response was:', response.content);
        
        // Fallback: Try to extract JSON if it's wrapped in markdown
        try {
            const planContent = response.content.trim();
            let jsonString = planContent;
            const jsonMatch = planContent.match(/```json\s*([\s\S]*?)\s*```/) || planContent.match(/```\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                jsonString = jsonMatch[1];
                const fallbackPlan = JSON.parse(jsonString);
                console.log('🧠 Revolutionary Planner Agent: Recovered plan from markdown');
                return fallbackPlan;
            }
        } catch (fallbackError) {
            console.error('🧠 Revolutionary Planner Agent: Fallback parsing also failed:', fallbackError);
        }
        
        // Final fallback: Intelligent collaborative strategy
        console.log('🧠 Revolutionary Planner Agent: Using intelligent fallback plan');
        return {
            strategy: "collaborative_discovery",
            workflow: [
                {
                    step: 1,
                    agent: "McpAgent",
                    task: `Discover available tools and gather initial data for: ${user_request}`,
                    a2a_share: "initial_findings"
                },
                {
                    step: 2,
                    agent: "DataExplorerAgent", 
                    task: "Explore internal database for additional relevant information",
                    a2a_receive: "initial_findings",
                    conditional: true
                },
                {
                    step: 3,
                    agent: "GeneralAgent",
                    task: "Synthesize all findings and provide comprehensive response",
                    a2a_receive: "all_findings"
                }
            ]
        };
    }
}

module.exports = { runPlannerAgent };
