/**
 * Test di Scalabilità e Carico del Sistema LangGraph
 * Testa prestazioni, memoria, e scalabilità con multiple query simultanee
 */

const { runOrchestratorOptimized } = require('../src/agents/orchestratorAgent.optimized');
const axios = require('axios');

// Configurazione test di carico
const LOAD_TEST_CONFIG = {
    baseUrl: 'http://localhost:3000/api/chat',
    concurrentUsers: [1, 5, 10, 20], // Livelli di concorrenza da testare
    queriesPerUser: 3,
    timeout: 60000, // 60 secondi timeout
    memoryThreshold: 100 * 1024 * 1024, // 100MB threshold
    maxResponseTime: 30000 // 30 secondi max response
};

// Colori per output console
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

function log(color, message) {
    console.log(`${color}${message}${colors.reset}`);
}

// Set di query diversificate per testare tutti i componenti
const TEST_QUERIES = [
    // Query MCP Mauden
    {
        text: "Quanti stagisti abbiamo attualmente in azienda?",
        type: "mcp_mauden",
        language: "it",
        expectedAgent: "mcp_agent"
    },
    {
        text: "Mostrami i dati dei dipendenti con salary superiore a 50000",
        type: "mcp_mauden", 
        language: "it",
        expectedAgent: "mcp_agent"
    },
    // Query generali
    {
        text: "Spiegami come funziona l'intelligenza artificiale",
        type: "general",
        language: "it",
        expectedAgent: "general_agent"
    },
    {
        text: "What are the benefits of using microservices architecture?",
        type: "general",
        language: "en",
        expectedAgent: "general_agent"
    },
    // Query Azure (anche se il server non è disponibile, testa il routing)
    {
        text: "Come posso monitorare le performance delle mie Azure Functions?",
        type: "azure",
        language: "it",
        expectedAgent: "mcp_agent"
    },
    {
        text: "Quali sono i migliori pratiche per Azure Storage?",
        type: "azure",
        language: "it", 
        expectedAgent: "general_agent"
    },
    // Query multilingue
    {
        text: "Explique-moi les avantages du cloud computing",
        type: "general",
        language: "fr",
        expectedAgent: "general_agent"
    },
    {
        text: "¿Cuáles son las tendencias actuales en machine learning?",
        type: "general",
        language: "es",
        expectedAgent: "general_agent"
    }
];

/**
 * Monitora l'utilizzo della memoria
 */
function getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
        rss: usage.rss,
        heapTotal: usage.heapTotal,
        heapUsed: usage.heapUsed,
        external: usage.external,
        arrayBuffers: usage.arrayBuffers
    };
}

/**
 * Formatta i byte in una stringa leggibile
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Esegue una singola query e misura le prestazioni
 */
async function runSingleQuery(query, userId, queryIndex) {
    const startTime = Date.now();
    const initialMemory = getMemoryUsage();
    
    try {
        const response = await runOrchestratorOptimized(query.text, `user-${userId}-${queryIndex}`);
        const endTime = Date.now();
        const finalMemory = getMemoryUsage();
        
        // Estrai il testo della risposta
        let responseText = '';
        if (typeof response === 'string') {
            responseText = response;
        } else if (response && response.content) {
            responseText = response.content;
        } else if (response && response.text) {
            responseText = response.text;
        } else {
            responseText = JSON.stringify(response);
        }
        
        return {
            success: true,
            responseTime: endTime - startTime,
            responseLength: responseText.length,
            memoryUsed: finalMemory.heapUsed - initialMemory.heapUsed,
            query: query,
            userId,
            queryIndex
        };
        
    } catch (error) {
        const endTime = Date.now();
        return {
            success: false,
            responseTime: endTime - startTime,
            error: error.message,
            query: query,
            userId,
            queryIndex
        };
    }
}

/**
 * Esegue un test di carico con un numero specifico di utenti concorrenti
 */
