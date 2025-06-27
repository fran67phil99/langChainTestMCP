const axios = require('axios');
const { McpFormatConverter } = require('./mcpFormatConverter');
const { mcpConfigManager } = require('./mcpConfig');

// Singleton MCP Client instance per riutilizzare le connessioni
let globalMcpClient = null;

function getGlobalMcpClient() {
  if (!globalMcpClient) {
    const MCPClient = require('./mcpClient');
    globalMcpClient = new MCPClient();
    console.log('🔄 Created new global MCP client instance');
  }
  return globalMcpClient;
}

// Funzione per resettare il client globale (utile per test o restart)
function resetGlobalMcpClient() {
  if (globalMcpClient) {
    console.log('🔄 Resetting global MCP client - disconnecting all servers');
    globalMcpClient.disconnectAll().catch(err => 
      console.warn('⚠️ Error during client cleanup:', err.message)
    );
    globalMcpClient = null;
  }
}

/**
 * Fetches available MCP tool definitions from configured servers
 */
async function getAllMcpTools() {
  // Carica la configurazione con supporto formato ibrido
  const converter = new McpFormatConverter();
  const config = converter.loadUnifiedConfig();
  
  console.log('🔍 MCP Tools Discovery: Starting...');
  
  // Protezione contro configurazione null/undefined
  if (!config) {
    console.error('❌ No configuration loaded');
    return [];
  }
  
  // Debug: log della configurazione
  console.log('🔧 Config loaded:', { 
    hasDiscovery: !!config.discovery, 
    hasServers: !!config.servers, 
    serversCount: config.servers?.length || 0,
    discoveryEnabled: config.discovery?.enabled 
  });
  
  if (!config.discovery) {
    console.warn('⚠️ No discovery configuration found, creating default');
    config.discovery = {
      enabled: true,
      timeout_per_server: 10000,
      max_concurrent_discoveries: 3,
      cache_ttl_minutes: 5,
      fallback_to_mock: false
    };
  }
  
  if (!config.discovery.enabled) {
    console.log('🔒 MCP tool discovery is disabled via configuration.');
    return config.tools_override?.custom_tools || [];
  }
  
  const enabledServers = (config.servers || []).filter(s => s.enabled);
  if (enabledServers.length === 0) {
    console.warn('⚠️ No enabled MCP servers found in configuration.');
    console.log('🔒 DYNAMIC SYSTEM: No fallback tools - only using configured servers');
    return [];
  }

  console.log(`🔍 Starting discovery from ${enabledServers.length} MCP servers...`);
  console.log(`📋 Using ${config.servers.find(s => s.type === 'command') ? 'Standard MCP' : 'HTTP'} format servers`);
  
  // Usa il client MCP globale singleton
  const mcpClient = getGlobalMcpClient();
  const clientStats = mcpClient.getConnectionStats();
  console.log(`📊 MCP Client Stats: ${JSON.stringify(clientStats)}`);
  
  const allTools = [];
  const discoveryPromises = [];
  const discoveryConfig = config.discovery;

  // Limita il numero di discovery concorrenti
  const semaphore = new Semaphore(discoveryConfig.max_concurrent_discoveries);

  for (const server of enabledServers) {
    discoveryPromises.push(
      semaphore.acquire().then(async (release) => {
        try {
          console.log(`🔍 Starting discovery for server: ${server.name} (${server.id})`);
          const tools = await discoverToolsFromServer(server);
          console.log(`✅ Completed discovery for ${server.name}: ${tools.length} tools found`);
          return tools;
        } catch (error) {
          console.error(`❌ Discovery failed for ${server.name}: ${error.message}`);
          return [];
        } finally {
          release();
        }
      })
    );
  }
  try {
    // Aggiungi timeout globale per tutto il discovery (max 10 secondi)
    const globalTimeout = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Global discovery timeout')), 10000)
    );
    
    const discoveryResults = Promise.allSettled(discoveryPromises);
    const results = await Promise.race([discoveryResults, globalTimeout]);
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const server = enabledServers[i];
      
      if (result.status === 'fulfilled') {
        const tools = result.value;
        allTools.push(...tools);
        console.log(`✅ ${server.name}: Loaded ${tools.length} tools`);
      } else {
        console.error(`❌ ${server.name}: Failed to load tools - ${result.reason.message}`);
      }
    }    if (allTools.length === 0 && discoveryConfig.fallback_to_mock) {
      console.warn('⚠️ No tools discovered from any server');
      console.log('🔒 DYNAMIC SYSTEM: No fallback tools - only using discovered tools');
      return [];
    }

    console.log(`🎯 Total tools discovered: ${allTools.length}`);
    return allTools;
  } catch (error) {
    console.error(`❌ Error during multi-server discovery: ${error.message}`);
    
    console.log('� DYNAMIC SYSTEM: No fallback tools on error - only using configured servers');
    return [];
  }
}

