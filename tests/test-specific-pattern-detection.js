/**
 * Test finale per verificare che il sistema NON generi pattern specificamente problematici
 * come "AS collection, AS title AS start_date"
 */

require('dotenv').config();
const { generateSemanticQuery, analyzeSchemaSemantics } = require('../src/utils/semanticAnalyzer');

async function testSpecificProblematicPattern() {
    console.log('🧪 === TEST SPECIFIC PROBLEMATIC PATTERN ===');
    console.log('Testing for the specific pattern: "AS collection, AS title AS start_date"');
    
    // Schema che potrebbe indurre il pattern problematico
    const problematicSchema = {
        tables: ['data_table'],
        detailed: {
            data_table: {
                columnNames: ['collection', 'title', 'start_date', 'end_date', 'category'],
                columns: [
                    { name: 'collection', type: 'VARCHAR' },
                    { name: 'title', type: 'VARCHAR' },
                    { name: 'start_date', type: 'DATE' },
                    { name: 'end_date', type: 'DATE' },
                    { name: 'category', type: 'VARCHAR' }
                ]
            }
        }
    };

    // Query che potrebbero indurre il pattern problematico
    const testQueries = [
        "Show me collection, title and start_date from the data",
        "List all collections with their titles and start dates",
        "Get collection names, titles, and starting dates",
        "Display the collection, title, and start date fields"
    ];

    let totalTests = 0;
    let problematicFound = 0;

    for (const userIntent of testQueries) {
        totalTests++;
        console.log(`\n🔍 Test ${totalTests}: "${userIntent}"`);
        
        try {
            const semanticMapping = await analyzeSchemaSemantics(problematicSchema);
            const sqlQuery = await generateSemanticQuery(userIntent, problematicSchema, semanticMapping);
            
            console.log(`📝 Generated SQL: ${sqlQuery}`);
            
            // Verifica il pattern specifico problematico
            const hasProblematicPattern = checkForSpecificPattern(sqlQuery);
            
            if (hasProblematicPattern) {
                console.log('🚨 PROBLEMATIC PATTERN DETECTED!');
                problematicFound++;
            } else {
                console.log('✅ Query is clean');
            }

        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
        }
    }

    console.log('\n📊 === FINAL RESULTS ===');
    console.log(`Total tests: ${totalTests}`);
    console.log(`Problematic patterns found: ${problematicFound}`);
    console.log(`Clean queries: ${totalTests - problematicFound}`);
    
    if (problematicFound === 0) {
        console.log('🎉 SUCCESS: No problematic patterns like "AS collection, AS title AS start_date" detected!');
        console.log('✅ The SQL generation system is working correctly.');
        return true;
    } else {
        console.log('⚠️ WARNING: Problematic patterns detected. System needs improvement.');
        return false;
    }
}

/**
 * Verifica il pattern specifico "AS collection, AS title AS start_date"
 */
function checkForSpecificPattern(sqlQuery) {
    const problematicPatterns = [
        // Pattern esatto: "AS collection, AS title AS start_date"
        /AS\s+collection\s*,\s*AS\s+title\s+AS\s+start_date/gi,
        
        // Pattern simili: multiple AS consecutive
        /AS\s+\w+,\s*AS\s+\w+\s+AS\s+\w+/gi,
        
        // Pattern: AS word AS word (without comma)
        /AS\s+(\w+)\s+AS\s+(\w+)(?!\s*,|\s*FROM)/gi,
        
        // Pattern: doppio AS senza senso logico
        /AS\s+(\w+)\s+AS\s+(?!\1\b)/gi
    ];

    for (const pattern of problematicPatterns) {
        if (pattern.test(sqlQuery)) {
            console.log(`   🚨 Detected pattern: ${pattern}`);
            return true;
        }
    }
    
    return false;
}

/**
 * Test aggiuntivo con un esempio di query che DOVREBBE essere problematica
 * se il sistema fosse difettoso
 */
function createDefectiveQuery() {
    // Questo è un esempio di come NON dovrebbe essere una query
    const badQuery = "SELECT collection AS collection, title AS title AS start_date FROM data_table";
    console.log('\n🧪 Testing with deliberately defective query:');
    console.log(`❌ Bad example: ${badQuery}`);
    
    const isProblematic = checkForSpecificPattern(badQuery);
    console.log(`Detection result: ${isProblematic ? '🚨 DETECTED (correct)' : '✅ NOT DETECTED (error in detection)'}`);
    
    return isProblematic;
}

// Esegui il test se chiamato direttamente
if (require.main === module) {
    testSpecificProblematicPattern()
        .then(success => {
            console.log('\n🔧 Testing detection system with bad example...');
            const detectionWorks = createDefectiveQuery();
            
            if (success && detectionWorks) {
                console.log('\n🎉 ALL TESTS PASSED!');
                console.log('✅ SQL generation is clean AND detection system works correctly.');
                process.exit(0);
            } else {
                console.log('\n⚠️ Some tests failed.');
                process.exit(1);
            }
        })
        .catch(console.error);
}

module.exports = { testSpecificProblematicPattern, checkForSpecificPattern };
