// Quick Complex Conversation Test
console.log('🧪 Quick Complex Conversation Test');

const { runOrchestratorOptimized } = require('../src/agents/orchestratorAgent.optimized');

async function quickComplexTest() {
  try {
    console.log('\n=== SCENARIO: Complex Context Retention ===');
    
    const threadId = 'quick-complex-test';
    
    // Step 1: Company data query
    console.log('\n📝 Step 1: Ask about Mauden interns');
    const step1 = await runOrchestratorOptimized('Chi sono gli stagisti di Mauden?', threadId);
    console.log(`✅ Step 1 - Agent: ${step1.selectedAgent}, Language: ${step1.originalLanguage?.languageName}`);
    console.log(`Response preview: ${step1.finalResponse?.substring(0, 100)}...`);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 2: Follow-up requiring memory
    console.log('\n📝 Step 2: Ask about youngest intern (requires memory)');
    const step2 = await runOrchestratorOptimized('Quanti anni ha il più giovane?', threadId);
    console.log(`✅ Step 2 - Agent: ${step2.selectedAgent}, Language: ${step2.originalLanguage?.languageName}`);
    console.log(`Response preview: ${step2.finalResponse?.substring(0, 100)}...`);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 3: Context switch to general knowledge
    console.log('\n📝 Step 3: Switch to general topic');
    const step3 = await runOrchestratorOptimized('Cosa significa AI?', threadId);
    console.log(`✅ Step 3 - Agent: ${step3.selectedAgent}, Language: ${step3.originalLanguage?.languageName}`);
    console.log(`Response preview: ${step3.finalResponse?.substring(0, 100)}...`);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 4: Complex merge - reference previous contexts
    console.log('\n📝 Step 4: Merge contexts (Filippo + AI experience)');
    const step4 = await runOrchestratorOptimized('Filippo ha esperienza con AI?', threadId);
    console.log(`✅ Step 4 - Agent: ${step4.selectedAgent}, Language: ${step4.originalLanguage?.languageName}`);
    console.log(`Response preview: ${step4.finalResponse?.substring(0, 150)}...`);
    
    // Analysis
    console.log('\n📊 === QUICK TEST ANALYSIS ===');
    console.log(`Step 1 Agent: ${step1.selectedAgent} (Expected: mcp_agent) ${step1.selectedAgent === 'mcp_agent' ? '✅' : '❌'}`);
    console.log(`Step 2 Agent: ${step2.selectedAgent} (Expected: mcp_agent) ${step2.selectedAgent === 'mcp_agent' ? '✅' : '❌'}`);
    console.log(`Step 3 Agent: ${step3.selectedAgent} (Expected: general_agent) ${step3.selectedAgent === 'general_agent' ? '✅' : '❌'}`);
    console.log(`Step 4 Agent: ${step4.selectedAgent} (Expected: mcp_agent) ${step4.selectedAgent === 'mcp_agent' ? '✅' : '❌'}`);
    
    const contextTest = step4.finalResponse?.toLowerCase().includes('filippo') || step4.finalResponse?.toLowerCase().includes('barberio');
    console.log(`Step 4 Context: References Filippo ${contextTest ? '✅' : '❌'}`);
    
    console.log('\n🎯 Conversation History Test: COMPLETED');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

quickComplexTest();