/**
 * Scopre i tool da un singolo server MCP
 */
async function discoverToolsFromServer(serverConfig) {
  const serverId = serverConfig.id;
  
  // Verifica cache prima - ma salta se ci sono stati errori di connessione recenti
  const hasRecentConnectionErrors = mcpConfigManager.hasRecentConnectionErrors(serverId);
  if (!hasRecentConnectionErrors && mcpConfigManager.isCacheValid(serverId)) {
    console.log(`📋 ${serverConfig.name}: Using cached tools (no recent connection errors)`);
    return mcpConfigManager.getCachedTools(serverId);
  } else if (hasRecentConnectionErrors) {
    console.log(`⚠️ ${serverConfig.name}: Bypassing cache due to recent connection errors`);
  }

  try {
    let tools;
    
    // Distingui tra server HTTP e server command MCP standard
    if (serverConfig.type === 'http' && serverConfig.url) {
      tools = await discoverFromHttpServer(serverConfig);
    } else if (serverConfig.type === 'command' || serverConfig.command) {
      tools = await discoverFromMcpCommandServer(serverConfig);
    } else {
      throw new Error(`Server type not supported: ${serverConfig.type || 'unknown'}`);
    }
    
    // Se arriviamo qui, la connessione è riuscita - cancella errori precedenti
    mcpConfigManager.clearConnectionErrors(serverId);
    
    return tools;
  } catch (error) {
    // Registra l'errore di connessione
    mcpConfigManager.recordConnectionError(serverId, error);
    throw error;
  }
}

/**
 * Scopre tool da server HTTP (supporta sia REST che MCP)
 */
async function discoverFromHttpServer(serverConfig) {
  const serverId = serverConfig.id;
  const timeout = serverConfig.timeout || 3000;
  const retryAttempts = serverConfig.retry_attempts || 3;
  
  // Determina se è un server MCP-compliant o REST
  if (serverConfig.mcp_endpoint) {
    // Server MCP-compliant
    const mcpUrl = `${serverConfig.url}${serverConfig.mcp_endpoint}`;
    console.log(`🔍 ${serverConfig.name}: Discovering tools from ${mcpUrl}`);
    return await discoverFromMcpHttpServer(serverConfig, mcpUrl, timeout, retryAttempts);
  } else {
    // Server REST classico
    const toolsUrl = `${serverConfig.url}${serverConfig.tools_endpoint || '/tools'}`;
    console.log(`🔍 ${serverConfig.name}: Discovering tools from ${toolsUrl}`);
    return await discoverFromRestHttpServer(serverConfig, toolsUrl, timeout, retryAttempts);
  }
}

/**
 * Scopre tool da server REST HTTP (legacy)
 */
