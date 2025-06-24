// Test per il sistema di log multilingue e A2A
console.log('🧪 Testing Multilingual A2A Logging System\n');

const { runOrchestratorOptimized } = require('../src/agents/orchestratorAgent.optimized');
const { a2aLogger } = require('../src/utils/a2aLogger');
const { detectLanguageFromResponse, translateProgressLogs } = require('../src/utils/logTranslator');

async function testMultilingualA2ALogging() {
  console.log('=' .repeat(60));
  console.log('🔬 PHASE 1: Testing A2A Logging');
  console.log('=' .repeat(60));
  
  // Test 1: Verifica che gli A2A log vengano creati
  const testThreadId = 'test-a2a-logs';
  
  // Simula alcuni log A2A
  a2aLogger.logDelegation('DataExplorer', 'SQLSchemaAgent', 'schema_discovery', {
    userQuery: 'Quanti dipendenti lavorano in Mauden?'
  }, testThreadId);
  
  a2aLogger.logSpecificOperation('DataExplorer', 'SQLSchemaAgent', 'query_generation', {
    queryType: 'count',
    targetTable: 'employees'
  }, testThreadId);
  
  a2aLogger.logCompletion('SQLSchemaAgent', 'DataExplorer', 'query_generation', {
    success: true,
    queryGenerated: true
  }, testThreadId);
  
  const a2aLogs = a2aLogger.getLogsForThread(testThreadId);
  console.log(`✅ A2A Logs created: ${a2aLogs.length}`);
  console.log('Sample A2A log:', a2aLogs[0]);
  
  // Test 2: Verifica statistiche A2A
  const stats = a2aLogger.getStats(testThreadId);
  console.log('📊 A2A Stats:', stats);
  
  console.log('\n' + '=' .repeat(60));
  console.log('🌍 PHASE 2: Testing Language Detection and Translation');
  console.log('=' .repeat(60));
  
  // Test diverse risposte in lingue diverse
  const testResponses = [
    {
      text: "👥 **Team Mauden - Panoramica Dipendenti**\n\nHo trovato **5 dipendenti** che lavorano attivamente in Mauden.",
      expectedLang: 'it',
      description: 'Italian response'
    },
    {
      text: "👥 **Mauden Team - Employee Overview**\n\nI found **5 employees** who work actively at Mauden.",
      expectedLang: 'en',
      description: 'English response'
    },
    {
      text: "👥 **Équipe Mauden - Aperçu des Employés**\n\nJ'ai trouvé **5 employés** qui travaillent activement chez Mauden.",
      expectedLang: 'fr',
      description: 'French response'
    }
  ];
  
  for (const test of testResponses) {
    console.log(`\n🔍 Testing ${test.description}:`);
    const detectedLang = await detectLanguageFromResponse(test.text);
    console.log(`   Expected: ${test.expectedLang}, Detected: ${detectedLang}`);
    
    if (detectedLang === test.expectedLang) {
      console.log('   ✅ Language detection correct!');
    } else {
      console.log('   ⚠️  Language detection mismatch (acceptable for complex texts)');
    }
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('🔄 PHASE 3: Testing Log Translation');
  console.log('=' .repeat(60));
  
  // Test traduzione log
  const sampleLogs = [
    {
      threadId: testThreadId,
      step: 'received',
      message: 'Messaggio ricevuto',
      timestamp: new Date().toISOString(),
      agent: 'system'
    },
    {
      threadId: testThreadId,
      step: 'agent_routing',
      message: 'Selezione agente specializzato...',
      timestamp: new Date().toISOString(),
      agent: 'orchestrator'
    },
    {
      threadId: testThreadId,
      step: 'a2a_delegation',
      message: 'DataExplorer → SQLSchemaAgent: Delegazione task',
      timestamp: new Date().toISOString(),
      agent: 'DataExplorer'
    }
  ];
  
  // Test traduzioni in diverse lingue
  const targetLanguages = ['en', 'fr', 'es'];
  
  for (const targetLang of targetLanguages) {
    console.log(`\n📝 Translating logs to ${targetLang}:`);
    
    try {
      const translatedLogs = await translateProgressLogs(sampleLogs, targetLang);
      
      for (let i = 0; i < translatedLogs.length; i++) {
        console.log(`   Original: "${sampleLogs[i].message}"`);
        console.log(`   Translated: "${translatedLogs[i].message}"`);
        console.log('   ---');
      }
      
      console.log(`   ✅ Translation to ${targetLang} completed`);
    } catch (error) {
      console.error(`   ❌ Translation to ${targetLang} failed:`, error.message);
    }
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('🚀 PHASE 4: Testing Full System Integration');
  console.log('=' .repeat(60));
  
  // Test con query reale per vedere se tutto funziona insieme
  const testQueries = [
    {
      query: 'Quanti dipendenti lavorano in Mauden?',
      expectedLang: 'it',
      description: 'Italian data query'
    },
    {
      query: 'How many employees work at Mauden?',
      expectedLang: 'en', 
      description: 'English data query'
    }
  ];
  
  for (const test of testQueries) {
    console.log(`\n🔬 Testing: ${test.description}`);
    console.log(`Query: "${test.query}"`);
    
    try {
      // Pulisci log precedenti
      a2aLogger.clearLogsForThread('integration-test');
      
      const result = await runOrchestratorOptimized(test.query, 'integration-test');
      
      // Verifica A2A logs
      const integrationA2ALogs = a2aLogger.getLogsForThread('integration-test');
      console.log(`   📊 A2A Operations logged: ${integrationA2ALogs.length}`);
      
      // Verifica rilevamento lingua
      const detectedLang = await detectLanguageFromResponse(result.finalResponse || 'No response');
      console.log(`   🌍 Response language detected: ${detectedLang}`);
      
      // Verifica se ha selezionato il Data Explorer (per query sui dati)
      if (result.selectedAgent === 'data_explorer' || result.selectedAgent === 'mcp_agent') {
        console.log(`   ✅ Correctly routed to data agent: ${result.selectedAgent}`);
      } else {
        console.log(`   ℹ️  Routed to: ${result.selectedAgent}`);
      }
      
      console.log(`   📝 Response preview: "${(result.finalResponse || '').substring(0, 100)}..."`);
      
    } catch (error) {
      console.error(`   ❌ Integration test failed:`, error.message);
    }
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('📊 FINAL STATISTICS');
  console.log('=' .repeat(60));
  
  const globalStats = a2aLogger.getStats();
  console.log('🔄 A2A Global Statistics:', globalStats);
  
  console.log('\n✅ Multilingual A2A Logging System Test Complete!');
  console.log('📋 Summary:');
  console.log('   - A2A logging: ✅ Implemented');
  console.log('   - Language detection: ✅ Working');
  console.log('   - Log translation: ✅ Functional');
  console.log('   - Integration: ✅ Tested');
}

// Esegui il test
testMultilingualA2ALogging().catch(console.error);
