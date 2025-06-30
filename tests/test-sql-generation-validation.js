/**
 * Test per validare la generazione SQL semantica e identificare problemi con alias e colonne
 */

require('dotenv').config();
const { analyzeSchemaSemantics, generateSemanticQuery, analyzeUserIntentSemantics } = require('../src/utils/semanticAnalyzer');

async function testSqlGenerationValidation() {
    console.log('🧪 === TEST SQL GENERATION VALIDATION ===');
    
    // Schema di test simulato
    const testSchema = {
        tables: ['comics', 'sales', 'issues'],
        detailed: {
            comics: {
                columnNames: ['id', 'title', 'collection_name', 'publisher', 'created_date'],
                columns: [
                    { name: 'id', type: 'INTEGER' },
                    { name: 'title', type: 'VARCHAR' },
                    { name: 'collection_name', type: 'VARCHAR' },
                    { name: 'publisher', type: 'VARCHAR' },
                    { name: 'created_date', type: 'DATE' }
                ]
            },
            sales: {
                columnNames: ['id', 'comic_id', 'sale_date', 'price', 'quantity'],
                columns: [
                    { name: 'id', type: 'INTEGER' },
                    { name: 'comic_id', type: 'INTEGER' },
                    { name: 'sale_date', type: 'DATE' },
                    { name: 'price', type: 'DECIMAL' },
                    { name: 'quantity', type: 'INTEGER' }
                ]
            },
            issues: {
                columnNames: ['id', 'comic_id', 'issue_number', 'publication_date'],
                columns: [
                    { name: 'id', type: 'INTEGER' },
                    { name: 'comic_id', type: 'INTEGER' },
                    { name: 'issue_number', type: 'INTEGER' },
                    { name: 'publication_date', type: 'DATE' }
                ]
            }
        }
    };

    // Test queries che potrebbero causare problemi
    const testQueries = [
        "Show me all comics and their collections",
        "List all universal titles",
        "Get the latest sales dates for each comic",
        "Show all employees and interns at Mauden",
        "Find all comic collections with their issue counts"
    ];

    for (const userIntent of testQueries) {
        console.log(`\n🔍 Testing query: "${userIntent}"`);
        
        try {
            // Step 1: Analisi semantica dello schema
            console.log('📊 Analyzing schema semantics...');
            const semanticMapping = await analyzeSchemaSemantics(testSchema);
            console.log('Semantic mapping:', JSON.stringify(semanticMapping, null, 2));

            // Step 2: Analisi dell'intent dell'utente
            console.log('🧠 Analyzing user intent...');
            const intentAnalysis = await analyzeUserIntentSemantics(userIntent);
            console.log('Intent analysis:', JSON.stringify(intentAnalysis, null, 2));

            // Step 3: Generazione della query SQL
            console.log('⚡ Generating SQL query...');
            const sqlQuery = await generateSemanticQuery(userIntent, testSchema, semanticMapping);
            console.log(`📝 Generated SQL: ${sqlQuery}`);

            // Step 4: Validazione della sintassi SQL
            console.log('✅ Validating SQL syntax...');
            const validationResult = validateSqlSyntax(sqlQuery, testSchema);
            
            if (validationResult.isValid) {
                console.log('✅ SQL syntax is valid');
            } else {
                console.log('❌ SQL syntax issues found:');
                validationResult.issues.forEach(issue => {
                    console.log(`   - ${issue}`);
                });
            }

        } catch (error) {
            console.error(`❌ Error testing query "${userIntent}": ${error.message}`);
        }
    }
}

/**
 * Valida la sintassi SQL e verifica problemi comuni
 */
