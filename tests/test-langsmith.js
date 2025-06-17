// Test LangSmith Integration
// Tests the LangSmith tracing functionality with the multilingual system

console.log('🔄 Starting LangSmith test...');

const { runOrchestratorOptimized } = require('../src/agents/orchestratorAgent.optimized');

async function testLangSmithIntegration() {
  console.log('🔍 Testing LangSmith Integration');
  console.log('======================================');
  
  // Check environment variables
  console.log('\n📊 LangSmith Configuration:');
  console.log(`- LANGCHAIN_TRACING_V2: ${process.env.LANGCHAIN_TRACING_V2}`);
  console.log(`- LANGCHAIN_PROJECT: ${process.env.LANGCHAIN_PROJECT}`);
  console.log(`- LANGCHAIN_API_KEY: ${process.env.LANGCHAIN_API_KEY ? '✅ Set' : '❌ Not set'}`);
  console.log(`- OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Not set'}`);
  
  if (process.env.LANGCHAIN_TRACING_V2 !== "true") {
    console.log('\n⚠️ LangSmith tracing is disabled. Set LANGCHAIN_TRACING_V2="true" in .env to enable.');
    return;
  }
  
  console.log('\n🚀 Running test queries with LangSmith tracing...');
  
  const testQueries = [
    {
      language: 'Italian',
      query: 'Ciao! Quanti dipendenti ha Mauden?',
      description: 'Italian company query'
    },
    {
      language: 'English', 
      query: 'What is the capital of France?',
      description: 'English general knowledge query'
    },
    {
      language: 'Spanish',
      query: '¿Puedes contarme sobre los empleados de Mauden?',
      description: 'Spanish company query'
    }
  ];
  
  for (let i = 0; i < testQueries.length; i++) {
    const test = testQueries[i];
    console.log(`\n🌍 Test ${i + 1}: ${test.description}`);
    console.log(`Query: "${test.query}"`);
    console.log('-'.repeat(50));
    
    try {
      const startTime = Date.now();
      const result = await runOrchestratorOptimized(test.query, `langsmith-test-${i + 1}`);
      const endTime = Date.now();
      
      console.log(`✅ Test completed in ${endTime - startTime}ms`);
      console.log(`🎯 Selected Agent: ${result.selectedAgent || 'unknown'}`);
      console.log(`🌍 Detected Language: ${result.originalLanguage || 'unknown'}`);
      console.log(`📝 Response Length: ${result.finalResponse?.length || 0} characters`);
      
      if (process.env.LANGCHAIN_TRACING_V2 === "true") {
        console.log(`🔍 LangSmith: Check your project "${process.env.LANGCHAIN_PROJECT}" for detailed traces`);
      }
      
    } catch (error) {
      console.error(`❌ Test ${i + 1} failed:`, error.message);
    }
    
    // Wait between tests to avoid rate limiting
    if (i < testQueries.length - 1) {
      console.log('⏳ Waiting 2 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n📊 LangSmith Testing Summary:');
  console.log('- All test queries have been executed');
  console.log('- Check LangSmith dashboard for detailed traces');
  console.log('- Look for traces with tags: orchestrator, language_agent, mcp_agent, general_agent');
  
  if (process.env.LANGCHAIN_TRACING_V2 === "true") {
    console.log(`\n🔗 LangSmith Project URL: https://smith.langchain.com/o/default/projects/p/${process.env.LANGCHAIN_PROJECT}`);
  }
}

// Run the test
if (require.main === module) {
  testLangSmithIntegration()
    .then(() => {
      console.log('\n✅ LangSmith integration test completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ LangSmith integration test failed:', error);
      process.exit(1);
    });
}

module.exports = { testLangSmithIntegration };
