// Test Conversation History - Complex Scenarios
// Tests advanced conversation flows with context switching and memory retention

console.log('🧪 Starting Complex Conversation History Tests...');

const { runOrchestratorOptimized } = require('../src/agents/orchestratorAgent.optimized');

// Simulate a complex conversation with multiple context switches
async function testComplexConversationFlow() {
  console.log('\n🎭 === COMPLEX CONVERSATION SCENARIO 1: Multi-Topic Context ===');
  
  const threadId = 'complex-test-1';
  const conversationSteps = [
    {
      query: "Chi sono gli stagisti di Mauden?",
      description: "Initial company data query - should use MCP Agent",
      expectedAgent: "mcp_agent"
    },
    {
      query: "Quanti anni ha il più giovane?",
      description: "Follow-up requiring memory of previous stagisti data",
      expectedAgent: "mcp_agent",
      contextDependency: "Should remember stagisti from step 1"
    },
    {
      query: "Cos'è l'intelligenza artificiale?",
      description: "Context switch to general knowledge",
      expectedAgent: "general_agent"
    },
    {
      query: "Filippo ha esperienza in questo campo?",
      description: "Complex context merge - references Filippo from step 1 + AI from step 3",
      expectedAgent: "mcp_agent",
      contextDependency: "Should connect Filippo Barberio + AI topic"
    },
    {
      query: "Quali altri stagisti potrebbero essere interessati?",
      description: "Multi-context reference - stagisti list + AI interest",
      expectedAgent: "mcp_agent",
      contextDependency: "Should reference all stagisti + AI context"
    }
  ];

  let results = [];
  
  for (let i = 0; i < conversationSteps.length; i++) {
    const step = conversationSteps[i];
    console.log(`\n📝 Step ${i + 1}: ${step.description}`);
    console.log(`Query: "${step.query}"`);
    console.log(`Expected Agent: ${step.expectedAgent}`);
    if (step.contextDependency) {
      console.log(`Context Dependency: ${step.contextDependency}`);
    }
    console.log('-'.repeat(60));
    
    try {
      const startTime = Date.now();
      const result = await runOrchestratorOptimized(step.query, threadId);
      const endTime = Date.now();
      
      const actualAgent = result.selectedAgent;
      const agentMatch = actualAgent === step.expectedAgent;
      
      console.log(`✅ Response received in ${endTime - startTime}ms`);
      console.log(`🎯 Expected Agent: ${step.expectedAgent} | Actual: ${actualAgent} ${agentMatch ? '✅' : '❌'}`);
      console.log(`🌍 Language: ${result.originalLanguage?.languageName || 'Unknown'}`);
      console.log(`📝 Response Preview: ${result.finalResponse?.substring(0, 100)}...`);
      
      results.push({
        step: i + 1,
        query: step.query,
        expectedAgent: step.expectedAgent,
        actualAgent,
        agentMatch,
        responseTime: endTime - startTime,
        responseLength: result.finalResponse?.length || 0
      });
      
      // Wait between steps to avoid rate limiting
      if (i < conversationSteps.length - 1) {
        console.log('⏳ Waiting 2 seconds before next step...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
    } catch (error) {
      console.error(`❌ Step ${i + 1} failed:`, error.message);
      results.push({
        step: i + 1,
        query: step.query,
        error: error.message,
        agentMatch: false
      });
    }
  }
  
  return results;
}

// Test multilingual context retention
async function testMultilingualContextRetention() {
  console.log('\n🌍 === COMPLEX CONVERSATION SCENARIO 2: Multilingual Context ===');
  
  const threadId = 'multilingual-test-1';
  const multilingualSteps = [
    {
      query: "Who is Filippo Barberio?",
      language: "English",
      description: "English company query"
    },
    {
      query: "¿Cuántos años tiene?",
      language: "Spanish", 
      description: "Spanish follow-up about age (should remember Filippo)"
    },
    {
      query: "Ci sono altri stagisti della sua età?",
      language: "Italian",
      description: "Italian follow-up about other interns (should remember Filippo's age)"
    },
    {
      query: "What departments do interns work in?",
      language: "English",
      description: "English expansion on internship context"
    }
  ];

  let results = [];
  
  for (let i = 0; i < multilingualSteps.length; i++) {
    const step = multilingualSteps[i];
    console.log(`\n🌐 Step ${i + 1}: ${step.description}`);
    console.log(`Language: ${step.language}`);
    console.log(`Query: "${step.query}"`);
    console.log('-'.repeat(60));
    
    try {
      const startTime = Date.now();
      const result = await runOrchestratorOptimized(step.query, threadId);
      const endTime = Date.now();
      
      console.log(`✅ Response received in ${endTime - startTime}ms`);
      console.log(`🌍 Detected Language: ${result.originalLanguage?.languageName || 'Unknown'}`);
      console.log(`🎯 Selected Agent: ${result.selectedAgent}`);
      console.log(`📝 Response Preview: ${result.finalResponse?.substring(0, 150)}...`);
      
      results.push({
        step: i + 1,
        inputLanguage: step.language,
        detectedLanguage: result.originalLanguage?.languageName,
        selectedAgent: result.selectedAgent,
        responseTime: endTime - startTime,
        responseLength: result.finalResponse?.length || 0
      });
      
      // Wait between steps
      if (i < multilingualSteps.length - 1) {
        console.log('⏳ Waiting 2 seconds before next step...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
    } catch (error) {
      console.error(`❌ Step ${i + 1} failed:`, error.message);
      results.push({
        step: i + 1,
        error: error.message
      });
    }
  }
  
  return results;
}

// Test context persistence across agent switches
async function testAgentSwitchingMemory() {
  console.log('\n🔄 === COMPLEX CONVERSATION SCENARIO 3: Agent Switching Memory ===');
  
  const threadId = 'agent-switch-test-1';
  const switchingSteps = [
    {
      query: "Quali sono i dipendenti di Mauden?",
      expectedAgent: "mcp_agent",
      description: "Start with company data"
    },
    {
      query: "Spiegami cos'è l'apprendimento automatico",
      expectedAgent: "general_agent", 
      description: "Switch to general knowledge"
    },
    {
      query: "Tornando ai dipendenti, qualcuno ha esperienza in ML?",
      expectedAgent: "mcp_agent",
      description: "Return to company data with ML context from previous"
    },
    {
      query: "Come si impara il machine learning?",
      expectedAgent: "general_agent",
      description: "General advice (should remember ML context)"
    },
    {
      query: "Chi in Mauden potrebbe seguire questi consigli?",
      expectedAgent: "mcp_agent",
      description: "Merge learning advice with employee data"
    }
  ];

  let results = [];
  
  for (let i = 0; i < switchingSteps.length; i++) {
    const step = switchingSteps[i];
    console.log(`\n🔄 Step ${i + 1}: ${step.description}`);
    console.log(`Query: "${step.query}"`);
    console.log(`Expected Agent: ${step.expectedAgent}`);
    console.log('-'.repeat(60));
    
    try {
      const startTime = Date.now();
      const result = await runOrchestratorOptimized(step.query, threadId);
      const endTime = Date.now();
      
      const actualAgent = result.selectedAgent;
      const agentMatch = actualAgent === step.expectedAgent;
      
      console.log(`✅ Response received in ${endTime - startTime}ms`);
      console.log(`🎯 Expected: ${step.expectedAgent} | Actual: ${actualAgent} ${agentMatch ? '✅' : '❌'}`);
      console.log(`📝 Response Preview: ${result.finalResponse?.substring(0, 120)}...`);
      
      results.push({
        step: i + 1,
        query: step.query,
        expectedAgent: step.expectedAgent,
        actualAgent,
        agentMatch,
        responseTime: endTime - startTime
      });
      
      // Wait between steps
      if (i < switchingSteps.length - 1) {
        console.log('⏳ Waiting 2 seconds before next step...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
    } catch (error) {
      console.error(`❌ Step ${i + 1} failed:`, error.message);
      results.push({
        step: i + 1,
        error: error.message,
        agentMatch: false
      });
    }
  }
  
  return results;
}

// Generate comprehensive test report
function generateTestReport(scenario1, scenario2, scenario3) {
  console.log('\n📊 === COMPREHENSIVE TEST REPORT ===');
  
  // Scenario 1 Analysis
  console.log('\n🎭 Scenario 1: Multi-Topic Context');
  const scenario1Success = scenario1.filter(r => r.agentMatch).length;
  console.log(`✅ Agent Routing Accuracy: ${scenario1Success}/${scenario1.length} (${Math.round(scenario1Success/scenario1.length*100)}%)`);
  
  // Scenario 2 Analysis  
  console.log('\n🌍 Scenario 2: Multilingual Context');
  const scenario2LanguageAccuracy = scenario2.filter(r => r.detectedLanguage && !r.error).length;
  console.log(`✅ Language Detection: ${scenario2LanguageAccuracy}/${scenario2.length} (${Math.round(scenario2LanguageAccuracy/scenario2.length*100)}%)`);
  
  // Scenario 3 Analysis
  console.log('\n🔄 Scenario 3: Agent Switching Memory');
  const scenario3Success = scenario3.filter(r => r.agentMatch).length;
  console.log(`✅ Agent Switch Accuracy: ${scenario3Success}/${scenario3.length} (${Math.round(scenario3Success/scenario3.length*100)}%)`);
  
  // Overall Performance
  const totalSteps = scenario1.length + scenario2.length + scenario3.length;
  const totalErrors = [...scenario1, ...scenario2, ...scenario3].filter(r => r.error).length;
  console.log(`\n📈 Overall Performance:`);
  console.log(`- Total Steps Executed: ${totalSteps}`);
  console.log(`- Total Errors: ${totalErrors}`);
  console.log(`- Success Rate: ${Math.round((totalSteps - totalErrors)/totalSteps*100)}%`);
  
  // Average Response Time
  const allTimes = [...scenario1, ...scenario2, ...scenario3]
    .filter(r => r.responseTime)
    .map(r => r.responseTime);
  const avgTime = allTimes.reduce((a, b) => a + b, 0) / allTimes.length;
  console.log(`- Average Response Time: ${Math.round(avgTime)}ms`);
  
  console.log('\n🎯 Key Insights:');
  console.log('- Context retention across topic switches');
  console.log('- Multilingual conversation continuity');  
  console.log('- Agent routing accuracy with conversation history');
  console.log('- Memory persistence across complex workflows');
}

// Main test execution
async function runComplexConversationTests() {
  try {
    console.log('🚀 Testing Complex Conversation Scenarios...');
    console.log('This will test the system\'s ability to maintain context across:');
    console.log('- Multiple topics and context switches');
    console.log('- Multilingual conversations');
    console.log('- Agent routing with memory retention');
    console.log('\n⏱️  This may take several minutes...\n');
    
    const scenario1Results = await testComplexConversationFlow();
    await new Promise(resolve => setTimeout(resolve, 3000)); // Pause between scenarios
    
    const scenario2Results = await testMultilingualContextRetention();
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const scenario3Results = await testAgentSwitchingMemory();
    
    generateTestReport(scenario1Results, scenario2Results, scenario3Results);
    
    console.log('\n✅ Complex conversation testing completed!');
    console.log('\n🔍 Check LangSmith dashboard for detailed conversation traces:');
    console.log(`🔗 ${process.env.LANGCHAIN_PROJECT ? `https://smith.langchain.com/o/default/projects/p/${process.env.LANGCHAIN_PROJECT}` : 'Configure LANGCHAIN_PROJECT in .env'}`);
    
  } catch (error) {
    console.error('❌ Complex conversation test failed:', error);
  }
}

// Run the tests if called directly
if (require.main === module) {
  runComplexConversationTests()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = {
  testComplexConversationFlow,
  testMultilingualContextRetention, 
  testAgentSwitchingMemory,
  runComplexConversationTests
};