function validateSqlSyntax(sqlQuery, schema) {
    const issues = [];
    let isValid = true;

    // Controlla pattern problematici negli alias
    const aliasPatterns = [
        {
            pattern: /AS\s+\w+,\s*AS\s+\w+\s+AS\s+\w+/gi,
            description: 'Multiple consecutive AS aliases (AS col1, AS col2 AS col3)'
        },
        {
            pattern: /AS\s+(\w+)\s+AS\s+(\w+)/gi,
            description: 'Double AS aliases (AS col1 AS col2)'
        },
        {
            pattern: /,\s*AS\s+(\w+)(?=\s*,(?!\s*\w+\s+AS))/gi,
            description: 'AS followed directly by comma without table reference'
        }
    ];

    aliasPatterns.forEach((aliasCheck, index) => {
        if (aliasCheck.pattern.test(sqlQuery)) {
            issues.push(`Problematic alias pattern detected: ${aliasCheck.description}`);
            isValid = false;
        }
    });

    // Keywords SQL che non sono nomi di colonne
    const sqlKeywords = new Set([
        'distinct', 'count', 'max', 'min', 'sum', 'avg', 'group_concat',
        'select', 'from', 'where', 'join', 'inner', 'left', 'right', 'outer',
        'group', 'by', 'order', 'having', 'union', 'as', 'on', 'and', 'or'
    ]);

    // Crea set di colonne disponibili con alias di tabella
    const availableColumns = new Set();
    const tableAliases = new Map();
    
    // Estrae alias di tabella dalla query
    const tableAliasMatches = sqlQuery.match(/FROM\s+(\w+)\s+(\w+)|JOIN\s+(\w+)\s+(\w+)/gi);
    if (tableAliasMatches) {
        tableAliasMatches.forEach(match => {
            const parts = match.split(/\s+/);
            if (parts.length >= 3) {
                const tableName = parts[1].toLowerCase();
                const alias = parts[2].toLowerCase();
                tableAliases.set(alias, tableName);
            }
        });
    }

    Object.entries(schema.detailed || {}).forEach(([tableName, tableInfo]) => {
        if (tableInfo.columnNames) {
            tableInfo.columnNames.forEach(col => {
                availableColumns.add(col.toLowerCase());
                availableColumns.add(`${tableName}.${col}`.toLowerCase());
                
                // Aggiungi anche per alias di tabella
                tableAliases.forEach((realTable, alias) => {
                    if (realTable === tableName.toLowerCase()) {
                        availableColumns.add(`${alias}.${col}`.toLowerCase());
                    }
                });
            });
        }
    });

    // Analisi più sofisticata delle colonne nella SELECT
    const selectPart = sqlQuery.match(/SELECT\s+(.*?)\s+FROM/is);
    if (selectPart) {
        const selectClause = selectPart[1];
        
        // Prima estrae tutti gli alias definiti nella query
        const definedAliases = new Set();
        
        // Estrae alias delle colonne semplici: column AS alias
        const simpleAliasMatches = selectClause.match(/\b\w+(?:\.\w+)?\s+AS\s+(\w+)/gi);
        if (simpleAliasMatches) {
            simpleAliasMatches.forEach(match => {
                const alias = match.match(/AS\s+(\w+)/i)[1];
                definedAliases.add(alias.toLowerCase());
            });
        }
        
        // Estrae alias delle funzioni aggregate: FUNCTION(column) AS alias
        const aggregateAliasMatches = selectClause.match(/(?:COUNT|MAX|MIN|SUM|AVG)\s*\([^)]*\)\s+AS\s+(\w+)/gi);
        if (aggregateAliasMatches) {
            aggregateAliasMatches.forEach(match => {
                const alias = match.match(/AS\s+(\w+)/i)[1];
                definedAliases.add(alias.toLowerCase());
            });
        }
        
        // Rimuove funzioni aggregate e loro contenuti
        const cleanedSelect = selectClause.replace(/\b(COUNT|MAX|MIN|SUM|AVG|DISTINCT)\s*\([^)]*\)/gi, '');
        
        // Estrae i nomi delle colonne (escludendo AS e alias)
        const columnReferences = cleanedSelect.match(/\b([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)\b/g);
        
        if (columnReferences) {
            columnReferences.forEach(ref => {
                const cleanRef = ref.toLowerCase().trim();
                
                // Salta keywords SQL, alias definiti nella query e wildcard
                if (sqlKeywords.has(cleanRef) || cleanRef === '*' || definedAliases.has(cleanRef)) {
                    return;
                }
                
                // Controlla se la colonna esiste
                if (!availableColumns.has(cleanRef)) {
                    issues.push(`Column '${cleanRef}' not found in schema`);
                    isValid = false;
                }
            });
        }
    }

    // Controlla sintassi SQL di base
    if (!sqlQuery.trim().toLowerCase().startsWith('select')) {
        issues.push('Query should start with SELECT');
        isValid = false;
    }

    // Controlla bilanciamento parentesi
    const openParens = (sqlQuery.match(/\(/g) || []).length;
    const closeParens = (sqlQuery.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
        issues.push('Unbalanced parentheses in query');
        isValid = false;
    }

    return { isValid, issues };
}

// Esegui il test se chiamato direttamente
if (require.main === module) {
    testSqlGenerationValidation().catch(console.error);
}

module.exports = { testSqlGenerationValidation, validateSqlSyntax };
