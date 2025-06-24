// Test rapido per verificare performance e formattazione
const { runOrchestratorOptimized } = require('./src/agents/orchestratorAgent.optimized');

async function quickPerformanceTest() {
  console.log('⚡ Testing performance and formatting improvements...\n');
  
  const testQuery = "show me data with 'Back to the Future'";
  
  console.log(`🎯 Query: "${testQuery}"`);
  console.log('🕐 Starting at:', new Date().toLocaleTimeString());
  
  const startTime = Date.now();
  
  try {
    const result = await runOrchestratorOptimized(testQuery, 'perf-test-001');
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log('\n⏰ PERFORMANCE RESULTS:');
    console.log(`- Total time: ${duration}ms (${(duration/1000).toFixed(2)} seconds)`);
    console.log(`- Agent: ${result.selectedAgent}`);
    
    if (duration < 30000) { // Less than 30 seconds
      console.log('✅ GOOD: Response time acceptable');
    } else {
      console.log('❌ SLOW: Response time too long');
    }
    
    console.log('\n📄 RESPONSE PREVIEW:');
    if (result.finalResponse) {
      // Show first 300 characters
      const preview = result.finalResponse.substring(0, 300);
      console.log(preview + (result.finalResponse.length > 300 ? '...' : ''));
      
      // Check for improvements
      const hasComplexObject = result.finalResponse.includes('[Oggetto complesso]');
      const hasRawJson = result.finalResponse.includes('```json');
      const hasUsefulContent = result.finalResponse.includes('Back to the Future') || 
                              result.finalResponse.includes('Delorean') ||
                              result.finalResponse.includes('H7');
      
      console.log('\n🔍 QUALITY CHECK:');
      console.log(`- Shows actual content: ${hasUsefulContent ? '✅' : '❌'}`);
      console.log(`- Avoids [Oggetto complesso]: ${!hasComplexObject ? '✅' : '❌'}`);
      console.log(`- No raw JSON: ${!hasRawJson ? '✅' : '❌'}`);
      
    } else {
      console.log('❌ No response received');
    }
    
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.error(`❌ Test failed after ${duration}ms:`, error.message);
  }
  
  console.log('\n🕐 Finished at:', new Date().toLocaleTimeString());
}

// Run if called directly
if (require.main === module) {
  quickPerformanceTest().catch(console.error);
}

module.exports = { quickPerformanceTest };
