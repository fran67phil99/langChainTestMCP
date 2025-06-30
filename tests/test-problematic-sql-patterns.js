/**
 * Test specifico per identificare pattern problematici nelle query SQL generate
 */

require('dotenv').config();
const { generateSemanticQuery, analyzeSchemaSemantics } = require('../src/utils/semanticAnalyzer');

async function testProblematicPatterns() {
    console.log('🧪 === TEST PROBLEMATIC SQL PATTERNS ===');
    
    // Schema complesso che potrebbe causare problemi di aliasing
    const complexSchema = {
        tables: ['universal_titles', 'publication_dates', 'collections', 'sales_data'],
        detailed: {
            universal_titles: {
                columnNames: ['id', 'title', 'collection_id', 'universal_code', 'start_date'],
                columns: [
                    { name: 'id', type: 'INTEGER' },
                    { name: 'title', type: 'VARCHAR' },
                    { name: 'collection_id', type: 'INTEGER' },
                    { name: 'universal_code', type: 'VARCHAR' },
                    { name: 'start_date', type: 'DATE' }
                ]
            },
            collections: {
                columnNames: ['id', 'collection', 'category', 'start_date', 'end_date'],
                columns: [
                    { name: 'id', type: 'INTEGER' },
                    { name: 'collection', type: 'VARCHAR' },
                    { name: 'category', type: 'VARCHAR' },
                    { name: 'start_date', type: 'DATE' },
                    { name: 'end_date', type: 'DATE' }
                ]
            },
            publication_dates: {
                columnNames: ['id', 'title_id', 'publication_date', 'issue_date'],
                columns: [
                    { name: 'id', type: 'INTEGER' },
                    { name: 'title_id', type: 'INTEGER' },
                    { name: 'publication_date', type: 'DATE' },
                    { name: 'issue_date', type: 'DATE' }
                ]
            }
        }
    };

    // Query che potrebbero causare pattern problematici
    const problematicQueries = [
        "Show all collection titles with their start dates",
        "List universal titles by collection and start date",
        "Get all collections with their categories and date ranges",
        "Show publication dates for each title by collection",
        "Find all universal collections with their latest publication dates"
    ];

    const validationResults = {
        totalQueries: problematicQueries.length,
        validQueries: 0,
        problematicPatterns: [],
        issues: []
    };

    for (const userIntent of problematicQueries) {
        console.log(`\n🔍 Testing potentially problematic query: "${userIntent}"`);
        
        try {
            // Analisi semantica
            const semanticMapping = await analyzeSchemaSemantics(complexSchema);
            
            // Generazione query
            const sqlQuery = await generateSemanticQuery(userIntent, complexSchema, semanticMapping);
            console.log(`📝 Generated SQL: ${sqlQuery}`);
            
            // Verifica pattern problematici specifici
            const issues = checkProblematicPatterns(sqlQuery);
            
            if (issues.length === 0) {
                console.log('✅ Query is clean - no problematic patterns detected');
                validationResults.validQueries++;
            } else {
                console.log('⚠️ Problematic patterns detected:');
                issues.forEach(issue => {
                    console.log(`   - ${issue}`);
                    validationResults.issues.push({ query: userIntent, issue });
                });
                validationResults.problematicPatterns.push({ query: userIntent, sql: sqlQuery, issues });
            }

        } catch (error) {
            console.error(`❌ Error generating query: ${error.message}`);
            validationResults.issues.push({ query: userIntent, issue: `Generation error: ${error.message}` });
        }
    }

    // Riepilogo dei risultati
    console.log('\n📊 === VALIDATION SUMMARY ===');
    console.log(`Total queries tested: ${validationResults.totalQueries}`);
    console.log(`Valid queries: ${validationResults.validQueries}`);
    console.log(`Queries with issues: ${validationResults.totalQueries - validationResults.validQueries}`);
    
    if (validationResults.problematicPatterns.length > 0) {
        console.log('\n🚨 PROBLEMATIC PATTERNS FOUND:');
        validationResults.problematicPatterns.forEach((pattern, index) => {
            console.log(`\n${index + 1}. Query: "${pattern.query}"`);
            console.log(`   SQL: ${pattern.sql}`);
            console.log(`   Issues: ${pattern.issues.join(', ')}`);
        });
    } else {
        console.log('\n✅ No problematic patterns detected in any generated queries!');
    }

    return validationResults;
}

