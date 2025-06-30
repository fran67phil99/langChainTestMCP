// Test dinamico del nuovo Planner Agent con tool MCP
const { runPlannerAgent } = require('../src/agents/plannerAgent');
const { getAllMcpTools } = require('../src/utils/mcpUtils.commonjs');

async function testDynamicPlanner() {
    console.log('🧪 Testing Dynamic Planner Agent with MCP Tools...\n');

    try {
        // Get available MCP tools
        const availableTools = await getAllMcpTools();
        console.log(`🔍 Found ${availableTools.length} MCP tools:`);
        availableTools.forEach(tool => {
            console.log(`  - ${tool.name}: ${tool.description || 'No description'}`);
        });
        console.log('');

        // Test cases
        const testCases = [
            {
                name: "Employee Query (should use MCP tools)",
                query: "chi lavora in mauden?",
                expectedStrategy: "mcp_tools"
            },
            {
                name: "Company Data Query (should use MCP tools)",
                query: "show me company employees",
                expectedStrategy: "mcp_tools"
            },
            {
                name: "Database Query (should use internal agents)",
                query: "show me universal comic titles from database",
                expectedStrategy: "internal_agents"
            },
            {
                name: "General Conversation (should use internal agents)",
                query: "hello, how are you?",
                expectedStrategy: "internal_agents"
            },
            {
                name: "Mixed Query (might use hybrid)",
                query: "hi! can you show me mauden employees?",
                expectedStrategy: "hybrid"
            }
        ];

        for (const testCase of testCases) {
            console.log(`\n📋 Testing: ${testCase.name}`);
            console.log(`Query: "${testCase.query}"`);
            console.log(`Expected Strategy: ${testCase.expectedStrategy}`);

            try {
                const plan = await runPlannerAgent({
                    user_request: testCase.query,
                    available_tools: availableTools,
                    chat_history: []
                });

                console.log(`Generated Plan:`, JSON.stringify(plan, null, 2));

                // Check if strategy matches expectation
                if (plan.strategy === testCase.expectedStrategy) {
                    console.log(`✅ PASS: Strategy matches expected (${plan.strategy})`);
                } else {
                    console.log(`⚠️  UNEXPECTED: Expected ${testCase.expectedStrategy}, got ${plan.strategy}`);
                }

                // Validate plan structure
                if (plan.strategy === 'mcp_tools' && plan.tools) {
                    console.log(`🔧 MCP Tools planned: ${plan.tools.map(t => t.tool).join(', ')}`);
                } else if (plan.strategy === 'internal_agents' && plan.steps) {
                    console.log(`🤖 Internal Agents planned: ${plan.steps.map(s => s.agent).join(', ')}`);
                } else if (plan.strategy === 'hybrid' && plan.plan) {
                    console.log(`🔄 Hybrid plan with ${plan.plan.length} steps`);
                }

            } catch (error) {
                console.log(`❌ ERROR: ${error.message}`);
            }

            console.log('─'.repeat(50));
        }

        console.log('\n🎯 Test Summary:');
        console.log('- The planner should now be context-aware');
        console.log('- It should prefer MCP tools for company/employee data');
        console.log('- It should use internal agents for database/general queries');
        console.log('- It should be able to create hybrid plans when needed');

    } catch (error) {
        console.error('💥 Test failed:', error);
        process.exit(1);
    }
}

testDynamicPlanner();
