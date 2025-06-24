/**
 * Test del routing dell'orchestrator per la query problematica
 */

// Simula la funzione shouldUseDataExplorer dell'orchestrator
function shouldUseDataExplorer(userInput, mcpTools) {
  const query = userInput.toLowerCase();
  
  // Pattern per richieste di esplorazione dati (aggiornati)
  const dataExplorationPatterns = [
    // Ricerca Specifica di Titoli/Contenuti - NUOVO
    /\b(which|what|quali|che).+(are|all).+(title|titol).+(include|contain|with)/i,
    /\b(find|trova|search|cerca).+(all|tutt[ei]).+(title|titol)/i,
    /\b(universal|universal).+(title|titol).+(include|contain|with)/i,
    /\b(title|titol).+(that|che).+(include|contain|with)/i,
    /\b(all).+(data|dati|record).+(with|include|contain)/i,
    /\b(show me|mostra).+(all|tutt[ei]).+(data|dati|record)/i,
    
    // Pattern originali
    /\b(mostra|show|visualizza|display).+(prim[ei]|first|dati|data|righe|rows)/i,
    /\b(cerca|search|trova|find).+(in|nel|dentro|within).+(database|dati|data)/i,
    /\b(search|find|look for).+(in|within).+(database|data)/i,
  ];
  
  // Verifica se ci sono tool di database disponibili
  const hasDataTools = mcpTools.some(tool => 
    tool.name.includes('database') || 
    tool.name.includes('sql') || 
    tool.name.includes('query') ||
    tool.name.includes('data') ||
    tool.name.includes('csv')
  );
  
  const matchesPattern = dataExplorationPatterns.some(pattern => {
    const match = pattern.test(query);
    if (match) {
      console.log(`✅ Matched pattern: ${pattern}`);
    }
    return match;
  });
  
  // Verifica aggiuntiva per query che contengono stringhe quotate o nomi di prodotti
  const hasQuotedString = /'[^']+'/i.test(query) || /"[^"]+"/i.test(query);
  const containsProductNames = /\b(back to the future|delorean|knight rider|batman|superman|marvel|dc|build up|collection|minibook|novels)\b/i.test(query);
  const isSearchQuery = /\b(which|what|find|search|look for|show|display|get|retrieve)\b/i.test(query);
  
  if (matchesPattern && hasDataTools) {
    console.log('🔍 Data Explorer Pattern: Richiesta di esplorazione dati rilevata');
    return true;
  }
  
  // Rileva query di ricerca con stringhe specifiche o prodotti
  if (hasDataTools && isSearchQuery && (hasQuotedString || containsProductNames)) {
    console.log('🔍 Data Explorer Pattern: Richiesta di ricerca prodotto/stringa rilevata');
    return true;
  }
  
  return false;
}

// Mock MCP tools (simula tool di database disponibili)
const mockMcpTools = [
  { name: 'query_database', description: 'Execute SQL queries' },
  { name: 'list_tables', description: 'List database tables' },
  { name: 'import_excel', description: 'Import Excel data' }
];

// Test con le query problematiche
const testQueries = [
  "Which are all the universal titles that include the string 'Minibook Novels'",
  "Which are all the universal titles that include the string 'Back to the Future Delorean Build Up'",
  "Find all titles with 'Batman'",
  "Show me all data with Marvel",
  "Search for records containing 'Superman'",
  "What are the titles that include Knight Rider"
];

console.log('🧪 Testing orchestrator routing patterns...\n');

testQueries.forEach((query, index) => {
  console.log(`\n📋 Test ${index + 1}: "${query}"`);
  console.log('Query lowercase:', query.toLowerCase());
  
  const shouldRoute = shouldUseDataExplorer(query, mockMcpTools);
  
  console.log(`Result: ${shouldRoute ? '✅ ROUTES TO DATA EXPLORER' : '❌ ROUTES TO GENERAL AGENT'}`);
  console.log('─'.repeat(80));
});

console.log('\n🎯 Summary: All queries should route to Data Explorer Agent');
