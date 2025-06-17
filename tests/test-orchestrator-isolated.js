// Test dell'orchestratore isolato
require('dotenv').config();
const { runOrchestratorOptimized } = require('../src/agents/orchestratorAgent.optimized.js');

async function testOrchestrator() {
  try {
    console.log('🧪 Testing orchestrator with simple query...');
    
    const result = await runOrchestratorOptimized("ciao", "test-orchestrator");
    
    console.log('✅ Orchestrator result received');
    console.log('Selected agent:', result.selectedAgent);
    console.log('Final response:', result.finalResponse?.substring(0, 100));
    console.log('Success:', result.success !== false);
    
  } catch (error) {
    console.error('❌ Orchestrator test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

testOrchestrator();
