const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

class EnhancedMcpClient {
    constructor(configPath = './server-config.json', mcpConfigPath = './mcp_servers_standard.json') {
        this.configPath = configPath;
        this.mcpConfigPath = mcpConfigPath;
        this.serverConfig = this.loadServerConfig();
        this.mcpConfig = this.loadMcpConfig();
        this.detectedMode = null;
    }

    loadServerConfig() {
        try {
            const configData = fs.readFileSync(this.configPath, 'utf8');
            return JSON.parse(configData);
        } catch (error) {
            console.warn('⚠️  Configurazione server non trovata, uso valori predefiniti');
            return {
                restServer: { enabled: true, port: 8080 },
                mcpServer: { enabled: true, port: 5009 },
                serverMode: 'both'
            };
        }
    }

    loadMcpConfig() {
        try {
            const mcpConfigData = fs.readFileSync(this.mcpConfigPath, 'utf8');
            return JSON.parse(mcpConfigData);
        } catch (error) {
            console.warn('⚠️  Configurazione MCP non trovata');
            return { httpServers: [], mcpServers: {} };
        }
    }    getRestServerConfig() {
        // Cerca il server REST abilitato nella configurazione MCP
        const restServer = this.mcpConfig.httpServers.find(server => 
            server.enabled && (server.tools_endpoint || !server.mcp_endpoint)
        );
        
        return restServer || {
            url: `http://localhost:${this.serverConfig.restServer.port}`,
            enabled: this.serverConfig.restServer.enabled
        };
    }

    getMcpServerConfig() {
        // Cerca il server MCP abilitato nella configurazione
        const mcpServer = this.mcpConfig.httpServers.find(server => 
            server.enabled && server.mcp_endpoint
        );
        
        return mcpServer || {
            url: `http://localhost:${this.serverConfig.mcpServer.port}`,
            enabled: this.serverConfig.mcpServer.enabled
        };
    }

    async detectServerMode() {
        console.log('🔍 Rilevamento modalità server...');
        
        const restAvailable = await this.checkRestServer();
        const mcpAvailable = await this.checkMcpServer();

        if (restAvailable && mcpAvailable) {
            this.detectedMode = 'both';
            console.log('✅ Rilevati entrambi i server (REST + MCP)');
        } else if (restAvailable) {
            this.detectedMode = 'rest';
            console.log('✅ Rilevato solo server REST');
        } else if (mcpAvailable) {
            this.detectedMode = 'mcp';
            console.log('✅ Rilevato solo server MCP');
        } else {
            this.detectedMode = 'none';
            console.log('❌ Nessun server rilevato');
        }

        return this.detectedMode;
    }    async checkRestServer() {
        try {
            const restConfig = this.getRestServerConfig();
            if (!restConfig.enabled) {
                return false;
            }
            
            const baseUrl = restConfig.url.replace(/\/$/, '');
            const toolsEndpoint = restConfig.tools_endpoint || '/tools';
            
            const response = await fetch(`${baseUrl}${toolsEndpoint}`, {
                timeout: 5000
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }    async checkMcpServer() {
        try {
            const mcpConfig = this.getMcpServerConfig();
            if (!mcpConfig.enabled) {
                return false;
            }
            
            const baseUrl = mcpConfig.url.replace(/\/$/, '');
            const mcpEndpoint = mcpConfig.mcp_endpoint || '/mcp';
            const mcpUrl = `${baseUrl}${mcpEndpoint}`;
            
            console.log(`🔍 Testing MCP server at: ${mcpUrl}`);
            
            const response = await fetch(mcpUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'initialize',
                    params: {
                        protocolVersion: '2024-11-05',
                        capabilities: {},
                        clientInfo: {
                            name: 'enhanced-mcp-client',
                            version: '1.0.0'
                        }
                    },
                    id: 1
                }),
                timeout: 5000
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }    async callRestEndpoint(endpoint, method = 'GET', data = null) {
        const restConfig = this.getRestServerConfig();
        const baseUrl = restConfig.url.replace(/\/$/, '');
        const url = `${baseUrl}${endpoint}`;
        
        try {
            const options = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                }
            };

            if (data && method !== 'GET') {
                options.body = JSON.stringify(data);
            }

            const response = await fetch(url, options);
            const result = await response.json();
            
            return {
                success: true,
                data: result,
                mode: 'rest',
                server: restConfig
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                mode: 'rest',
                server: restConfig
            };
        }
    }    async callMcpMethod(method, params = {}) {
        const mcpConfig = this.getMcpServerConfig();
        const baseUrl = mcpConfig.url.replace(/\/$/, '');
        const mcpEndpoint = mcpConfig.mcp_endpoint || '/mcp';
        const mcpUrl = `${baseUrl}${mcpEndpoint}`;
        
        console.log(`🔧 Calling MCP method '${method}' at: ${mcpUrl}`);
        
        try {
            const response = await fetch(mcpUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method,
                    params,
                    id: Date.now()
                })
            });

            const result = await response.json();
            
