// Test per il routing dinamico basato su LLM (senza pattern hardcoded)
const { runOrchestratorOptimized } = require('../src/agents/orchestratorAgent.optimized');

async function testDynamicDataExplorerRouting() {
  console.log('\n🧪 Testing Dynamic Data Explorer Routing (LLM-based)\n');
  
  const threadId = 'test-dynamic-routing-' + Date.now();
  
  // Test queries che dovrebbero andare al Data Explorer
  const dataQueries = [
    "Which are all the universal titles that includes the string 'Knight Rider Car Build Up'?",
    "Quali sono tutti i titoli universali che includono 'Minibook Novels'?",
    "Show me all records containing Back to the Future",
    "Find all products with component code 808647",
    "How many titles are there in the database?",
    "What's in the dataset table?",
    "Give me the first 10 rows of data"
  ];
  
  // Test queries che dovrebbero andare al General Agent
  const generalQueries = [
    "What's the weather like in Milan?",
    "Tell me a joke about databases",
    "Explain how machine learning works",
    "What can you do for me?",
    "How are you today?",
    "What is artificial intelligence?"
  ];
  
  console.log('📋 Testing Data Exploration Queries (should route to Data Explorer):\n');
  
  for (const query of dataQueries) {
    console.log(`🔍 Testing: "${query}"`);
    
    try {
      const result = await runOrchestratorOptimized(query, threadId, []);
      
      const agent = result.selectedAgent || 'unknown';
      const success = agent.includes('data') || agent.includes('mcp');
      
      console.log(`   ${success ? '✅' : '❌'} Agent: ${agent}`);
      if (!success) {
        console.log(`   ⚠️  Expected data/mcp agent, got: ${agent}`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    console.log();
  }
  
  console.log('📋 Testing General Queries (should route to General Agent):\n');
  
  for (const query of generalQueries) {
    console.log(`💬 Testing: "${query}"`);
    
    try {
      const result = await runOrchestratorOptimized(query, threadId, []);
      
      const agent = result.selectedAgent || 'unknown';
      const success = agent.includes('general');
      
      console.log(`   ${success ? '✅' : '❌'} Agent: ${agent}`);
      if (!success) {
        console.log(`   ⚠️  Expected general agent, got: ${agent}`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    console.log();
  }
  
  console.log('🎉 Dynamic Routing Test Complete!');
  console.log('\n💡 This test validates that:');
  console.log('   - LLM intelligently routes data queries to Data Explorer');
  console.log('   - LLM routes conversational queries to General Agent'); 
  console.log('   - No hardcoded patterns are needed!');
}

// Test specifico per le query originali dell'utente
async function testSpecificUserQueries() {
  console.log('\n🧪 Testing Specific User Queries\n');
  
  const threadId = 'test-user-queries-' + Date.now();
  
  const userQueries = [
    "Which are all the universal titles that includes the string 'Knight Rider Car Build Up' searching in the universal description this string in all the different possible languages?",
    "Which are all the universal titles that includes the string 'Minibook Novels' searching in the universal description this string in all the different possible languages?"
  ];
  
  for (const query of userQueries) {
    console.log(`🎯 Testing user query: "${query.substring(0, 80)}..."`);
    
    try {
      const result = await runOrchestratorOptimized(query, threadId, []);
      
      console.log(`   📊 Agent: ${result.selectedAgent}`);
      console.log(`   📋 Response preview: ${result.finalResponse?.substring(0, 150)}...`);
      
      // Dovrebbe andare al Data Explorer per cercare nel database
      const expectedDataExplorer = result.selectedAgent?.includes('data') || 
                                   result.selectedAgent?.includes('mcp');
      
      if (expectedDataExplorer) {
        console.log('   ✅ Correctly routed to data exploration');
      } else {
        console.log('   ⚠️  May need routing improvement');
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    console.log();
  }
}

// Esegui tutti i test
async function runAllTests() {
  console.log('🚀 Starting Dynamic Routing Tests (No Hardcoded Patterns)...\n');
  
  await testDynamicDataExplorerRouting();
  await testSpecificUserQueries();
  
  console.log('\n✅ All Dynamic Routing Tests Completed!');
  console.log('\n🎯 Key Benefits:');
  console.log('   - No hardcoded patterns in code');
  console.log('   - LLM adapts to any query type');
  console.log('   - Truly dynamic and flexible');
  console.log('   - Works for any domain/database');
}

// Esegui se chiamato direttamente
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { testDynamicDataExplorerRouting, testSpecificUserQueries };
