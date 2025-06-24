// Test per verificare la rimozione della sezione "🚀 Actionable Insights" dal Data Explorer Agent
const { runDataExplorerAgent } = require('../src/agents/dataExplorerAgent');

async function testActionableInsightsRemoval() {
  console.log('🧪 Test: Verifica rimozione sezione Actionable Insights\n');
    // Mock tools per il test
  const mockTools = [
    {
      name: 'mcp_my-mcp-server_get_dati_csv_mcp',
      call: async (params) => {
        return {
          success: true,
          data: {
            tables: ['DataTable1', 'DataTable2'],
            table_info: {
              'DataTable1': {
                columns: ['UniversalTitle', 'Language', 'Market', 'Component', 'Channel', 'SaleDate', 'Price']
              }
            }
          }
        };
      }
    },
    {
      name: 'mcp_mcp_docker_azmcp-cosmos-database-container-item-query',
      call: async (params) => {
        // Simula dati di esempio che dovrebbero generare breakdown dettagliati
        return {
          success: true,
          data: {
            rows: [
              {
                UniversalTitle: 'Knight Rider Car Build Up - Part 1',
                Language: 'Italian',
                Market: 'EU',
                Component: 'Engine',
                Channel: 'Online',
                SaleDate: '2024-01-15',
                Price: 99.99
              },
              {
                UniversalTitle: 'Knight Rider Car Build Up - Part 2',
                Language: 'English',
                Market: 'US',
                Component: 'Body',
                Channel: 'Retail',
                SaleDate: '2024-01-20',
                Price: 149.99
              },
              {
                UniversalTitle: 'Knight Rider Car Build Up - Complete Set',
                Language: 'Spanish',
                Market: 'LATAM',
                Component: 'Complete',
                Channel: 'Online',
                SaleDate: '2024-02-01',
                Price: 299.99
              }
            ]
          }
        };
      }
    }
  ];
  
  const testCases = [
    {
      query: "Which are all the universal titles that includes the string 'Knight Rider Car Build Up'?",
      description: "Test query inglese per verifica breakdown dettagliati"
    },
    {
      query: "Quali sono tutti i titoli universali che includono la stringa 'Knight Rider Car Build Up'?",
      description: "Test query italiana per verifica breakdown dettagliati"
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`📋 Test Case: ${testCase.description}`);
    console.log(`Query: "${testCase.query}"`);
    
    try {
      const result = await runDataExplorerAgent(
        [], // messages
        mockTools,
        testCase.query,
        `test-thread-${Date.now()}`
      );
      
      if (result.success && result.formattedResponse) {
        console.log('✅ Query eseguita con successo');
        
        // Verifica che non contenga "🚀 Actionable Insights"
        const containsActionableEmojiInsights = result.formattedResponse.includes('🚀 Actionable Insights');
        const containsActionableInsights = result.formattedResponse.toLowerCase().includes('actionable insights');
        
        if (containsActionableEmojiInsights || containsActionableInsights) {
          console.log('❌ FAIL: La risposta contiene ancora riferimenti ad "Actionable Insights"');
          console.log('Contenuto trovato:', result.formattedResponse.substring(0, 500) + '...');
        } else {
          console.log('✅ PASS: Nessun riferimento ad "Actionable Insights" trovato');
        }
        
        // Verifica che contenga invece breakdown dettagliati sui dati
        const hasDataBreakdown = (
          result.formattedResponse.toLowerCase().includes('breakdown') ||
          result.formattedResponse.toLowerCase().includes('distribution') ||
          result.formattedResponse.toLowerCase().includes('analysis') ||
          result.formattedResponse.toLowerCase().includes('pattern') ||
          result.formattedResponse.toLowerCase().includes('statistic')
        );
        
        if (hasDataBreakdown) {
          console.log('✅ PASS: La risposta contiene analisi e breakdown dettagliati sui dati');
        } else {
          console.log('❌ FAIL: La risposta non contiene analisi dettagliate sui dati');
        }
        
        // Verifica che contenga sezioni pertinenti
        const hasRelevantSections = (
          result.formattedResponse.includes('📊') || // Risultati
          result.formattedResponse.includes('📈') || // Analisi statistica
          result.formattedResponse.includes('💡')    // Suggerimenti
        );
        
        if (hasRelevantSections) {
          console.log('✅ PASS: La risposta mantiene la struttura con sezioni rilevanti');
        } else {
          console.log('❌ FAIL: La risposta non ha la struttura attesa');
        }
        
        console.log('📄 Preview della risposta:');
        console.log(result.formattedResponse.substring(0, 300) + '...\n');
        
      } else {
        console.log('❌ Query fallita:', result.error || 'Errore sconosciuto');
      }
      
    } catch (error) {
      console.log('❌ Errore durante l\'esecuzione del test:', error.message);
    }
    
    console.log('─'.repeat(80));
  }
  
  console.log('\n🎯 Test completato: Verifica rimozione sezione Actionable Insights');
}

// Test delle funzioni di formattazione fallback
async function testFallbackFormatting() {
  console.log('\n🧪 Test: Verifica formattazione fallback senza Actionable Insights\n');
  
  // Test della formattazione diretta
  const mockData = [
    {
      UniversalTitle: 'Knight Rider Car Build Up - Part 1',
      Language: 'Italian',
      Market: 'EU',
      Component: 'Engine'
    },
    {
      UniversalTitle: 'Knight Rider Car Build Up - Part 2', 
      Language: 'English',
      Market: 'US',
      Component: 'Body'
    }
  ];
  
  // Test importando direttamente le funzioni di supporto (se esportate)
  try {
    const dataExplorerModule = require('../src/agents/dataExplorerAgent');
    
    console.log('✅ Modulo Data Explorer Agent caricato correttamente');
    console.log('📄 Le funzioni di formattazione interne sono state aggiornate');
      // Verifica che il codice sorgente non contenga più riferimenti ad Actionable Insights
    const fs = require('fs');
    const path = require('path');
    const sourceCode = fs.readFileSync(path.join(__dirname, '../src/agents/dataExplorerAgent.js'), 'utf8');
    
    const hasActionableInsights = sourceCode.toLowerCase().includes('actionable insights');
    
    if (hasActionableInsights) {
      console.log('❌ FAIL: Il codice sorgente contiene ancora riferimenti ad "Actionable Insights"');
    } else {
      console.log('✅ PASS: Il codice sorgente non contiene più riferimenti ad "Actionable Insights"');
    }
    
    // Verifica che ci siano i nuovi termini
    const hasDataBreakdown = (
      sourceCode.toLowerCase().includes('data breakdown') ||
      sourceCode.toLowerCase().includes('detailed analysis') ||
      sourceCode.toLowerCase().includes('data quality') ||
      sourceCode.toLowerCase().includes('data characteristics')
    );
    
    if (hasDataBreakdown) {
      console.log('✅ PASS: Il codice contiene i nuovi termini per analisi dettagliate');
    } else {
      console.log('❌ FAIL: Il codice non contiene i nuovi termini previsti');
    }
    
  } catch (error) {
    console.log('❌ Errore nel test del codice sorgente:', error.message);
  }
}

// Esegui i test
async function runAllTests() {
  console.log('🚀 Avvio test per verifica rimozione Actionable Insights\n');
  
  await testActionableInsightsRemoval();
  await testFallbackFormatting();
  
  console.log('\n✅ Tutti i test completati!');
}

// Esegui se chiamato direttamente
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testActionableInsightsRemoval,
  testFallbackFormatting,
  runAllTests
};