async function discoverFromRestHttpServer(serverConfig, toolsUrl, timeout, retryAttempts) {
  const serverId = serverConfig.id;
  
  console.log(`🔍 ${serverConfig.name}: Discovering tools from ${toolsUrl}`);

  for (let attempt = 1; attempt <= retryAttempts; attempt++) {
    try {
      const response = await axios.get(toolsUrl, { 
        timeout,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'MCP-Discovery-Agent/1.0'
        }
      });

      const toolSchemas = response.data;
      if (!Array.isArray(toolSchemas)) {
        throw new Error('Invalid response format: expected array of tools');
      }

      const tools = toolSchemas.map((schema) => createToolFromSchema(schema, serverConfig));
      
      // Aggiorna cache
      mcpConfigManager.updateCache(serverId, tools);
      
      console.log(`✅ ${serverConfig.name}: Successfully discovered ${tools.length} tools`);
      return tools;

    } catch (error) {
      console.warn(`⚠️ ${serverConfig.name}: Attempt ${attempt}/${retryAttempts} failed - ${error.message}`);
      
      if (attempt === retryAttempts) {
        throw new Error(`Failed after ${retryAttempts} attempts: ${error.message}`);
      }
      
      // Aspetta prima del retry (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Scopre tool da server MCP command standard (JSON-RPC)
 */
async function discoverFromMcpCommandServer(serverConfig) {
  const serverId = serverConfig.id;
  
  console.log(`🔍 ${serverConfig.name}: Discovering tools via MCP standard protocol`);
  
  try {
    // Usa il client MCP globale per ottenere i tool via JSON-RPC
    const mcpClient = getGlobalMcpClient();
    
    // Verifica se esiste già una connessione sana
    if (mcpClient.isConnected(serverId)) {
      console.log(`🔄 ${serverConfig.name}: Using existing healthy connection`);
    } else {
      console.log(`🔌 ${serverConfig.name}: Creating new connection`);
    }
    
    const tools = await mcpClient.getToolsList(serverConfig);
    
    if (tools.length === 0) {
      console.warn(`⚠️ ${serverConfig.name}: No tools returned from server`);
    }
    
    // Converti i tool MCP in formato interno
    const formattedTools = tools.map(tool => createToolFromMcpSchema(tool, serverConfig));
    
    // Aggiorna cache
    mcpConfigManager.updateCache(serverId, formattedTools);
    
    console.log(`✅ ${serverConfig.name}: Successfully discovered ${formattedTools.length} MCP tools`);
    return formattedTools;
    
  } catch (error) {
    console.warn(`❌ ${serverConfig.name}: MCP discovery failed - ${error.message}`);
    console.warn(`❌ ${serverConfig.name}: Error details: ${error.stack}`);
    throw error;
  }
}

/**
 * Scopre tool da server MCP-compliant HTTP (JSON-RPC 2.0)
 */
async function discoverFromMcpHttpServer(serverConfig, mcpUrl, timeout, retryAttempts) {
  const serverId = serverConfig.id;

  for (let attempt = 1; attempt <= retryAttempts; attempt++) {
    try {
      // 1. Prima chiamata: initialize (obbligatoria per MCP)
      const initializePayload = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {
            roots: {
              listChanged: true
            },
            sampling: {}
          },
          clientInfo: {
            name: "Mauden MCP Discovery Client",
            version: "1.0.0"
          }
        }
      };

      const initResponse = await axios.post(mcpUrl, initializePayload, {
        timeout,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MCP-Discovery-Agent/1.0'
        }
      });

      if (initResponse.status !== 200 || !initResponse.data?.result) {
        throw new Error(`MCP Initialize failed: ${initResponse.status}`);
      }

      // 2. Seconda chiamata: tools/list
      const toolsListPayload = {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {}
      };

      const toolsResponse = await axios.post(mcpUrl, toolsListPayload, {
        timeout,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (toolsResponse.status !== 200 || !toolsResponse.data?.result?.tools) {
        throw new Error(`MCP tools/list failed: ${toolsResponse.status}`);
      }

      const mcpTools = toolsResponse.data.result.tools;
      const tools = mcpTools.map((mcpTool) => createToolFromMcpSchema(mcpTool, serverConfig));
      
      // Aggiorna cache
      mcpConfigManager.updateCache(serverId, tools);
      
      console.log(`✅ ${serverConfig.name}: Successfully discovered ${tools.length} MCP tools`);
      return tools;

    } catch (error) {
      console.warn(`⚠️ ${serverConfig.name}: Attempt ${attempt}/${retryAttempts} failed - ${error.message}`);
      
      if (attempt === retryAttempts) {
        throw new Error(`Failed after ${retryAttempts} attempts: ${error.message}`);
      }
      
      // Aspetta prima del retry (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Crea un tool object da uno schema MCP
 */
function createToolFromSchema(schema, serverConfig) {
  return {
    name: schema.name,
    description: `[${serverConfig.name}] ${schema.description}`,
    serverId: serverConfig.id,
    serverName: serverConfig.name,
    call: async function(input) {
      try {
        let params = {};
        
        // Parse input
        try {
          params = typeof input === 'string' ? JSON.parse(input) : input;
        } catch (e) {
          params = { input: input };
        }

        let url = schema.endpoint_url;

        // Replace path parameters
        Object.keys(params).forEach(key => {
          if (url.includes(`{${key}}`)) {
            url = url.replace(`{${key}}`, encodeURIComponent(params[key]));
            delete params[key];
          }
        });

        console.log(`🔧 ${schema.name} (${serverConfig.name}): Calling ${schema.method} ${url}`);

        const config = {
          timeout: serverConfig.timeout || 3000, // Ridotto da 10s a 3s
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'MCP-Tool-Client/1.0'
          }
        };

        if (schema.method === 'GET') {
          const response = await axios.get(url, { ...config, params });
          return JSON.stringify(response.data);
        } else if (schema.method === 'POST') {
          const response = await axios.post(url, params, config);
          return JSON.stringify(response.data);
        } else {
          throw new Error(`Unsupported method: ${schema.method}`);
        }
      } catch (err) {
        console.error(`❌ ${schema.name} (${serverConfig.name}) error:`, err.message);
        return JSON.stringify({
          error: `Failed to invoke MCP tool ${schema.name}`,
          details: err.message,
          server: serverConfig.name
        });
      }
    }
  };
}

/**
 * Crea un tool object da uno schema MCP standard (JSON-RPC)
 */
function createToolFromMcpSchema(mcpTool, serverConfig) {
  return {
    name: mcpTool.name,
    description: `[${serverConfig.name}] ${mcpTool.description}`,
    serverId: serverConfig.id,
    serverName: serverConfig.name,
    mcpTool: true, // Flag per identificare tool MCP
    inputSchema: mcpTool.inputSchema,
    call: async function(input) {
      try {
        let params = {};
        
        // Parse input
        try {
          params = typeof input === 'string' ? JSON.parse(input) : input;
        } catch (e) {
          params = { input: input };
        }

        const mcpUrl = `${serverConfig.url}${serverConfig.mcp_endpoint}`;
        console.log(`🔧 ${mcpTool.name} (${serverConfig.name}): Calling MCP tool via ${mcpUrl}`);

        // Chiamata MCP tools/call
        const toolCallPayload = {
          jsonrpc: "2.0",
          id: Date.now(),
          method: "tools/call",
          params: {
            name: mcpTool.name,
            arguments: params
          }
        };

        const response = await axios.post(mcpUrl, toolCallPayload, {
          timeout: serverConfig.timeout || 10000,
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (response.status !== 200) {
          throw new Error(`MCP tool call failed: HTTP ${response.status}`);
        }

        const result = response.data;
        if (result.error) {
          throw new Error(`MCP error: ${result.error.message || JSON.stringify(result.error)}`);
        }

        console.log(`✅ ${mcpTool.name}: Tool executed successfully`);
        return result.result;

      } catch (error) {
        console.error(`❌ ${mcpTool.name}: Tool execution failed - ${error.message}`);
        throw error;
      }
    }
  };
}

/**
 * Tools di fallback quando nessun server è disponibile
 */
/**
 * Semaforo per limitare le operazioni concorrenti
 */
class Semaphore {
  constructor(max) {
    this.max = max;
    this.current = 0;
    this.queue = [];
  }

  async acquire() {
    return new Promise((resolve) => {
      if (this.current < this.max) {
        this.current++;
        resolve(() => this.release());
      } else {
        this.queue.push(() => {
          this.current++;
          resolve(() => this.release());
        });
      }
    });
  }

  release() {
    this.current--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    }
  }
}

module.exports = { getAllMcpTools, resetGlobalMcpClient, getGlobalMcpClient };
