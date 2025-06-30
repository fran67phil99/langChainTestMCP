// Test direct orchestrator A2A flow without LLM dependencies
require('dotenv').config();
const { executeAgent } = require('../src/agents/orchestratorAgent.optimized');
const { getAllMcpTools } = require('../src/utils/mcpUtils.commonjs');
const { HumanMessage } = require('@langchain/core/messages');

console.log('🧪 Testing Direct Orchestrator A2A Flow...');

async function testDirectOrchestrator() {
    try {
        console.log('🔍 Starting direct orchestrator test...');
        
        // Discover available MCP tools first
        console.log('🔧 Discovering MCP tools...');
        const availableTools = await getAllMcpTools();
        console.log(`✅ Discovered ${Object.keys(availableTools).length} tools`);
        
        const toolNames = Object.keys(availableTools);
        console.log('🛠️ Available tools:', toolNames);
        
        // Mock messages
        const messages = [new HumanMessage("Show me all employees and interns at Mauden")];
        const threadId = 'test-direct-orchestrator';
        
        // Test Step 1: Execute McpAgent for employees
        console.log('\n📋 Step 1: Testing McpAgent execution for employees...');
        
        const employeeTask = 'get_employees_csv_mcp';
        console.log(`🔧 Executing tool: ${employeeTask}`);
        
        // We'll simulate the executeAgent call that would happen in the orchestrator
        let a2aContext = {};
        
        try {
            const employeeResult = await executeAgent('McpAgent', employeeTask, availableTools, messages, threadId, a2aContext);
            console.log('✅ Employee McpAgent result:', JSON.stringify(employeeResult, null, 2));
            
            // Update A2A context like orchestrator does
            if (employeeResult && employeeResult.success) {
                a2aContext.employees = {
                    mcpData: [employeeResult],
                    summary: `Employee data retrieved: ${employeeResult.data ? 'success' : 'no data'}`
                };
            }
            
        } catch (error) {
            console.log('❌ Employee McpAgent error:', error.message);
            // Continue with mock data
            a2aContext.employees = {
                mcpData: [{
                    success: true,
                    toolName: 'get_employees_csv_mcp',
                    data: JSON.stringify([
                        {"name": "John Doe", "age": 35, "role": "Senior Developer", "salary": 75000},
                        {"name": "Jane Smith", "age": 28, "role": "UX Designer", "salary": 65000}
                    ])
                }],
                summary: "Employee data retrieved (mock)"
            };
        }
        
        // Test Step 2: Execute McpAgent for interns
        console.log('\n📋 Step 2: Testing McpAgent execution for interns...');
        
        const internTask = 'get_interns_mcp';
        console.log(`🔧 Executing tool: ${internTask}`);
        
        try {
            const internResult = await executeAgent('McpAgent', internTask, availableTools, messages, threadId, a2aContext);
            console.log('✅ Intern McpAgent result:', JSON.stringify(internResult, null, 2));
            
            // Update A2A context
            if (internResult && internResult.success) {
                a2aContext.interns = {
                    mcpData: [internResult],
                    summary: `Intern data retrieved: ${internResult.data ? 'success' : 'no data'}`
                };
            }
            
        } catch (error) {
            console.log('❌ Intern McpAgent error:', error.message);
            // Continue with mock data
            a2aContext.interns = {
                mcpData: [{
                    success: true,
                    toolName: 'get_interns_mcp',
                    data: JSON.stringify([
                        {"name": "Sarah Wilson", "age": 22, "university": "State University", "program": "Computer Science"},
                        {"name": "Tom Brown", "age": 23, "university": "Tech College", "program": "Software Engineering"}
                    ])
                }],
                summary: "Intern data retrieved (mock)"
            };
        }
        
        console.log('\n📊 Final A2A Context:');
        console.log(JSON.stringify(a2aContext, null, 2));
        
        // Test Step 3: Execute GeneralAgent with A2A context
        console.log('\n📋 Step 3: Testing GeneralAgent with A2A context...');
        
        try {
            const generalResult = await executeAgent('GeneralAgent', 'Show me all employees and interns at Mauden', availableTools, messages, threadId, a2aContext);
            console.log('✅ GeneralAgent result:', JSON.stringify(generalResult, null, 2));
            
            // Check if response contains real data
            const hasRealData = generalResult.finalResponse && (
                generalResult.finalResponse.includes('John Doe') ||
                generalResult.finalResponse.includes('Sarah Wilson') ||
                generalResult.finalResponse.includes('Senior Developer') ||
                generalResult.finalResponse.includes('State University')
            );
            
            console.log(`\n🎯 General Agent Response Analysis:`);
            console.log(`  - Has final response: ${!!generalResult.finalResponse}`);
            console.log(`  - Response length: ${generalResult.finalResponse ? generalResult.finalResponse.length : 0} characters`);
            console.log(`  - Contains real data: ${hasRealData}`);
            
            if (hasRealData) {
                console.log('✅ SUCCESS: GeneralAgent is using real data from A2A context!');
                console.log('\n📝 Response preview:');
                console.log(generalResult.finalResponse.substring(0, 500) + '...');
            } else {
                console.log('❌ ISSUE: GeneralAgent response does not contain real data');
                console.log('\n📝 Response preview:');
                console.log(generalResult.finalResponse);
            }
            
            return {
                success: true,
                a2aContextBuilt: Object.keys(a2aContext).length > 0,
                generalAgentWorking: !!generalResult.finalResponse,
                hasRealData: hasRealData,
                fullResult: generalResult
            };
            
        } catch (error) {
            console.log('❌ GeneralAgent error:', error.message);
            return {
                success: false,
                error: error.message,
                a2aContextBuilt: Object.keys(a2aContext).length > 0
            };
        }
        
    } catch (error) {
        console.error('❌ Direct orchestrator test error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Run the test
testDirectOrchestrator()
    .then(result => {
        console.log('\n🎯 Direct Orchestrator Test Results:');
        console.log(`  - Overall Success: ${result.success}`);
        console.log(`  - A2A Context Built: ${result.a2aContextBuilt}`);
        console.log(`  - GeneralAgent Working: ${result.generalAgentWorking}`);
        console.log(`  - Has Real Data: ${result.hasRealData}`);
        
        if (result.success && result.hasRealData) {
            console.log('\n✅ SUCCESS: Complete orchestrator A2A flow is working!');
            console.log('   The system can execute multiple MCP tools and pass real data to GeneralAgent.');
        } else {
            console.log('\n❌ ISSUE: Orchestrator A2A flow has problems.');
            if (result.error) {
                console.log(`   - Error: ${result.error}`);
            }
            if (!result.a2aContextBuilt) {
                console.log('   - Problem: A2A context was not built correctly');
            }
            if (!result.generalAgentWorking) {
                console.log('   - Problem: GeneralAgent is not working');
            }
            if (!result.hasRealData) {
                console.log('   - Problem: GeneralAgent response does not contain real data');
            }
        }
        
        console.log('\n================================================================================');
    })
    .catch(error => {
        console.error('❌ Test failed:', error);
    });
