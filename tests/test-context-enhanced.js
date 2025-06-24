// Test mirato per i pattern di follow-up migliorati
const { runOrchestratorOptimized } = require('../src/agents/orchestratorAgent.optimized');

// Test simulato dei pattern di follow-up
function testImprovedFollowUpPatterns() {
  console.log('\n🧪 Testing Improved Follow-up Pattern Detection\n');
  
  const testCases = [
    { input: "E a Senago?", expected: true, location: "senago" },
    { input: "E per Milano?", expected: true, location: "milano" },
    { input: "E anche a Roma?", expected: true, location: "roma" },
    { input: "What about London?", expected: true, location: "london" },
    { input: "Anche a Napoli?", expected: true, location: "napoli" },
    { input: "Torino?", expected: true, location: "torino" },
    { input: "Come va la giornata?", expected: false },
    { input: "Che tempo fa oggi?", expected: false },
    { input: "E tu cosa ne pensi?", expected: false }
  ];
  
  testCases.forEach((testCase, index) => {
    const query = testCase.input.toLowerCase().trim();
    const followUpPatterns = [
      /^e\s+(a|in|per|di)\s+([a-zA-ZÀ-ÿ\s]{2,20})\??\s*$/i,
      /^e\s+(anche|also)\s+(a|in|per|di)\s+([a-zA-ZÀ-ÿ\s]{2,20})\??\s*$/i,
      /^(e|and)\s+(what\s+about|how\s+about)\s+([a-zA-ZÀ-ÿ\s]{2,20})\??\s*$/i,
      /^(what\s+about|how\s+about|che\s+mi\s+dici\s+di)\s+([a-zA-ZÀ-ÿ\s]{2,20})\??\s*$/i,
      /^(anche|also)\s+(a|in|per|di)\s+([a-zA-ZÀ-ÿ\s]{2,20})\??\s*$/i,
      /^[a-zA-ZÀ-ÿ\s]{2,20}\?\s*$/i,
    ];
    
    let isFollowUp = false;
    let detectedLocation = null;
    
    for (const pattern of followUpPatterns) {
      const match = query.match(pattern);
      if (match) {
        const location = match[3] || match[2] || match[1];
        if (location && location.length > 1) {
          isFollowUp = true;
          detectedLocation = location.trim();
          break;
        }
      }
    }
    
    const passed = isFollowUp === testCase.expected;
    const locationMatch = !testCase.expected || (detectedLocation === testCase.location);
    
    console.log(`${passed && locationMatch ? '✅' : '❌'} Test ${index + 1}: "${testCase.input}"`);
    console.log(`   Expected: ${testCase.expected}, Got: ${isFollowUp}`);
    if (testCase.location) {
      console.log(`   Expected location: "${testCase.location}", Got: "${detectedLocation || 'none'}"`);
    }
    console.log();
  });
}

// Test completo conversazione multi-turn
async function testMultiTurnConversation() {
  console.log('\n🧪 Testing Multi-Turn Conversation with Context\n');
  
  const threadId = 'test-multiturn-' + Date.now();
  let existingMessages = [];
  
  try {
    // Step 1: Domanda iniziale sul tempo
    console.log('👤 User: "Che tempo fa a Milano oggi?"');
    const result1 = await runOrchestratorOptimized(
      "Che tempo fa a Milano oggi?", 
      threadId, 
      existingMessages
    );
    
    console.log(`🤖 Assistant: ${result1.finalResponse.substring(0, 80)}...`);
    console.log(`📊 Agent: ${result1.selectedAgent}, Follow-up: ${result1.wasFollowUp}\n`);
    
    existingMessages = result1.messages || [];
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 2: Follow-up semplice
    console.log('👤 User: "E a Senago?"');
    const result2 = await runOrchestratorOptimized(
      "E a Senago?", 
      threadId, 
      existingMessages
    );
    
    console.log(`🤖 Assistant: ${result2.finalResponse.substring(0, 80)}...`);
    console.log(`📊 Agent: ${result2.selectedAgent}, Follow-up: ${result2.wasFollowUp}`);
    console.log(`🔄 Expanded: "${result2.processedQuery}"\n`);
    
    existingMessages = result2.messages || existingMessages;
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 3: Follow-up con "anche"
    console.log('👤 User: "E anche a Roma?"');
    const result3 = await runOrchestratorOptimized(
      "E anche a Roma?", 
      threadId, 
      existingMessages
    );
    
    console.log(`🤖 Assistant: ${result3.finalResponse.substring(0, 80)}...`);
    console.log(`📊 Agent: ${result3.selectedAgent}, Follow-up: ${result3.wasFollowUp}`);
    console.log(`🔄 Expanded: "${result3.processedQuery}"\n`);
    
    existingMessages = result3.messages || existingMessages;
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 4: Cambio di argomento
    console.log('👤 User: "Dimmi una curiosità su Roma"');
    const result4 = await runOrchestratorOptimized(
      "Dimmi una curiosità su Roma", 
      threadId, 
      existingMessages
    );
    
    console.log(`🤖 Assistant: ${result4.finalResponse.substring(0, 80)}...`);
    console.log(`📊 Agent: ${result4.selectedAgent}, Follow-up: ${result4.wasFollowUp}\n`);
    
    existingMessages = result4.messages || existingMessages;
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 5: Follow-up dopo cambio di contesto (non dovrebbe più essere weather)
    console.log('👤 User: "E a Napoli?" (after context change)');
    const result5 = await runOrchestratorOptimized(
      "E a Napoli?", 
      threadId, 
      existingMessages
    );
    
    console.log(`🤖 Assistant: ${result5.finalResponse.substring(0, 80)}...`);
    console.log(`📊 Agent: ${result5.selectedAgent}, Follow-up: ${result5.wasFollowUp}`);
    console.log(`🔄 Expanded: "${result5.processedQuery}"\n`);
    
    // Summary
    console.log('🎉 Multi-Turn Conversation Test Complete!');
    console.log('\n📊 Summary:');
    console.log(`   1. Weather Milano: ${result1.selectedAgent} (follow-up: ${result1.wasFollowUp})`);
    console.log(`   2. "E a Senago?": ${result2.selectedAgent} (follow-up: ${result2.wasFollowUp})`);
    console.log(`   3. "E anche a Roma?": ${result3.selectedAgent} (follow-up: ${result3.wasFollowUp})`);
    console.log(`   4. Curiosità Roma: ${result4.selectedAgent} (follow-up: ${result4.wasFollowUp})`);
    console.log(`   5. "E a Napoli?" (post-context): ${result5.selectedAgent} (follow-up: ${result5.wasFollowUp})`);
    
    console.log('\n✅ Expected behavior:');
    console.log('   - Steps 2 and 3 should be follow-ups (true)');
    console.log('   - Steps 2 and 3 should expand to weather queries');
    console.log('   - Step 5 may or may not expand depending on context age');
    
  } catch (error) {
    console.error('❌ Multi-Turn Conversation Test Error:', error);
    throw error;
  }
}

// Esegui tutti i test
async function runAllTests() {
  console.log('🚀 Starting Enhanced Context Tracking Tests...\n');
  
  // Test pattern detection
  testImprovedFollowUpPatterns();
  
  // Test conversazione completa
  await testMultiTurnConversation();
  
  console.log('\n✅ All Enhanced Context Tracking Tests Completed!');
}

// Esegui se chiamato direttamente
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { testImprovedFollowUpPatterns, testMultiTurnConversation };
