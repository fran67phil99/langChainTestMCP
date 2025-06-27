// Test diretto dell'orchestrator
require('dotenv').config(); // Carica le variabili d'ambiente
const { runOrchestration } = require('./src/agents/orchestratorAgent.optimized.js');

async function testOrchestratorDirectly() {
  console.log('🧪 Test diretto dell\'orchestrator...');
  console.log('='.repeat(50));
  
  try {
    const userQuery = "Quanti film ci sono nel database? Usa strumenti MCP per accedere ai dati reali.";
    const threadId = 'test-orchestrator-' + Date.now();
    
    console.log(`📤 Query: ${userQuery}`);
    console.log(`🧵 Thread ID: ${threadId}`);
    
    const result = await runOrchestration(userQuery, threadId, []);
    
    console.log('\n📊 Risultato orchestrator:');
    console.log('Response:', result.response);
    console.log('Final Response:', result.finalResponse);
    console.log('Selected Agent:', result.selectedAgent);
    console.log('Technical Details:', result.technical_details);
    console.log('Error:', result.error);
    console.log('Success:', !result.error);
    
  } catch (error) {
    console.error('❌ Errore orchestrator:', error.message);
    console.error('Stack:', error.stack);
  }
}

testOrchestratorDirectly();
