// Test per verificare il routing corretto delle query generali
const { runOrchestratorOptimized } = require('../src/agents/orchestratorAgent.optimized');

async function testGeneralRouting() {
  console.log('🧪 Testing General Query Routing...\n');
  
  const generalQueries = [
    'ciao',
    'come stai?',
    'cosa puoi fare?',
    'help',
    'hello',
    'what can you do?',
    'tell me a joke',
    'spiegami cosa significa AI',
    'write a poem about data',
    'what is the weather like?'
  ];
  
  for (const query of generalQueries) {
    console.log(`\n🔍 Testing query: "${query}"`);
    console.log('=' + '='.repeat(50 + query.length));
    
    try {
      const result = await runOrchestratorOptimized(query, 'test-123', []);
      
      console.log(`✅ Query: "${query}"`);
      console.log(`🎯 Selected Agent: ${result.selectedAgent}`);
      console.log(`📝 Response: ${result.finalResponse?.substring(0, 100)}...`);
      
      // Verify that general queries go to general agent
      if (result.selectedAgent === 'general_agent') {
        console.log('✅ CORRECT: General query routed to General Agent');
      } else if (result.selectedAgent === 'data_explorer' || result.selectedAgent.includes('data_explorer')) {
        console.log('❌ INCORRECT: General query routed to Data Explorer Agent');
      } else {
        console.log(`⚠️ UNEXPECTED: General query routed to ${result.selectedAgent}`);
      }
      
    } catch (error) {
      console.error(`❌ Error with query "${query}":`, error.message);
    }
    
    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Test di routing per query di dati
async function testDataRouting() {
  console.log('\n\n🧪 Testing Data Query Routing...\n');
  
  const dataQueries = [
    'show me the first 10 rows',
    'what tables do you have?',
    'find employees with manager role',
    'count all records',
    'mostra le prime righe della tabella',
    'cerca dipendenti con ruolo manager'
  ];
  
  for (const query of dataQueries) {
    console.log(`\n🔍 Testing query: "${query}"`);
    console.log('=' + '='.repeat(50 + query.length));
    
    try {
      const result = await runOrchestratorOptimized(query, 'test-456', []);
      
      console.log(`✅ Query: "${query}"`);
      console.log(`🎯 Selected Agent: ${result.selectedAgent}`);
      console.log(`📝 Response: ${result.finalResponse?.substring(0, 100)}...`);
      
      // Verify that data queries go to data explorer
      if (result.selectedAgent === 'data_explorer') {
        console.log('✅ CORRECT: Data query routed to Data Explorer Agent');
      } else if (result.selectedAgent === 'general_agent') {
        console.log('❌ INCORRECT: Data query routed to General Agent');
      } else {
        console.log(`⚠️ UNEXPECTED: Data query routed to ${result.selectedAgent}`);
      }
      
    } catch (error) {
      console.error(`❌ Error with query "${query}":`, error.message);
    }
    
    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function main() {
  try {
    console.log('🚀 Starting Routing Tests...\n');
    
    // Test general queries
    await testGeneralRouting();
    
    // Test data queries
    await testDataRouting();
    
    console.log('\n✅ All routing tests completed!');
  } catch (error) {
    console.error('❌ Test suite error:', error);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = { testGeneralRouting, testDataRouting };
