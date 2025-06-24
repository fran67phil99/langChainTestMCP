#!/usr/bin/env node

const EnhancedMcpClient = require('../enhanced-mcp-client');
const fs = require('fs').promises;
const path = require('path');

class SystemTester {
    constructor() {
        this.client = new EnhancedMcpClient();
        this.testResults = [];
    }

    async runTest(testName, testFunction) {
        console.log(`🧪 Esecuzione test: ${testName}`);
        try {
            const startTime = Date.now();
            const result = await testFunction();
            const duration = Date.now() - startTime;
            
            this.testResults.push({
                name: testName,
                success: true,
                result,
                duration,
                timestamp: new Date().toISOString()
            });
            
            console.log(`✅ ${testName} completato in ${duration}ms`);
            return result;
        } catch (error) {
            this.testResults.push({
                name: testName,
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            });
            
            console.log(`❌ ${testName} fallito: ${error.message}`);
            throw error;
        }
    }

    async testServerDetection() {
        return await this.runTest('Rilevamento Server', async () => {
            const mode = await this.client.detectServerMode();
            console.log(`   Modalità rilevata: ${mode}`);
            return { detectedMode: mode };
        });
    }

    async testServerInfo() {
        return await this.runTest('Informazioni Server', async () => {
            const info = await this.client.getServerInfo();
            console.log(`   Server disponibili: ${Object.keys(info.availableEndpoints).join(', ')}`);
            return info;
        });
    }

    async testRestEndpoints() {
        return await this.runTest('Test Endpoints REST', async () => {
            const results = {};
            
            // Test /tools endpoint
            try {
                const toolsResult = await this.client.callRestEndpoint('/tools');
                results.tools = toolsResult.success;
                console.log(`   /tools: ${toolsResult.success ? '✅' : '❌'}`);
            } catch (error) {
                results.tools = false;
                console.log(`   /tools: ❌ (${error.message})`);
            }

            // Test /interns endpoint if available
            try {
                const internsResult = await this.client.callRestEndpoint('/interns');
                results.interns = internsResult.success;
                console.log(`   /interns: ${internsResult.success ? '✅' : '❌'}`);
            } catch (error) {
                results.interns = false;
                console.log(`   /interns: ❌ (${error.message})`);
            }

            return results;
        });
    }

    async testMcpMethods() {
        return await this.runTest('Test Metodi MCP', async () => {
            const results = {};
            
            // Test initialize method
            try {
                const initResult = await this.client.callMcpMethod('initialize', {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: {
                        name: 'system-tester',
                        version: '1.0.0'
                    }
                });
                results.initialize = initResult.success;
                console.log(`   initialize: ${initResult.success ? '✅' : '❌'}`);
            } catch (error) {
                results.initialize = false;
                console.log(`   initialize: ❌ (${error.message})`);
            }

            // Test tools/list method
            try {
                const toolsResult = await this.client.callMcpMethod('tools/list');
                results.toolsList = toolsResult.success;
                console.log(`   tools/list: ${toolsResult.success ? '✅' : '❌'}`);
            } catch (error) {
                results.toolsList = false;
                console.log(`   tools/list: ❌ (${error.message})`);
            }

            return results;
        });
    }

    async testUnifiedApi() {
        return await this.runTest('Test API Unificata', async () => {
            const results = {};
            
            // Test getTools with auto-detection
            try {
                const toolsResult = await this.client.getTools();
                results.autoTools = toolsResult.success;
                console.log(`   getTools (auto): ${toolsResult.success ? '✅' : '❌'}`);
                
                if (toolsResult.success) {
                    console.log(`   Modalità usata: ${toolsResult.mode}`);
                }
            } catch (error) {
                results.autoTools = false;
                console.log(`   getTools (auto): ❌ (${error.message})`);
            }

            // Test tool call if available
            try {
                const callResult = await this.client.callTool('get_stagisti_mcp');
                results.toolCall = callResult.success;
                console.log(`   callTool: ${callResult.success ? '✅' : '❌'}`);
                
                if (callResult.success) {
                    console.log(`   Modalità usata: ${callResult.mode}`);
                }
            } catch (error) {
                results.toolCall = false;
                console.log(`   callTool: ❌ (${error.message})`);
            }

            return results;
        });
    }

