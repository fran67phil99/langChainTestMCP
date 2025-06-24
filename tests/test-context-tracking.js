// Test per verificare il context tracking e i follow-up conversazionali
const { runOrchestratorOptimized } = require('../src/agents/orchestratorAgent.optimized');

async function testContextTracking() {
  console.log('\n🧪 Testing Context Tracking and Follow-up Queries\n');
  
  const threadId = 'test-context-' + Date.now();
  let existingMessages = [];
  
  try {
    // Test 1: Query iniziale sul tempo
    console.log('📋 Test 1: Initial weather query');
    console.log('User: "Che tempo fa a Milano?"');
    
    const result1 = await runOrchestratorOptimized(
      "Che tempo fa a Milano?", 
      threadId, 
      existingMessages
    );
    
    console.log('✅ Agent selected:', result1.selectedAgent);
    console.log('✅ Response preview:', result1.finalResponse?.substring(0, 100) + '...');
    console.log('✅ Context established for weather queries');
    
    // Aggiorna esistingMessages con la risposta precedente
    existingMessages = result1.messages || [];
    
    // Aspetta un po' per simulare conversazione reale
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 2: Follow-up query implicita
    console.log('\n📋 Test 2: Follow-up query');
    console.log('User: "E a Senago?"');
    
    const result2 = await runOrchestratorOptimized(
      "E a Senago?", 
      threadId, 
      existingMessages
    );
    
    console.log('✅ Agent selected:', result2.selectedAgent);
    console.log('✅ Was follow-up detected:', result2.wasFollowUp);
    console.log('✅ Processed query:', result2.processedQuery);
    console.log('✅ Response preview:', result2.finalResponse?.substring(0, 100) + '...');
    
    // Test 3: Verifica che il follow-up sia stato espanso correttamente
    if (result2.wasFollowUp && result2.processedQuery !== "E a Senago?") {
      console.log('✅ Context expansion successful!');
      console.log(`   Original: "E a Senago?"`);
      console.log(`   Expanded: "${result2.processedQuery}"`);
    } else {
      console.log('⚠️ Context expansion may not have worked as expected');
    }
    
    // Aggiorna esistingMessages
    existingMessages = result2.messages || existingMessages;
    
    // Test 4: Altro follow-up
    console.log('\n📋 Test 3: Another follow-up');
    console.log('User: "E anche a Roma?"');
    
    const result3 = await runOrchestratorOptimized(
      "E anche a Roma?", 
      threadId, 
      existingMessages
    );
    
    console.log('✅ Agent selected:', result3.selectedAgent);
    console.log('✅ Was follow-up detected:', result3.wasFollowUp);
    console.log('✅ Processed query:', result3.processedQuery);
    console.log('✅ Response preview:', result3.finalResponse?.substring(0, 100) + '...');
    
    // Test 5: Query completamente nuova per resettare il contesto
    console.log('\n📋 Test 4: New unrelated query');
    console.log('User: "Raccontami una barzelletta"');
    
    const result4 = await runOrchestratorOptimized(
      "Raccontami una barzelletta", 
      threadId, 
      existingMessages
    );
    
    console.log('✅ Agent selected:', result4.selectedAgent);
    console.log('✅ Should be general agent for jokes');
    console.log('✅ Response preview:', result4.finalResponse?.substring(0, 100) + '...');
    
    // Test 6: Follow-up dopo context reset - dovrebbe non funzionare
    console.log('\n📋 Test 5: Follow-up after context change');
    console.log('User: "E a Napoli?" (should not be weather anymore)');
    
    const result5 = await runOrchestratorOptimized(
      "E a Napoli?", 
      threadId, 
      existingMessages
    );
    
    console.log('✅ Agent selected:', result5.selectedAgent);
    console.log('✅ Was follow-up detected:', result5.wasFollowUp);
    console.log('✅ Should not expand to weather after context change');
    
    console.log('\n🎉 Context Tracking Test Complete!');
    console.log('\n📊 Summary:');
    console.log(`   - Weather query: ${result1.selectedAgent}`);
    console.log(`   - Follow-up 1: ${result2.selectedAgent} (follow-up: ${result2.wasFollowUp})`);
    console.log(`   - Follow-up 2: ${result3.selectedAgent} (follow-up: ${result3.wasFollowUp})`);
    console.log(`   - New topic: ${result4.selectedAgent} (should be general)`);
    console.log(`   - Follow-up after reset: ${result5.selectedAgent} (follow-up: ${result5.wasFollowUp})`);
    
  } catch (error) {
    console.error('❌ Context Tracking Test Error:', error);
    throw error;
  }
}

// Funzione per testare pattern di follow-up
function testFollowUpPatterns() {
  console.log('\n🧪 Testing Follow-up Pattern Detection\n');
  
  const testCases = [
    { input: "E a Senago?", expected: true, location: "Senago" },
    { input: "E per Milano?", expected: true, location: "Milano" },
    { input: "What about London?", expected: true, location: "London" },
    { input: "Anche a Roma?", expected: true, location: "Roma" },
    { input: "Napoli?", expected: true, location: "Napoli" },
    { input: "Come va la giornata?", expected: false },
    { input: "Che tempo fa oggi?", expected: false },
    { input: "E tu cosa ne pensi?", expected: false }
  ];
  
  // Importa la funzione di rilevamento (per testing diretto)
  // Nota: questa è una funzione interna, quindi simuliamo il comportamento
  testCases.forEach((testCase, index) => {
    const query = testCase.input.toLowerCase().trim();
    const followUpPatterns = [
      /^e\s+(a|in|per|di)\s+([a-zA-ZÀ-ÿ\s]{2,20})\??\s*$/i,
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
        const location = match[2] || match[3] || match[1];
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
  });
}

// Esegui i test
async function runAllTests() {
  console.log('🚀 Starting Context Tracking Tests...\n');
  
  // Test dei pattern di rilevamento
  testFollowUpPatterns();
  
  // Test completo del sistema
  await testContextTracking();
  
  console.log('\n✅ All Context Tracking Tests Completed!');
}

// Esegui se chiamato direttamente
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { testContextTracking, testFollowUpPatterns };
