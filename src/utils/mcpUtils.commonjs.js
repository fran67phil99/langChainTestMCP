const axios = require('axios');
const { McpFormatConverter } = require('./mcpFormatConverter');
const { mcpConfigManager } = require('./mcpConfig');

/**
 * Fetches available MCP tool definitions from configured servers
 */
async function getAllMcpTools() {
  // Carica la configurazione con supporto formato ibrido
  const converter = new McpFormatConverter();
  const config = converter.loadUnifiedConfig();
  
  if (!config.discovery.enabled) {
    console.log('🔒 MCP tool discovery is disabled via configuration.');
    return config.tools_override.custom_tools || [];
  }

  const enabledServers = config.servers.filter(s => s.enabled);
  if (enabledServers.length === 0) {
    console.warn('⚠️ No enabled MCP servers found in configuration.');
    return getFallbackTools();
  }

  console.log(`🔍 Starting discovery from ${enabledServers.length} MCP servers...`);
  console.log(`📋 Using ${config.servers.find(s => s.type === 'command') ? 'Standard MCP' : 'HTTP'} format servers`);
  
  const allTools = [];
  const discoveryPromises = [];
  const discoveryConfig = config.discovery;

  // Limita il numero di discovery concorrenti
  const semaphore = new Semaphore(discoveryConfig.max_concurrent_discoveries);

  for (const server of enabledServers) {
    discoveryPromises.push(
      semaphore.acquire().then(async (release) => {
        try {
          const tools = await discoverToolsFromServer(server);
          return tools;
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
    }

    if (allTools.length === 0 && discoveryConfig.fallback_to_mock) {
      console.warn('⚠️ No tools discovered from any server, using fallback tools');
      return getFallbackTools();
    }

    console.log(`🎯 Total tools discovered: ${allTools.length}`);
    return allTools;

  } catch (error) {
    console.error(`❌ Error during multi-server discovery: ${error.message}`);
    
    if (discoveryConfig.fallback_to_mock) {
      console.log('🔄 Falling back to mock tools');
      return getFallbackTools();
    }
    
    return [];
  }
}

/**
 * Scopre i tool da un singolo server MCP
 */
async function discoverToolsFromServer(serverConfig) {
  const serverId = serverConfig.id;
  
  // Controlla cache prima
  if (mcpConfigManager.isCacheValid(serverId)) {
    console.log(`📋 ${serverConfig.name}: Using cached tools`);
    return mcpConfigManager.getCachedTools(serverId);
  }

  // Distingui tra server HTTP e server command MCP standard
  if (serverConfig.type === 'http' && serverConfig.url) {
    return await discoverFromHttpServer(serverConfig);
  } else if (serverConfig.type === 'command' || serverConfig.command) {
    return await discoverFromMcpCommandServer(serverConfig);
  } else {
    throw new Error(`Server type not supported: ${serverConfig.type || 'unknown'}`);
  }
}

/**
 * Scopre tool da server HTTP (legacy)
 */
async function discoverFromHttpServer(serverConfig) {
  const serverId = serverConfig.id;
  const toolsUrl = `${serverConfig.url}${serverConfig.tools_endpoint}`;
  const timeout = serverConfig.timeout || 3000;
  const retryAttempts = serverConfig.retry_attempts || 3;
  
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
    // Usa il client MCP per ottenere i tool via JSON-RPC
    const MCPClient = require('./mcpClient');
    const mcpClient = new MCPClient();
    
    const tools = await mcpClient.getToolsList(serverConfig);
    
    // Converti i tool MCP in formato interno
    const formattedTools = tools.map(tool => createToolFromMcpSchema(tool, serverConfig));
    
    // Aggiorna cache
    mcpConfigManager.updateCache(serverId, formattedTools);
    
    console.log(`✅ ${serverConfig.name}: Successfully discovered ${formattedTools.length} MCP tools`);
    return formattedTools;
    
  } catch (error) {
    console.warn(`❌ ${serverConfig.name}: MCP discovery failed - ${error.message}`);
    throw error;
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
    description: `[${serverConfig.name}] ${mcpTool.description || mcpTool.name}`,
    serverId: serverConfig.id,
    serverName: serverConfig.name,
    serverType: 'command',
    inputSchema: mcpTool.inputSchema,
    isCommand: true,
    call: async function(params) {
      const MCPClient = require('./mcpClient');
      const mcpClient = new MCPClient();
      return await mcpClient.callTool(serverConfig, this.name, params);
    }
  };
}

/**
 * Tools di fallback quando nessun server è disponibile
 */
function getFallbackTools() {
  console.log('🔄 Loading fallback MCP tools');
  
  const fallbackBaseUrl = process.env.MCP_BASE_URL || 'http://localhost:8080';
  
  return [
    {
      name: 'get_interns_mcp',
      description: '[Fallback] Retrieves a list of interns from Mauden via MCP.',
      serverId: 'fallback',
      serverName: 'Fallback Server',
      call: async function(input) {
        try {
          const response = await axios.get(`${fallbackBaseUrl}/interns`);
          return JSON.stringify(response.data);
        } catch (err) {
          return JSON.stringify({
            error: 'Failed to invoke fallback tool get_interns_mcp',
            details: err.message
          });
        }
      }
    },
    {
      name: 'get_employees_csv_mcp',
      description: '[Fallback] Retrieves complete employee data from Mauden.',
      serverId: 'fallback',
      serverName: 'Fallback Server',
      call: async function(input) {
        try {
          const response = await axios.get(`${fallbackBaseUrl}/employees-csv`);
          return JSON.stringify(response.data);
        } catch (err) {
          return JSON.stringify({
            error: 'Failed to invoke fallback tool get_employees_csv_mcp',
            details: err.message
          });
        }
      }
    }
  ];
}

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
}module.exports = { getAllMcpTools };