            return {
                success: !result.error,
                data: result.result || result.error,
                mode: 'mcp',
                jsonrpc: result,
                server: mcpConfig
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                mode: 'mcp',
                server: mcpConfig
            };
        }
    }

    async getTools(preferredMode = null) {
        const mode = preferredMode || this.detectedMode || await this.detectServerMode();
        
        console.log(`🔧 Richiesta tools tramite modalità: ${mode}`);
        
        switch (mode) {
            case 'rest':
                return await this.callRestEndpoint('/tools');
            
            case 'mcp':
                return await this.callMcpMethod('tools/list');
            
            case 'both':
                // Prova prima MCP, poi REST come fallback
                const mcpResult = await this.callMcpMethod('tools/list');
                if (mcpResult.success) {
                    return mcpResult;
                }
                console.log('⚠️  MCP fallito, provo REST...');
                return await this.callRestEndpoint('/tools');
            
            default:
                return {
                    success: false,
                    error: 'Nessun server disponibile',
                    mode: 'none'
                };
        }
    }

    async callTool(toolName, args = {}, preferredMode = null) {
        const mode = preferredMode || this.detectedMode || await this.detectServerMode();
        
        console.log(`🛠️  Chiamata tool '${toolName}' tramite modalità: ${mode}`);
        
        switch (mode) {
            case 'rest':
                // Per REST, costruiamo l'endpoint appropriato
                return await this.callRestEndpoint(`/tools/${toolName}`, 'POST', args);
            
            case 'mcp':
                return await this.callMcpMethod('tools/call', {
                    name: toolName,
                    arguments: args
                });
            
            case 'both':
                // Prova prima MCP, poi REST come fallback
                const mcpResult = await this.callMcpMethod('tools/call', {
                    name: toolName,
                    arguments: args
                });
                if (mcpResult.success) {
                    return mcpResult;
                }
                console.log('⚠️  MCP fallito, provo REST...');
                return await this.callRestEndpoint(`/tools/${toolName}`, 'POST', args);
            
            default:
                return {
                    success: false,
                    error: 'Nessun server disponibile',
                    mode: 'none'
                };
        }
    }    async getServerInfo() {
        const mode = await this.detectServerMode();
        
        const info = {
            detectedMode: mode,
            serverConfig: this.serverConfig,
            mcpConfig: this.mcpConfig,
            availableEndpoints: {}
        };

        if (mode === 'rest' || mode === 'both') {
            const restConfig = this.getRestServerConfig();
            info.availableEndpoints.rest = {
                baseUrl: restConfig.url,
                server: restConfig,
                endpoints: {
                    [restConfig.tools_endpoint || '/tools']: 'List available tools',
                    '/interns': 'Get interns data',
                    '/employees': 'Get employees data',
                    '/search': 'Search data'
                }
            };
        }

        if (mode === 'mcp' || mode === 'both') {
            const mcpConfig = this.getMcpServerConfig();
            info.availableEndpoints.mcp = {
                baseUrl: mcpConfig.url,
                server: mcpConfig,
                protocol: 'JSON-RPC 2.0',
                methods: [
                    'initialize',
                    'tools/list',
                    'tools/call',
                    'resources/list',
                    'prompts/list'
                ]
            };
        }

        // Aggiungi informazioni sui server configurati
        info.configuredServers = {
            httpServers: this.mcpConfig.httpServers || [],
            mcpServers: this.mcpConfig.mcpServers || {}
        };

        return info;
    }

    showUsageExamples() {
        console.log(`
🚀 ESEMPI DI UTILIZZO - ENHANCED MCP CLIENT
==========================================

const client = new EnhancedMcpClient();

// Rilevamento automatico del server
await client.detectServerMode();

// Ottenere informazioni sui server
const info = await client.getServerInfo();
console.log(info);

// Ottenere tools (auto-detect modalità)
const tools = await client.getTools();

// Ottenere tools forzando una modalità specifica
const restTools = await client.getTools('rest');
const mcpTools = await client.getTools('mcp');

// Chiamare un tool (auto-detect modalità)
const result = await client.callTool('get_stagisti_mcp');

// Chiamare un tool forzando una modalità specifica
const restResult = await client.callTool('get_stagisti_mcp', {}, 'rest');
const mcpResult = await client.callTool('get_stagisti_mcp', {}, 'mcp');

// Chiamate REST dirette
const restData = await client.callRestEndpoint('/interns');

// Chiamate MCP dirette
const mcpData = await client.callMcpMethod('tools/list');
        `);
    }
}

module.exports = EnhancedMcpClient;

// Per test diretti
if (require.main === module) {
    async function test() {
        const client = new EnhancedMcpClient();
        
        console.log('🧪 Test Enhanced MCP Client');
        console.log('============================');
        
        // Rilevamento server
        await client.detectServerMode();
        
        // Informazioni server
        const info = await client.getServerInfo();
        console.log('\n📊 Informazioni Server:');
        console.log(JSON.stringify(info, null, 2));
        
        // Test tools
        console.log('\n🔧 Test Tools:');
        const tools = await client.getTools();
        console.log(JSON.stringify(tools, null, 2));
        
        // Test chiamata tool
        console.log('\n🛠️  Test Chiamata Tool:');
        const result = await client.callTool('get_stagisti_mcp');
        console.log(JSON.stringify(result, null, 2));
        
        // Mostra esempi di utilizzo
        client.showUsageExamples();
    }
    
    test().catch(console.error);
}
