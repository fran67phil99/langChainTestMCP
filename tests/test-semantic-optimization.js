// Test del nuovo sistema di ottimizzazione semantica delle query
require('dotenv').config();

const { runSqlSchemaAgent } = require('../src/agents/sqlSchemaAgent');

async function testSemanticOptimization() {
  console.log('🧪 Testing Semantic Query Optimization...');
  
  // Mock schema del database reale
  const mockSchema = {
    tables: ['dataset'],
    detailed: {
      dataset: {
        columnNames: ['ID', 'Title', 'Univ__title', 'Market', 'Channel', 'Number', 'Sell_date']
      }
    }
  };
  
  const testCases = [
    {
      name: "Richiesta titoli unici",
      query: "Vorrei sapere che titoli ho a disposizione nel dataset",
      expectedIntent: "distinct_values",
      expectedOptimization: "SELECT DISTINCT su colonne specifiche"
    },
    {
      name: "Lista generale",
      query: "Mostrami i dati del dataset",
      expectedIntent: "list",
      expectedOptimization: "SELECT * con LIMIT medio"
    },
    {
      name: "Conteggio",
      query: "Quanti record ci sono?",
      expectedIntent: "count",
      expectedOptimization: "COUNT(*) senza LIMIT"
    },
    {
      name: "Ricerca specifica",
      query: "Trova tutti i titoli che contengono Knight Rider",
      expectedIntent: "search",
      expectedOptimization: "SELECT * con WHERE LIKE"
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n📝 Test: ${testCase.name}`);
    console.log(`Query: "${testCase.query}"`);
    
    try {
      const request = {
        action: 'generate_query',
        params: {
          userIntent: testCase.query,
          schema: mockSchema,
          operation: { type: 'search' }
        }
      };
      
      const result = await runSqlSchemaAgent(request, [], 'test-thread');
      
      if (result.success) {
        console.log(`✅ Generated Query: ${result.query}`);
        if (result.optimization) {
          console.log(`🎯 Intent: ${result.optimization.intent}`);
          console.log(`🚀 Strategy: ${result.optimization.optimizationHints?.selectStrategy}`);
          console.log(`🔍 Distinct: ${result.optimization.needsDistinct}`);
        }
      } else {
        console.log(`❌ Failed: ${result.error}`);
      }
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }
  }
}

testSemanticOptimization().catch(console.error);
