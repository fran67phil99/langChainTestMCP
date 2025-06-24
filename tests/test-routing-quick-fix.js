// Quick test per verificare il routing migliorato
const { runOrchestratorOptimized } = require('../src/agents/orchestratorAgent.optimized');

async function quickTest() {
  console.log('🧪 Testing improved routing...\n');
  
  const testQueries = [
    'cosa puoi fare?',
    'what can you do?', 
    'tell me a joke',
    'write a poem about data',
    'spiegami cosa significa AI',
    'what is the weather like?'
  ];
  
  for (const query of testQueries) {
    try {
      console.log(`\n🔍 Testing: "${query}"`);
      const result = await runOrchestratorOptimized(query, 'test-fix', []);
      console.log(`🎯 Result: ${result.selectedAgent}`);
      
      // Verify correct routing
      if (result.selectedAgent === 'general_agent') {
        console.log('✅ CORRECT: Routed to General Agent');
      } else {
        console.log(`❌ INCORRECT: Routed to ${result.selectedAgent} instead of General Agent`);
      }
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }
    
    // Small delay
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

quickTest().catch(console.error);