async function runLoadTest(concurrentUsers) {
    log(colors.blue + colors.bold, `\n🚀 LOAD TEST: ${concurrentUsers} utenti concorrenti`);
    log(colors.blue, '=' .repeat(60));
    
    const startTime = Date.now();
    const initialMemory = getMemoryUsage();
    
    // Crea array di promesse per tutte le query
    const allPromises = [];
    
    for (let userId = 1; userId <= concurrentUsers; userId++) {
        for (let queryIndex = 0; queryIndex < LOAD_TEST_CONFIG.queriesPerUser; queryIndex++) {
            const query = TEST_QUERIES[queryIndex % TEST_QUERIES.length];
            allPromises.push(runSingleQuery(query, userId, queryIndex));
        }
    }
    
    log(colors.cyan, `📊 Eseguendo ${allPromises.length} query simultanee...`);
    
    // Esegui tutte le query in parallelo
    const results = await Promise.allSettled(allPromises);
    
    const endTime = Date.now();
    const finalMemory = getMemoryUsage();
    
    // Analizza i risultati
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success));
    
    const responseTimes = successful.map(r => r.value.responseTime);
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const maxResponseTime = Math.max(...responseTimes);
    const minResponseTime = Math.min(...responseTimes);
    
    const totalMemoryUsed = finalMemory.heapUsed - initialMemory.heapUsed;
    const totalTime = endTime - startTime;
    const throughput = (allPromises.length / totalTime) * 1000; // query per secondo
    
    // Report risultati
    log(colors.green, `✅ Test completato in ${totalTime}ms`);
    log(colors.cyan, `📈 Successo: ${successful.length}/${allPromises.length} (${Math.round(successful.length/allPromises.length*100)}%)`);
    log(colors.cyan, `⚡ Throughput: ${throughput.toFixed(2)} query/sec`);
    log(colors.cyan, `⏱️  Response Time - Avg: ${avgResponseTime.toFixed(0)}ms, Min: ${minResponseTime}ms, Max: ${maxResponseTime}ms`);
    log(colors.cyan, `💾 Memory Used: ${formatBytes(totalMemoryUsed)} (Final: ${formatBytes(finalMemory.heapUsed)})`);
    
    if (failed.length > 0) {
        log(colors.red, `❌ Errori: ${failed.length}`);
        failed.slice(0, 3).forEach(f => {
            if (f.status === 'fulfilled') {
                log(colors.red, `   - ${f.value.error}`);
            } else {
                log(colors.red, `   - ${f.reason}`);
            }
        });
    }
    
    // Analisi per tipo di query
    const queryTypeStats = {};
    successful.forEach(r => {
        const type = r.value.query.type;
        if (!queryTypeStats[type]) {
            queryTypeStats[type] = {
                count: 0,
                totalTime: 0,
                avgTime: 0
            };
        }
        queryTypeStats[type].count++;
        queryTypeStats[type].totalTime += r.value.responseTime;
    });
    
    Object.keys(queryTypeStats).forEach(type => {
        queryTypeStats[type].avgTime = queryTypeStats[type].totalTime / queryTypeStats[type].count;
    });
    
    log(colors.cyan, '\n📊 Performance per tipo di query:');
    Object.entries(queryTypeStats).forEach(([type, stats]) => {
        log(colors.cyan, `   ${type}: ${stats.count} query, avg ${stats.avgTime.toFixed(0)}ms`);
    });
    
    return {
        concurrentUsers,
        totalQueries: allPromises.length,
        successful: successful.length,
        failed: failed.length,
        successRate: successful.length / allPromises.length,
        totalTime,
        avgResponseTime,
        maxResponseTime,
        minResponseTime,
        throughput,
        memoryUsed: totalMemoryUsed,
        finalMemoryUsage: finalMemory.heapUsed,
        queryTypeStats
    };
}

/**
 * Test di stress progressivo
 */
