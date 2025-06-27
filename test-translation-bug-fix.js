// Test specifico per verificare la risoluzione del bug "non definito"
const { runOrchestration } = require('./src/agents/orchestratorAgent.optimized');

async function testTranslationBugFix() {
    console.log('🧪 Testing Translation Bug Fix...\n');
    
    const testCases = [
        {
            name: "Italian query - normal case",
            query: "Ciao, come stai?",
            expectedPatterns: {
                avoid: ['non definito', 'undefined', 'null', 'NaN'],
                require: ['italian_response_pattern']
            }
        },
        {
            name: "Italian query - complex technical request",
            query: "Puoi spiegarmi come funziona il protocollo MCP?",
            expectedPatterns: {
                avoid: ['non definito', 'undefined', 'null', 'NaN'],
                require: ['protocol', 'mcp']
            }
        },
        {
            name: "Italian query - data exploration",
            query: "Mostrami i dati disponibili nel sistema",
            expectedPatterns: {
                avoid: ['non definito', 'undefined', 'null', 'NaN'],
                require: ['italian_response_pattern']
            }
        }
    ];
    
    const results = [];
    
    for (const testCase of testCases) {
        console.log(`\n📋 Testing: ${testCase.name}`);
        console.log(`Query: "${testCase.query}"`);
        
        try {
            const startTime = Date.now();
            const result = await runOrchestration(testCase.query, [], 'test-thread');
            const duration = Date.now() - startTime;
            
            console.log(`⏱️ Duration: ${duration}ms`);
            
            // Check final response
            const finalResponse = result.finalResponse || result.response;
            console.log(`📤 Final Response: "${finalResponse?.substring(0, 100)}..."`);
            
            // Validation
            const validation = {
                hasValidResponse: finalResponse && typeof finalResponse === 'string' && finalResponse.length > 0,
                noProblematicContent: !testCase.expectedPatterns.avoid.some(pattern => 
                    finalResponse?.toLowerCase().includes(pattern.toLowerCase())
                ),
                isItalian: finalResponse && (
                    finalResponse.includes('è') || 
                    finalResponse.includes('à') || 
                    finalResponse.includes('ì') ||
                    /[àèéìòù]/.test(finalResponse) ||
                    finalResponse.includes('che ') ||
                    finalResponse.includes('della ') ||
                    finalResponse.includes('sono ') ||
                    finalResponse.includes('posso ')
                )
            };
            
            const passed = validation.hasValidResponse && validation.noProblematicContent;
            
            console.log(`✅ Has valid response: ${validation.hasValidResponse}`);
            console.log(`✅ No problematic content: ${validation.noProblematicContent}`);
            console.log(`🇮🇹 Contains Italian patterns: ${validation.isItalian}`);
            console.log(`🏆 Test result: ${passed ? 'PASSED' : 'FAILED'}`);
            
            results.push({
                testCase: testCase.name,
                passed,
                duration,
                finalResponse: finalResponse?.substring(0, 200),
                validation
            });
            
        } catch (error) {
            console.error(`❌ Test failed with error:`, error.message);
            results.push({
                testCase: testCase.name,
                passed: false,
                error: error.message
            });
        }
    }
    
    // Summary
    console.log('\n📊 TRANSLATION BUG FIX TEST SUMMARY');
    console.log('=' .repeat(50));
    
    const passedCount = results.filter(r => r.passed).length;
    const totalCount = results.length;
    
    results.forEach(result => {
        const status = result.passed ? '✅ PASSED' : '❌ FAILED';
        console.log(`${status} - ${result.testCase}`);
        if (result.error) {
            console.log(`   Error: ${result.error}`);
        }
        if (result.finalResponse) {
            console.log(`   Response: "${result.finalResponse}..."`);
        }
    });
    
    console.log(`\n🎯 Overall Result: ${passedCount}/${totalCount} tests passed`);
    
    if (passedCount === totalCount) {
        console.log('🎉 All tests passed! Translation bug appears to be fixed.');
    } else {
        console.log('⚠️ Some tests failed. Review the failures above.');
    }
    
    return {
        totalTests: totalCount,
        passedTests: passedCount,
        success: passedCount === totalCount,
        results
    };
}

// Esegui il test
if (require.main === module) {
    testTranslationBugFix()
        .then(result => {
            process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
            console.error('Test execution failed:', error);
            process.exit(1);
        });
}

module.exports = { testTranslationBugFix };
