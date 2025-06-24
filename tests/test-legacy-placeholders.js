// Test per verificare che il SQL Schema Agent non generi placeholder legacy
const { runSqlSchemaAgent } = require('../src/agents/sqlSchemaAgent');

async function testLegacyPlaceholders() {
  console.log('\n🧪 Testing SQL Schema Agent - Legacy Placeholder Detection\n');
  
  try {
    // Simula schema con colonne reali
    const mockSchema = {
      tables: ['dataset'],
      detailed: {
        'dataset': {
          columnNames: ['id', 'Title', 'Univ__title', 'Market', 'Comp__Silce', 'Issue'],
          rowCount: 19907
        }
      }
    };
    
    // Test queries che potrebbero generare placeholder
    const testQueries = [
      "Search for products with Back to the Future",
      "Find all titles containing Knight Rider", 
      "Show me universal titles",
      "Get data about Rome",
      "Find component code 808647"
    ];
    
    console.log('📋 Testing queries for legacy placeholder generation...\n');
    
    for (const query of testQueries) {
      console.log(`🔍 Testing: "${query}"`);
      
      try {
        const result = await runSqlSchemaAgent({
          action: 'generate_query',
          userIntent: query,
          schema: mockSchema,
          operation: { type: 'search', parameters: { searchTerm: query } }
        }, 'test-legacy-' + Date.now());
        
        const sqlQuery = result.optimizedQuery || result.error || 'No query generated';
        
        // Check for legacy placeholders
        const hasLegacyPlaceholders = /dataset_column_name|table_column/g.test(sqlQuery);
        
        if (hasLegacyPlaceholders) {
          console.log('❌ FOUND LEGACY PLACEHOLDERS in generated query:');
          console.log('   Query:', sqlQuery);
        } else {
          console.log('✅ No legacy placeholders found');
        }
        
        console.log('   Generated SQL:', sqlQuery.substring(0, 100) + '...');
        console.log();
        
      } catch (error) {
        console.log('❌ Error generating query:', error.message);
        console.log();
      }
    }
    
    console.log('🎉 Legacy Placeholder Test Complete!');
    console.log('\n📊 Summary:');
    console.log('   - If you see any "❌ FOUND LEGACY PLACEHOLDERS" above, the prompt needs improvement');
    console.log('   - All queries should use real column names like "Univ__title", "Title", etc.');
    console.log('   - The legacy fallback code should rarely (if ever) trigger');
    
  } catch (error) {
    console.error('❌ Legacy Placeholder Test Error:', error);
    throw error;
  }
}

// Test per verificare che la sostituzione funzioni se mai dovesse servire
function testLegacyReplacementLogic() {
  console.log('\n🧪 Testing Legacy Replacement Logic\n');
  
  const mockColumnNames = ['id', 'Title', 'Univ__title', 'Market'];
  
  // Simula query con placeholder legacy
  const testCases = [
    {
      input: "SELECT * FROM dataset WHERE dataset_column_name LIKE '%test%'",
      expected: "SELECT * FROM dataset WHERE Title LIKE '%test%'"
    },
    {
      input: "SELECT table_column FROM dataset LIMIT 10",
      expected: "SELECT Title FROM dataset LIMIT 10"
    },
    {
      input: "SELECT * FROM dataset WHERE dataset_column_name = 'value' AND table_column IS NOT NULL",
      expected: "SELECT * FROM dataset WHERE Title = 'value' AND Title IS NOT NULL"
    }
  ];
  
  testCases.forEach((testCase, index) => {
    // Simula la logica di sostituzione
    const titleColumn = mockColumnNames.find(col => 
      col.toLowerCase().includes('title') || 
      col.toLowerCase().includes('univ') ||
      col.toLowerCase().includes('name')
    ) || mockColumnNames[0];
    
    const result = testCase.input.replace(/dataset_column_name|table_column/g, titleColumn);
    
    const passed = result === testCase.expected;
    console.log(`${passed ? '✅' : '❌'} Test ${index + 1}: Legacy replacement`);
    console.log(`   Input:    "${testCase.input}"`);
    console.log(`   Expected: "${testCase.expected}"`);
    console.log(`   Got:      "${result}"`);
    console.log(`   Column used: "${titleColumn}"`);
    console.log();
  });
}

// Esegui i test
async function runAllTests() {
  console.log('🚀 Starting Legacy Placeholder Tests...\n');
  
  // Test replacement logic (synchronous)
  testLegacyReplacementLogic();
  
  // Test actual SQL generation (asynchronous)
  await testLegacyPlaceholders();
  
  console.log('\n✅ All Legacy Placeholder Tests Completed!');
}

// Esegui se chiamato direttamente
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { testLegacyPlaceholders, testLegacyReplacementLogic };