async function runStressTest() {
    log(colors.magenta + colors.bold, '\n🔥 STRESS TEST PROGRESSIVO');
    log(colors.magenta, '=' .repeat(60));
    
    const results = [];
    
    for (const userCount of LOAD_TEST_CONFIG.concurrentUsers) {
        const result = await runLoadTest(userCount);
        results.push(result);
        
        // Pausa tra i test per far stabilizzare il sistema
        log(colors.yellow, `\n⏸️  Pausa 5 secondi prima del prossimo test...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Forza garbage collection se disponibile
        if (global.gc) {
            global.gc();
        }
    }
    
    return results;
}

/**
 * Test di memoria e leak detection
 */
async function runMemoryLeakTest() {
    log(colors.magenta + colors.bold, '\n🧠 MEMORY LEAK DETECTION TEST');
    log(colors.magenta, '=' .repeat(60));
    
    const initialMemory = getMemoryUsage();
    const iterations = 50;
    const memorySnapshots = [initialMemory.heapUsed];
    
    log(colors.cyan, `🔍 Eseguendo ${iterations} iterazioni per rilevare memory leak...`);
    log(colors.cyan, `📊 Memoria iniziale: ${formatBytes(initialMemory.heapUsed)}`);
    
    for (let i = 1; i <= iterations; i++) {
        // Esegui una query casuale
        const query = TEST_QUERIES[i % TEST_QUERIES.length];
        await runSingleQuery(query, 'memory-test', i);
        
        // Snapshot memoria ogni 10 iterazioni
        if (i % 10 === 0) {
            if (global.gc) global.gc(); // Forza GC se disponibile
            
            const currentMemory = getMemoryUsage();
            memorySnapshots.push(currentMemory.heapUsed);
            
            log(colors.cyan, `   Iterazione ${i}: ${formatBytes(currentMemory.heapUsed)}`);
        }
    }
    
    const finalMemory = getMemoryUsage();
    const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
    const growthRate = memoryGrowth / iterations;
    
    log(colors.cyan, `\n📈 Analisi Memory Leak:`);
    log(colors.cyan, `   - Memoria finale: ${formatBytes(finalMemory.heapUsed)}`);
    log(colors.cyan, `   - Crescita totale: ${formatBytes(memoryGrowth)}`);
    log(colors.cyan, `   - Crescita per iterazione: ${formatBytes(growthRate)}`);
    
    // Determina se c'è un possibile memory leak
    const leakThreshold = 1024 * 1024; // 1MB per iterazione
    const hasLeak = growthRate > leakThreshold;
    
    if (hasLeak) {
        log(colors.red, `   ⚠️  POSSIBILE MEMORY LEAK RILEVATO!`);
        log(colors.red, `   ⚠️  Crescita eccessiva: ${formatBytes(growthRate)} per iterazione`);
    } else {
        log(colors.green, `   ✅ Nessun memory leak significativo rilevato`);
    }
    
    return {
        initialMemory: initialMemory.heapUsed,
        finalMemory: finalMemory.heapUsed,
        memoryGrowth,
        growthRate,
        hasLeak,
        iterations
    };
}

/**
 * Genera report finale di scalabilità
 */
function generateScalabilityReport(stressResults, memoryResults) {
    log(colors.blue + colors.bold, '\n📊 SCALABILITY & PERFORMANCE REPORT');
    log(colors.blue, '=' .repeat(60));
    
    // Analizza trend delle prestazioni
    const maxConcurrency = Math.max(...stressResults.map(r => r.concurrentUsers));
    const minSuccessRate = Math.min(...stressResults.map(r => r.successRate));
    const maxThroughput = Math.max(...stressResults.map(r => r.throughput));
    const avgResponseTimeAtMax = stressResults.find(r => r.concurrentUsers === maxConcurrency)?.avgResponseTime;
    
    log(colors.cyan, '🎯 Metriche Chiave:');
    log(colors.cyan, `   • Max Concorrenza Testata: ${maxConcurrency} utenti`);
    log(colors.cyan, `   • Tasso Successo Minimo: ${(minSuccessRate * 100).toFixed(1)}%`);
    log(colors.cyan, `   • Throughput Massimo: ${maxThroughput.toFixed(2)} query/sec`);
    log(colors.cyan, `   • Response Time @ Max Load: ${avgResponseTimeAtMax?.toFixed(0)}ms`);
    
    log(colors.cyan, '\n📈 Performance Trend:');
    stressResults.forEach(result => {
        const status = result.successRate >= 0.95 ? '✅' : result.successRate >= 0.8 ? '⚠️' : '❌';
        log(colors.cyan, `   ${status} ${result.concurrentUsers} utenti: ${(result.successRate * 100).toFixed(1)}% successo, ${result.throughput.toFixed(1)} q/s, ${result.avgResponseTime.toFixed(0)}ms avg`);
    });
    
    // Analisi memoria
    log(colors.cyan, '\n🧠 Analisi Memoria:');
    if (memoryResults.hasLeak) {
        log(colors.red, `   ❌ Memory leak rilevato: ${formatBytes(memoryResults.growthRate)}/iterazione`);
    } else {
        log(colors.green, `   ✅ Gestione memoria stabile: ${formatBytes(memoryResults.growthRate)}/iterazione`);
    }
    
    log(colors.cyan, `   • Memoria finale: ${formatBytes(memoryResults.finalMemory)}`);
    log(colors.cyan, `   • Crescita totale: ${formatBytes(memoryResults.memoryGrowth)} su ${memoryResults.iterations} iterazioni`);
    
    // Raccomandazioni
    log(colors.yellow + colors.bold, '\n💡 RACCOMANDAZIONI:');
    
    if (minSuccessRate < 0.95) {
        log(colors.yellow, '   • Migliorare gestione errori per carichi elevati');
    }
    
    if (avgResponseTimeAtMax > 10000) {
        log(colors.yellow, '   • Considerare ottimizzazioni per ridurre tempi di risposta');
    }
    
    if (memoryResults.hasLeak) {
        log(colors.yellow, '   • Investigare e risolvere il memory leak rilevato');
    }
    
    if (maxThroughput < 1) {
        log(colors.yellow, '   • Throughput basso - considerare parallelizzazione agent');
    }
    
    // Limiti identificati
    log(colors.cyan, '\n🚧 Limiti Sistema:');
    const failingLoad = stressResults.find(r => r.successRate < 0.8);
    if (failingLoad) {
        log(colors.cyan, `   • Degrado prestazioni significativo a ${failingLoad.concurrentUsers} utenti concorrenti`);
    } else {
        log(colors.green, `   • Sistema stabile fino a ${maxConcurrency} utenti concorrenti`);
    }
    
    // Punteggio complessivo
    let score = 100;
    if (minSuccessRate < 0.95) score -= 20;
    if (avgResponseTimeAtMax > 15000) score -= 15;
    if (memoryResults.hasLeak) score -= 25;
    if (maxThroughput < 0.5) score -= 10;
    
    const scoreColor = score >= 80 ? colors.green : score >= 60 ? colors.yellow : colors.red;
    log(colors.bold + scoreColor, `\n🏆 PUNTEGGIO SCALABILITÀ: ${score}/100`);
    
    if (score >= 80) {
        log(colors.green, '   ✅ Sistema altamente scalabile e performante');
    } else if (score >= 60) {
        log(colors.yellow, '   ⚠️  Sistema scalabile con margini di miglioramento');
    } else {
        log(colors.red, '   ❌ Sistema richiede ottimizzazioni significative');
    }
    
    return {
        maxConcurrency,
        minSuccessRate,
        maxThroughput,
        avgResponseTimeAtMax,
        memoryStable: !memoryResults.hasLeak,
        overallScore: score
    };
}

/**
 * Funzione principale di test scalabilità
 */
async function runScalabilityTests() {
    log(colors.green + colors.bold, '🚀 AVVIO TEST DI SCALABILITÀ E CARICO');
    log(colors.green, '=' .repeat(70));
    
    const overallStartTime = Date.now();
    
    try {
        log(colors.cyan, `📋 Configurazione Test:`);
        log(colors.cyan, `   • Livelli Concorrenza: ${LOAD_TEST_CONFIG.concurrentUsers.join(', ')}`);
        log(colors.cyan, `   • Query per Utente: ${LOAD_TEST_CONFIG.queriesPerUser}`);
        log(colors.cyan, `   • Timeout: ${LOAD_TEST_CONFIG.timeout}ms`);
        log(colors.cyan, `   • Query Test Disponibili: ${TEST_QUERIES.length}`);
        
        // 1. Test di carico progressivo
        const stressResults = await runStressTest();
        
        // 2. Test memory leak
        const memoryResults = await runMemoryLeakTest();
        
        // 3. Report finale
        const report = generateScalabilityReport(stressResults, memoryResults);
        
        const overallEndTime = Date.now();
        log(colors.green + colors.bold, `\n⏱️  Test scalabilità completati in ${((overallEndTime - overallStartTime) / 1000).toFixed(1)} secondi`);
        
        return {
            stressResults,
            memoryResults,
            report,
            totalTime: overallEndTime - overallStartTime
        };
        
    } catch (error) {
        log(colors.red + colors.bold, `\n💥 ERRORE CRITICO NEI TEST: ${error.message}`);
        console.error(error);
        return { success: false, error: error.message };
    }
}

// Esecuzione diretta se lo script viene chiamato direttamente
if (require.main === module) {
    // Abilita garbage collection se possibile
    if (typeof global.gc === 'function') {
        log(colors.cyan, '🗑️  Garbage Collection manuale abilitata');
    } else {
        log(colors.yellow, '⚠️  Garbage Collection manuale non disponibile (usa --expose-gc)');
    }
    
    runScalabilityTests()
        .then(results => {
            if (results.success === false) {
                console.log('\n💥 Test falliti');
                process.exit(1);
            } else {
                console.log('\n🏁 Test di scalabilità completati con successo');
                process.exit(results.report.overallScore >= 70 ? 0 : 1);
            }
        })
        .catch(error => {
            console.error('💥 Errore fatale nei test di scalabilità:', error);
            process.exit(1);
        });
}

module.exports = {
    runScalabilityTests,
    runLoadTest,
    runMemoryLeakTest,
    TEST_QUERIES
};
