// Test script for modular agent architecture
const { runOrchestratorOptimized } = require('./src/agents/orchestratorAgent.optimized');
require('dotenv').config();

async function testModularArchitecture() {
  console.log('🧪 Testing Modular Agent Architecture\n');
  
  const testQueries = [
    {
      type: 'MCP Query (Italian)',
      query: 'Quanti dipendenti lavorano in Mauden?',
      expectedAgent: 'mcp_agent'
    },
    {
      type: 'General Query (English)', 
      query: 'What is artificial intelligence?',
      expectedAgent: 'general_agent'
    },
    {
      type: 'MCP Query (Spanish)',
      query: '¿Cuántos empleados hay en Mauden?',
      expectedAgent: 'mcp_agent'
    },
    {
      type: 'General Query (French)',
      query: 'Comment apprendre la programmation?',
      expectedAgent: 'general_agent'
    },
    {
      type: 'MCP Query (Russian)',
      query: 'кто зарабатывает больше в маудене?',
      expectedAgent: 'mcp_agent'
    }
  ];
  
  for (const test of testQueries) {
    console.log(`\n🧩 Testing ${test.type}: "${test.query}"`);
    console.log('=' .repeat(70));
    
    try {
      const startTime = Date.now();
      const result = await runOrchestratorOptimized(test.query, 'test-modular');
      const endTime = Date.now();
      
      console.log(`✅ Original Language: ${result.originalLanguage?.languageName || 'Unknown'}`);
      console.log(`🔧 Selected Agent: ${result.selectedAgent}`);
      console.log(`⏱️ Processing Time: ${endTime - startTime}ms`);
      console.log(`🎯 Expected Agent: ${test.expectedAgent}`);
      console.log(`✓ Agent Match: ${result.selectedAgent === test.expectedAgent ? '✅ CORRECT' : '❌ MISMATCH'}`);
      console.log(`📝 Response Preview: ${result.finalResponse.substring(0, 150)}...`);
      
    } catch (error) {
      console.error(`❌ Error testing ${test.type}:`, error.message);
    }
    
    console.log('\n' + '='.repeat(70));
  }
  
  console.log('\n🎉 Modular Architecture Test Complete!');
  console.log('\n📊 Architecture Summary:');
  console.log('🎯 Orchestrator: Streamlined routing coordinator');
  console.log('🌍 Language Agent: Multilingual processing');
  console.log('🔧 MCP Agent: Company data specialist');
  console.log('💬 General Agent: Knowledge base specialist');
}

// Run the test
if (require.main === module) {
  testModularArchitecture().catch(console.error);
}

module.exports = { testModularArchitecture };