/**
 * Verifica pattern problematici specifici nelle query SQL
 */
function checkProblematicPatterns(sqlQuery) {
    const issues = [];
    
    // Pattern 1: Multiple consecutive AS (AS col1, AS col2 AS col3) - REALE PROBLEMA
    if (/AS\s+\w+,\s*AS\s+\w+\s+AS\s+\w+/gi.test(sqlQuery)) {
        issues.push('Multiple consecutive AS aliases detected (AS col1, AS col2 AS col3)');
    }
    
    // Pattern 2: Double AS senza virgola (AS col1 AS col2) - REALE PROBLEMA
    if (/AS\s+\w+\s+AS\s+\w+(?!\s*,)/gi.test(sqlQuery)) {
        issues.push('Double AS aliases without comma detected (AS col1 AS col2)');
    }
    
    // Pattern 3: VERO pattern problematico da "AS collection, AS title AS start_date"
    if (/AS\s+\w+,\s*AS\s+\w+(?:\s+AS\s+\w+)+/gi.test(sqlQuery)) {
        issues.push('Complex problematic alias pattern detected (like "AS collection, AS title AS start_date")');
    }
    
    // Pattern 4: Alias replicato (stesso alias usato due volte)
    const aliasMatches = sqlQuery.match(/AS\s+(\w+)/gi);
    if (aliasMatches) {
        const aliases = aliasMatches.map(match => match.match(/AS\s+(\w+)/i)[1].toLowerCase());
        const duplicates = aliases.filter((alias, index) => aliases.indexOf(alias) !== index);
        if (duplicates.length > 0) {
            issues.push(`Duplicate aliases detected: ${[...new Set(duplicates)].join(', ')}`);
        }
    }
    
    // Pattern 5: JOIN queries con column references ambigue (solo se realmente ambigue)
    if (sqlQuery.includes('JOIN')) {
        // Cerca colonne senza prefisso di tabella nelle JOIN queries, che potrebbero essere ambigue
        const selectPart = sqlQuery.match(/SELECT\s+(.*?)\s+FROM/is);
        if (selectPart) {
            const selectClause = selectPart[1];
            // Rimuovi funzioni aggregate e DISTINCT
            const cleanSelect = selectClause.replace(/(?:COUNT|MAX|MIN|SUM|AVG|DISTINCT)\s*\([^)]*\)/gi, '');
            
            // Cerca colonne senza prefisso e che non sono wildcard o alias
            const unprefixedColumns = cleanSelect.match(/(?:^|,)\s*(\w+)(?:\s+AS\s+\w+)?(?=\s*,|\s*$)/gi);
            if (unprefixedColumns && unprefixedColumns.length > 0) {
                const suspiciousColumns = unprefixedColumns.filter(col => {
                    const cleanCol = col.replace(/^,?\s*/, '').replace(/\s+AS.*$/i, '').trim();
                    return cleanCol !== '*' && !cleanCol.includes('.');
                });
                
                if (suspiciousColumns.length > 2) { // Solo se ci sono molte colonne senza prefisso
                    issues.push('Multiple unprefixed columns in JOIN query - potential ambiguity');
                }
            }
        }
    }
    
    // Pattern 6: Sintassi SQL malformata generale
    const parenthesesOpen = (sqlQuery.match(/\(/g) || []).length;
    const parenthesesClose = (sqlQuery.match(/\)/g) || []).length;
    if (parenthesesOpen !== parenthesesClose) {
        issues.push('Unbalanced parentheses detected');
    }
    
    return issues;
}

// Esegui il test se chiamato direttamente
if (require.main === module) {
    testProblematicPatterns()
        .then(results => {
            process.exit(results.problematicPatterns.length === 0 ? 0 : 1);
        })
        .catch(console.error);
}

module.exports = { testProblematicPatterns, checkProblematicPatterns };
