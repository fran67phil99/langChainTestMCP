// Test Conversation Memory via REST API
// This test uses the actual server that manages conversation history

console.log('🧪 Testing Conversation Memory via REST API');

async function testConversationMemoryViaAPI() {
  const baseUrl = 'http://localhost:8001/api/chat';
  const threadId = `memory-test-${Date.now()}`;
  
  console.log(`Thread ID: ${threadId}\n`);
  
  try {
    // Step 1: Ask about interns
    console.log('=== Step 1: Ask about Mauden interns ===');
    const step1Response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: "Chi sono gli stagisti di Mauden?",
        threadId: threadId
      })
    });
    
    const step1 = await step1Response.json();
    console.log(`✅ Agent: ${step1.result.selectedAgent}`);
    console.log(`📝 Preview: ${step1.response.substring(0, 100)}...`);
    
    // Wait before next step
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 2: Follow-up requiring memory (the critical test)
    console.log('\n=== Step 2: Ask about youngest (requires memory) ===');
    const step2Response = await fetch(baseUrl, {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: "Quanti anni ha il più giovane?",
        threadId: threadId
      })
    });
    
    const step2 = await step2Response.json();
    console.log(`✅ Agent: ${step2.result.selectedAgent}`);
    console.log(`📝 Preview: ${step2.response.substring(0, 100)}...`);
    
    // Wait before next step
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 3: Context switch to general
    console.log('\n=== Step 3: General AI question ===');
    const step3Response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: "Cosa significa intelligenza artificiale?",
        threadId: threadId
      })
    });
    
    const step3 = await step3Response.json();
    console.log(`✅ Agent: ${step3.result.selectedAgent}`);
    console.log(`📝 Preview: ${step3.response.substring(0, 100)}...`);
    
    // Wait before next step
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 4: Complex context merge
    console.log('\n=== Step 4: Context merge (Filippo + AI) ===');
    const step4Response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: "Filippo ha esperienza con AI?",
        threadId: threadId
      })
    });
    
    const step4 = await step4Response.json();
    console.log(`✅ Agent: ${step4.result.selectedAgent}`);
    console.log(`📝 Preview: ${step4.response.substring(0, 120)}...`);
    
    // Analysis
    console.log('\n📊 === CONVERSATION MEMORY ANALYSIS ===');
    
    const step1Agent = step1.result.selectedAgent;
    const step2Agent = step2.result.selectedAgent; 
    const step3Agent = step3.result.selectedAgent;
    const step4Agent = step4.result.selectedAgent;
    
    console.log(`Step 1 Agent: ${step1Agent} (Expected: mcp_agent) ${step1Agent === 'mcp_agent' ? '✅' : '❌'}`);
    console.log(`Step 2 Agent: ${step2Agent} (Expected: mcp_agent) ${step2Agent === 'mcp_agent' ? '✅' : '❌'}`);
    console.log(`Step 3 Agent: ${step3Agent} (Expected: general_agent) ${step3Agent === 'general_agent' ? '✅' : '❌'}`);
    console.log(`Step 4 Agent: ${step4Agent} (Expected: mcp_agent) ${step4Agent === 'mcp_agent' ? '✅' : '❌'}`);
    
    // Memory tests
    const step2HasContext = step2.response.toLowerCase().includes('stagist') || 
                            step2.response.toLowerCase().includes('intern') ||
                            step2.response.toLowerCase().includes('filippo') ||
                            step2.response.toLowerCase().includes('dana');
    
    const step4HasFilippo = step4.response.toLowerCase().includes('filippo') || 
                           step4.response.toLowerCase().includes('barberio');
    
    console.log(`Step 2 Memory: References context ${step2HasContext ? '✅' : '❌'}`);
    console.log(`Step 4 Context: References Filippo ${step4HasFilippo ? '✅' : '❌'}`);
    
    // Calculate success rate
    const routingTests = [
      step1Agent === 'mcp_agent',
      step2Agent === 'mcp_agent', 
      step3Agent === 'general_agent',
      step4Agent === 'mcp_agent'
    ];
    
    const memoryTests = [step2HasContext, step4HasFilippo];
    
    const routingSuccess = routingTests.filter(Boolean).length;
    const memorySuccess = memoryTests.filter(Boolean).length;
    
    console.log(`\n🎯 Results:`);
    console.log(`- Agent Routing: ${routingSuccess}/4 (${Math.round(routingSuccess/4*100)}%)`);
    console.log(`- Memory Tests: ${memorySuccess}/2 (${Math.round(memorySuccess/2*100)}%)`);
    console.log(`- Overall Score: ${Math.round((routingSuccess + memorySuccess)/6*100)}%`);
    
    if (step2Agent === 'mcp_agent' && step2HasContext) {
      console.log('\n🎉 CONVERSATION MEMORY: WORKING PERFECTLY!');
    } else if (step2Agent === 'mcp_agent') {
      console.log('\n⚠️ CONVERSATION MEMORY: Routing correct but context needs improvement');
    } else {
      console.log('\n❌ CONVERSATION MEMORY: Routing issue detected');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run test
testConversationMemoryViaAPI();