    async testConfigManagement() {
        return await this.runTest('Test Gestione Configurazione', async () => {
            const results = {};
            
            // Check if server-config.json exists
            try {
                const configExists = await fs.access('server-config.json').then(() => true).catch(() => false);
                results.configExists = configExists;
                console.log(`   server-config.json: ${configExists ? '✅' : '❌'}`);
                
                if (configExists) {
                    const configContent = await fs.readFile('server-config.json', 'utf8');
                    const config = JSON.parse(configContent);
                    results.configValid = true;
                    results.serverMode = config.serverMode;
                    console.log(`   Configurazione valida: ✅`);
                    console.log(`   Modalità configurata: ${config.serverMode}`);
                }
            } catch (error) {
                results.configValid = false;
                console.log(`   Configurazione valida: ❌ (${error.message})`);
            }

            return results;
        });
    }

    async generateReport() {
        console.log('\n📊 GENERAZIONE REPORT...');
        
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalTests: this.testResults.length,
                passed: this.testResults.filter(t => t.success).length,
                failed: this.testResults.filter(t => t.success === false).length
            },
            tests: this.testResults,
            recommendations: []
        };

        // Generate recommendations based on test results
        const detectionResult = this.testResults.find(t => t.name === 'Rilevamento Server');
        if (detectionResult && detectionResult.success) {
            const mode = detectionResult.result.detectedMode;
            
            switch (mode) {
                case 'none':
                    report.recommendations.push('❌ Nessun server rilevato. Avvia i server con: npm start');
                    break;
                case 'rest':
                    report.recommendations.push('🌐 Solo server REST attivo. Per MCP: npm run start:mcp');
                    break;
                case 'mcp':
                    report.recommendations.push('🔗 Solo server MCP attivo. Per REST: npm run start:rest');
                    break;
                case 'both':
                    report.recommendations.push('✅ Entrambi i server attivi. Sistema completamente funzionale!');
                    break;
            }
        }

        // Save report to file
        const reportPath = path.join('logs', 'system-test-report.json');
        try {
            await fs.mkdir('logs', { recursive: true });
            await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
            console.log(`📄 Report salvato in: ${reportPath}`);
        } catch (error) {
            console.log(`⚠️  Impossibile salvare il report: ${error.message}`);
        }

        return report;
    }

    showSummary(report) {
        console.log('\n🎯 RIASSUNTO TEST');
        console.log('=================');
        console.log(`📊 Test totali: ${report.summary.totalTests}`);
        console.log(`✅ Passati: ${report.summary.passed}`);
        console.log(`❌ Falliti: ${report.summary.failed}`);
        console.log(`📈 Tasso di successo: ${Math.round((report.summary.passed / report.summary.totalTests) * 100)}%`);
        
        console.log('\n🔍 DETTAGLI TEST:');
        this.testResults.forEach(test => {
            const status = test.success ? '✅' : '❌';
            const duration = test.duration ? ` (${test.duration}ms)` : '';
            console.log(`  ${status} ${test.name}${duration}`);
            
            if (!test.success && test.error) {
                console.log(`     Errore: ${test.error}`);
            }
        });

        if (report.recommendations.length > 0) {
            console.log('\n💡 RACCOMANDAZIONI:');
            report.recommendations.forEach(rec => {
                console.log(`  ${rec}`);
            });
        }
    }

    async runAllTests() {
        console.log('🚀 AVVIO SISTEMA DI TEST COMPLETO');
        console.log('==================================');
        
        try {
            // Core tests
            await this.testServerDetection();
            await this.testServerInfo();
            await this.testConfigManagement();
            
            // API tests (may fail if servers are not running)
            try {
                await this.testRestEndpoints();
            } catch (error) {
                console.log('⚠️  Test REST endpoints fallito (server potrebbe non essere attivo)');
            }
            
            try {
                await this.testMcpMethods();
            } catch (error) {
                console.log('⚠️  Test metodi MCP fallito (server potrebbe non essere attivo)');
            }
            
            try {
                await this.testUnifiedApi();
            } catch (error) {
                console.log('⚠️  Test API unificata fallito (server potrebbero non essere attivi)');
            }
            
            // Generate and show report
            const report = await this.generateReport();
            this.showSummary(report);
            
            console.log('\n🎉 Test completati!');
            
            return report;
            
        } catch (error) {
            console.error('❌ Errore critico durante i test:', error);
            process.exit(1);
        }
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    const tester = new SystemTester();
    tester.runAllTests().catch(console.error);
}

module.exports = SystemTester;
