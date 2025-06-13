// Test script for multilingual system
const { runOrchestratorOptimized } = require('./src/agents/orchestratorAgent.optimized');
require('dotenv').config();

async function testMultilingualSystem() {
  console.log('🧪 Testing Multilingual LangGraph System\n');
  
  const testQueries = [
    {
      language: 'Italian',
      query: 'Quanti dipendenti lavorano in Mauden?'
    },
    {
      language: 'English', 
      query: 'How many employees work at Mauden?'
    },
    {
      language: 'Spanish',
      query: '¿Cuántos empleados trabajan en Mauden?'
    },
    {
      language: 'French',
      query: 'Combien d\'employés travaillent chez Mauden?'
    },
    {
      language: 'German',
      query: 'Wie viele Mitarbeiter arbeiten bei Mauden?'
    }
  ];
  
  for (const test of testQueries) {
    console.log(`\n🌍 Testing ${test.language} query: "${test.query}"`);
    console.log('=' .repeat(60));
    
    try {
      const result = await runOrchestratorOptimized(test.query, 'test-thread');
      
      console.log(`✅ Original Language: ${result.originalLanguage?.languageName || 'Unknown'}`);
      console.log(`🔧 Selected Agent: ${result.selectedAgent}`);
      console.log(`📝 Final Response:\n${result.finalResponse}`);
      
    } catch (error) {
      console.error(`❌ Error testing ${test.language}:`, error.message);
    }
    
    console.log('\n' + '='.repeat(60));
  }
}

// Run the test
if (require.main === module) {
  testMultilingualSystem().catch(console.error);
}

module.exports = { testMultilingualSystem };
