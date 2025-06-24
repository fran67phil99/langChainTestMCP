// Test di formattazione dati migliorata
const { runOrchestratorOptimized } = require('../src/agents/orchestratorAgent.optimized');

async function testDataFormatting() {
  console.log('🧪 Testing improved data formatting...\n');
  
  const testQueries = [
    {
      query: "vorrei vedere i primi 5 record",
      description: "Richiesta generica di dati (italiano)"
    },
    {
      query: "show me some data",
      description: "Generic data request (english)"
    },
    {
      query: "quanti record ci sono in totale?",
      description: "Conteggio record (italiano)"
    },
    {
      query: "what tables are available?",
      description: "Schema discovery (english)"
    }
  ];
  
  for (let i = 0; i < testQueries.length; i++) {
    const test = testQueries[i];
    console.log(`\n📋 Test ${i + 1}: ${test.description}`);
    console.log(`Query: "${test.query}"`);
    console.log('─'.repeat(60));
    
    try {
      const result = await runOrchestratorOptimized(test.query, `test-formatting-${i + 1}`);
      
      console.log(`✅ Agent utilizzato: ${result.selectedAgent}`);
      
      if (result.finalResponse) {
        console.log('\n📊 RISPOSTA FORMATTATA:');
        console.log(result.finalResponse);
        
        // Controllo che non ci sia JSON grezzo
        const hasRawJson = result.finalResponse.includes('```json') || result.finalResponse.includes('"id":') || result.finalResponse.includes('"name":');
        
        if (hasRawJson) {
          console.log('\n⚠️  WARNING: La risposta potrebbe ancora contenere JSON grezzo');
        } else {
          console.log('\n✅ BUONO: Nessun JSON grezzo rilevato nella risposta');
        }
      } else {
        console.log('\n❌ ERROR: Nessuna finalResponse ricevuta');
      }
      
    } catch (error) {
      console.error(`❌ Test ${i + 1} fallito:`, error.message);
    }
    
    console.log('\n' + '═'.repeat(80));
  }
  
  console.log('\n🎯 TEST COMPLETATO - Verifica le risposte sopra per confermare che non ci siano più JSON grezzi');
}

// Esegui il test
if (require.main === module) {
  testDataFormatting().catch(console.error);
}

module.exports = { testDataFormatting };
