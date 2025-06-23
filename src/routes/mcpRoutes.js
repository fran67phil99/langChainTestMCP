const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const MCPClient = require('../utils/mcpClient');

const router = express.Router();
const CONFIG_FILE = path.join(__dirname, '../../mcp_servers_standard.json');
const mcpClient = new MCPClient();

// Utility per caricare configurazione
async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Errore caricamento config:', error);
    return { mcpServers: {}, httpServers: [], discovery: {} };
  }
}

// Utility per salvare configurazione
async function saveConfig(config) {
  try {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('Errore salvataggio config:', error);
    return false;
  }
}

// Converte configurazione in formato unified per frontend
function unifyServerConfig(config) {
  const servers = [];
  
  // Aggiungi server HTTP
  if (config.httpServers) {
    servers.push(...config.httpServers.map(server => ({
      ...server,
      type: 'http'
    })));
  }
  
  // Aggiungi server STDIO (formato standard MCP)
  if (config.mcpServers) {
    Object.entries(config.mcpServers).forEach(([name, serverConfig]) => {
      servers.push({
        id: name.toLowerCase().replace(/\s+/g, '_'),
        name,
        type: 'stdio',
        command: serverConfig.command,
        args: serverConfig.args,
        enabled: serverConfig.enabled !== false,
        timeout: serverConfig.timeout || 10000,
        description: serverConfig.description || ''
      });
    });
  }
  
  return servers;
}

// GET /api/mcp/servers - Lista tutti i server
router.get('/servers', async (req, res) => {
  try {
    const config = await loadConfig();
    const servers = unifyServerConfig(config);
    res.json(servers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/mcp/servers - Aggiungi nuovo server
router.post('/servers', async (req, res) => {
  try {
    const config = await loadConfig();
    const newServer = req.body;
    
    if (newServer.type === 'http') {
      if (!config.httpServers) config.httpServers = [];
      config.httpServers.push(newServer);    } else if (newServer.type === 'stdio') {
      if (!config.mcpServers) config.mcpServers = {};
      config.mcpServers[newServer.name] = {
        command: newServer.command,
        args: newServer.args,
        enabled: newServer.enabled,
        timeout: newServer.timeout,
        description: newServer.description
      };
    }
    
    const saved = await saveConfig(config);
    if (saved) {
      res.json({ success: true, server: newServer });
    } else {
      res.status(500).json({ error: 'Errore salvataggio configurazione' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/mcp/servers/:id - Modifica server esistente
router.put('/servers/:id', async (req, res) => {
  try {
    const config = await loadConfig();
    const serverId = req.params.id;
    const updatedServer = req.body;
    
    if (updatedServer.type === 'http') {
      const index = config.httpServers?.findIndex(s => s.id === serverId);
      if (index !== -1) {
        config.httpServers[index] = updatedServer;
      }    } else if (updatedServer.type === 'stdio') {
      if (config.mcpServers[updatedServer.name]) {
        config.mcpServers[updatedServer.name] = {
          command: updatedServer.command,
          args: updatedServer.args,
          enabled: updatedServer.enabled,
          timeout: updatedServer.timeout,
          description: updatedServer.description
        };
      }
    }
    
    const saved = await saveConfig(config);
    if (saved) {
      res.json({ success: true, server: updatedServer });
    } else {
      res.status(500).json({ error: 'Errore salvataggio configurazione' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/mcp/servers/:id - Elimina server
router.delete('/servers/:id', async (req, res) => {
  try {
    const config = await loadConfig();
    const serverId = req.params.id;
    
    // Cerca nei server HTTP
    if (config.httpServers) {
      config.httpServers = config.httpServers.filter(s => s.id !== serverId);
    }
      // Cerca nei server STDIO
    if (config.mcpServers) {
      const serverName = Object.keys(config.mcpServers).find(name => 
        name.toLowerCase().replace(/\s+/g, '_') === serverId
      );
      if (serverName) {
        delete config.mcpServers[serverName];
      }
    }
    
    const saved = await saveConfig(config);
    if (saved) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Errore salvataggio configurazione' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/mcp/servers/:id/toggle - Toggle enable/disable
router.post('/servers/:id/toggle', async (req, res) => {
  try {
    const config = await loadConfig();
    const serverId = req.params.id;
    
    // Cerca nei server HTTP
    const httpServer = config.httpServers?.find(s => s.id === serverId);
    if (httpServer) {
      httpServer.enabled = !httpServer.enabled;
    }
      // Cerca nei server STDIO
    const serverName = Object.keys(config.mcpServers || {}).find(name => 
      name.toLowerCase().replace(/\s+/g, '_') === serverId
    );
    if (serverName) {
      config.mcpServers[serverName].enabled = !config.mcpServers[serverName].enabled;
    }
    
    const saved = await saveConfig(config);
    if (saved) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Errore salvataggio configurazione' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/mcp/servers/:id/tools - Ottiene la lista dei tool da un server MCP
router.get('/servers/:id/tools', async (req, res) => {
  try {
    const config = await loadConfig();
    const serverId = req.params.id;
    
    // Trova il server
    const servers = unifyServerConfig(config);
    const server = servers.find(s => s.id === serverId);
    
    if (!server) {
      return res.json({ success: false, error: 'Server non trovato' });
    }
      if (server.type === 'stdio') {
      // Per server MCP standard, usa il client MCP
      try {
        const tools = await mcpClient.getToolsList(server);
        res.json({ success: true, tools: tools });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    } else if (server.type === 'http') {
      // Per server HTTP, usa l'endpoint /tools
      const axios = require('axios');
      try {
        const response = await axios.get(`${server.url}${server.tools_endpoint || '/tools'}`, {
          timeout: server.timeout || 5000
        });
        res.json({ success: true, tools: response.data });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    } else {
      res.json({ success: false, error: 'Tipo server non supportato' });
    }
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/mcp/servers/:id/tools/:toolName/call - Invoca un tool specifico
router.post('/servers/:id/tools/:toolName/call', async (req, res) => {
  try {
    const config = await loadConfig();
    const serverId = req.params.id;
    const toolName = req.params.toolName;
    const arguments_ = req.body.arguments || {};
    
    // Trova il server
    const servers = unifyServerConfig(config);
    const server = servers.find(s => s.id === serverId);
    
    if (!server) {
      return res.json({ success: false, error: 'Server non trovato' });
    }
      if (server.type === 'stdio') {
      // Per server MCP standard, usa il client MCP
      try {
        const result = await mcpClient.callTool(server, toolName, arguments_);
        res.json({ success: true, result: result });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    } else {
      res.json({ success: false, error: 'Tool call supportato solo per server MCP standard' });
    }
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/mcp/servers/:id/test - Testa connessione server
router.get('/servers/:id/test', async (req, res) => {
  try {
    const config = await loadConfig();
    const serverId = req.params.id;
    
    // Trova il server
    const servers = unifyServerConfig(config);
    const server = servers.find(s => s.id === serverId);
    
    if (!server) {
      return res.json({ success: false, error: 'Server non trovato' });
    }
    
    if (server.type === 'http') {
      // Test HTTP server
      const axios = require('axios');
      try {
        const response = await axios.get(`${server.url}${server.tools_endpoint || '/tools'}`, {
          timeout: server.timeout || 5000
        });
        res.json({ success: true, status: response.status });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }    } else {
      // Test server MCP standard - prova a connettersi e ottenere la lista dei tool
      try {
        const tools = await mcpClient.getToolsList(server, true); // throwOnError = true per i test
        res.json({ 
          success: true, 
          note: `Server MCP connesso - ${tools.length} tool disponibili`,
          toolsCount: tools.length 
        });
      } catch (error) {
        res.json({ success: false, error: `Errore connessione MCP: ${error.message}` });
      }
    }
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ENDPOINT SPECIFICI PER FRONTEND ====================

// GET /api/mcp/configuration - Configurazione completa
router.get('/configuration', async (req, res) => {
  try {
    const config = await loadConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/mcp/http-servers - Lista server HTTP
router.get('/http-servers', async (req, res) => {
  try {
    const config = await loadConfig();
    res.json(config.httpServers || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/mcp/http-servers - Aggiungi server HTTP
router.post('/http-servers', async (req, res) => {
  try {
    const config = await loadConfig();
    const newServer = req.body;
    
    if (!config.httpServers) config.httpServers = [];
    
    // Assicurati che abbia un ID
    if (!newServer.id) {
      newServer.id = `server_${Date.now()}`;
    }
    
    config.httpServers.push(newServer);
    
    const saved = await saveConfig(config);
    if (saved) {
      res.json({ success: true, server: newServer });
    } else {
      res.status(500).json({ error: 'Errore salvataggio configurazione' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/mcp/http-servers/:id - Modifica server HTTP
router.put('/http-servers/:id', async (req, res) => {
  try {
    const config = await loadConfig();
    const serverId = req.params.id;
    const updatedServer = req.body;
    
    if (!config.httpServers) config.httpServers = [];
    
    const index = config.httpServers.findIndex(s => s.id === serverId);
    if (index !== -1) {
      config.httpServers[index] = updatedServer;
      
      const saved = await saveConfig(config);
      if (saved) {
        res.json({ success: true, server: updatedServer });
      } else {
        res.status(500).json({ error: 'Errore salvataggio configurazione' });
      }
    } else {
      res.status(404).json({ error: 'Server non trovato' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/mcp/http-servers/:id - Elimina server HTTP
router.delete('/http-servers/:id', async (req, res) => {
  try {
    const config = await loadConfig();
    const serverId = req.params.id;
    
    if (!config.httpServers) config.httpServers = [];
    
    const initialLength = config.httpServers.length;
    config.httpServers = config.httpServers.filter(s => s.id !== serverId);
    
    if (config.httpServers.length < initialLength) {
      const saved = await saveConfig(config);
      if (saved) {
        res.json({ success: true });
      } else {
        res.status(500).json({ error: 'Errore salvataggio configurazione' });
      }
    } else {
      res.status(404).json({ error: 'Server non trovato' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/mcp/http-servers/:id/toggle - Toggle server HTTP
router.post('/http-servers/:id/toggle', async (req, res) => {
  try {
    const config = await loadConfig();
    const serverId = req.params.id;
    
    if (!config.httpServers) config.httpServers = [];
    
    const server = config.httpServers.find(s => s.id === serverId);
    if (server) {
      server.enabled = !server.enabled;
      
      const saved = await saveConfig(config);
      if (saved) {
        res.json({ success: true, enabled: server.enabled });
      } else {
        res.status(500).json({ error: 'Errore salvataggio configurazione' });
      }
    } else {
      res.status(404).json({ error: 'Server non trovato' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/mcp/http-servers/:id/test - Test server HTTP con protocollo MCP
router.get('/http-servers/:id/test', async (req, res) => {
  try {
    const config = await loadConfig();
    const serverId = req.params.id;
    
    const server = config.httpServers?.find(s => s.id === serverId);
    if (!server) {
      return res.json({ success: false, error: 'Server non trovato' });
    }
    
    const axios = require('axios');
    const startTime = Date.now();
    
    // Lista degli endpoint MCP comuni da provare
    const mcpEndpoints = [
      server.mcp_endpoint || '/mcp',  // Endpoint MCP specificato o default
      '/',                             // Root endpoint
      '/rpc',                         // Altro endpoint comune
      '/jsonrpc'                      // Altro endpoint comune
    ];
    
    console.log(`🔧 Testing MCP server ${server.name} with multiple endpoints...`);
    
    // Prova il protocollo MCP su diversi endpoint
    for (const endpoint of mcpEndpoints) {
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
              name: "Mauden MCP Test Client",
              version: "1.0.0"
            }
          }
        };
        
        console.log(`🔧 Testing MCP server ${server.name} - Endpoint: ${endpoint} - Step 1: Initialize`);
        const testUrl = `${server.url}${endpoint}`;
        
        const initResponse = await axios.post(testUrl, initializePayload, {
          timeout: Math.min(server.timeout || 10000, 5000), // Timeout più breve per test
          headers: {
            'Content-Type': 'application/json'
          },
          validateStatus: function (status) {
            return status >= 200 && status < 500;
          }
        });
        
        if (initResponse.status === 200 && initResponse.data?.result) {
          // Successo! Prova la seconda chiamata
          console.log(`✅ MCP Initialize successful on ${endpoint}`);
          
          // 2. Seconda chiamata: tools/list per scoprire i tool disponibili
          const toolsListPayload = {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/list",
            params: {}
          };
          
          console.log(`🔧 Testing MCP server ${server.name} - Endpoint: ${endpoint} - Step 2: Tools List`);
          const toolsResponse = await axios.post(testUrl, toolsListPayload, {
            timeout: Math.min(server.timeout || 10000, 5000),
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          const responseTime = Date.now() - startTime;
          
          if (toolsResponse.status === 200 && toolsResponse.data?.result?.tools) {
            const tools = toolsResponse.data.result.tools;
            return res.json({
              success: true,
              status: toolsResponse.status,
              responseTime: responseTime,
              tools: tools.length,
              toolsList: tools.map(tool => ({
                name: tool.name,
                description: tool.description
              })),
              message: `Server MCP funzionante su ${endpoint} - ${tools.length} tool disponibili`,
              protocol: 'MCP JSON-RPC 2.0',
              endpoint: endpoint
            });
          } else {
            return res.json({
              success: true,
              status: toolsResponse.status,
              responseTime: responseTime,
              warning: `Server MCP inizializzato su ${endpoint} ma nessun tool trovato`,
              response: toolsResponse.data,
              protocol: 'MCP JSON-RPC 2.0',
              endpoint: endpoint
            });
          }
        } else if (initResponse.status === 404) {
          console.log(`⚠️  MCP endpoint ${endpoint} not found (404), trying next...`);
          // Continua con il prossimo endpoint
          continue;
        } else {
          console.log(`⚠️  MCP endpoint ${endpoint} returned ${initResponse.status}, trying next...`);
          // Continua con il prossimo endpoint
          continue;
        }
        
      } catch (endpointError) {
        console.log(`⚠️  MCP endpoint ${endpoint} failed: ${endpointError.message}, trying next...`);
        // Continua con il prossimo endpoint
        continue;
      }
    }
    
    // Se tutti gli endpoint MCP falliscono, prova con endpoint REST classico
    console.log(`⚠️  All MCP endpoints failed for ${server.name}, trying REST endpoints...`);
    
    try {
      const toolsEndpoint = server.tools_endpoint || '/tools';
      const testUrl = `${server.url}${toolsEndpoint}`;
      
      const restResponse = await axios.get(testUrl, {
        timeout: server.timeout || 5000,
        validateStatus: function (status) {
          return status >= 200 && status < 500;
        }
      });
      
      const responseTime = Date.now() - startTime;
      
      if (restResponse.status === 200) {
        return res.json({
          success: true,
          status: restResponse.status,
          responseTime: responseTime,
          tools: Array.isArray(restResponse.data) ? restResponse.data.length : 'N/A',
          message: `Server REST funzionante su ${toolsEndpoint}`,
          protocol: 'HTTP REST',
          endpoint: toolsEndpoint,
          note: 'MCP protocol non supportato, ma REST endpoint disponibile'
        });
      } else if (restResponse.status === 404) {
        // Prova endpoint root
        try {
          const rootResponse = await axios.get(server.url, {
            timeout: server.timeout || 5000,
            validateStatus: function (status) {
              return status >= 200 && status < 500;
            }
          });
          
          return res.json({
            success: true,
            status: rootResponse.status,
            responseTime: Date.now() - startTime,
            warning: `Endpoint ${toolsEndpoint} non trovato (404), ma server raggiungibile`,
            message: `Server risponde su endpoint root con status ${rootResponse.status}`,
            protocol: 'HTTP',
            endpoint: '/'
          });
        } catch (rootError) {
          return res.json({
            success: false,
            error: `Tutti gli endpoint falliti - MCP non supportato e REST non raggiungibile`,
            responseTime: Date.now() - startTime,
            details: {
              mcpEndpoints: mcpEndpoints,
              restEndpoint: toolsEndpoint,
              rootError: rootError.message
            }
          });
        }
      } else {
        return res.json({
          success: false,
          error: `MCP protocol non supportato, REST endpoint risponde con status ${restResponse.status}`,
          status: restResponse.status,
          responseTime: responseTime,
          endpoint: toolsEndpoint
        });
      }
    } catch (restError) {
      return res.json({
        success: false,
        error: `Tutti i protocolli falliti - Server non raggiungibile`,
        responseTime: Date.now() - startTime,
        details: {
          mcpEndpoints: mcpEndpoints,
          restError: restError.message
        }
      });
    }
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/mcp/stdio-servers - Lista server STDIO
router.get('/stdio-servers', async (req, res) => {
  try {
    const config = await loadConfig();
    
    // Converti il formato mcpServers in array con id
    const stdioServers = Object.entries(config.mcpServers || {}).map(([name, serverConfig]) => ({
      id: name,
      name: name,
      command: serverConfig.command,
      args: serverConfig.args,
      enabled: serverConfig.enabled !== false,
      timeout: serverConfig.timeout || 10000,
      description: serverConfig.description || ''
    }));
    
    res.json(stdioServers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/mcp/stdio-servers - Aggiungi server STDIO
router.post('/stdio-servers', async (req, res) => {
  try {
    const config = await loadConfig();
    const newServer = req.body;
    
    if (!config.mcpServers) config.mcpServers = {};
    
    // Usa il nome come chiave
    const serverName = newServer.name || newServer.id || `server_${Date.now()}`;
    
    config.mcpServers[serverName] = {
      command: newServer.command,
      args: newServer.args,
      enabled: newServer.enabled !== false,
      timeout: newServer.timeout || 10000,
      description: newServer.description || ''
    };
    
    const saved = await saveConfig(config);
    if (saved) {
      res.json({ success: true, server: { id: serverName, ...config.mcpServers[serverName] } });
    } else {
      res.status(500).json({ error: 'Errore salvataggio configurazione' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/mcp/stdio-servers/:id - Modifica server STDIO
router.put('/stdio-servers/:id', async (req, res) => {
  try {
    const config = await loadConfig();
    const serverId = req.params.id;
    const updatedServer = req.body;
    
    if (!config.mcpServers) config.mcpServers = {};
    
    if (config.mcpServers[serverId]) {
      config.mcpServers[serverId] = {
        command: updatedServer.command,
        args: updatedServer.args,
        enabled: updatedServer.enabled !== false,
        timeout: updatedServer.timeout || 10000,
        description: updatedServer.description || ''
      };
      
      const saved = await saveConfig(config);
      if (saved) {
        res.json({ success: true, server: { id: serverId, ...config.mcpServers[serverId] } });
      } else {
        res.status(500).json({ error: 'Errore salvataggio configurazione' });
      }
    } else {
      res.status(404).json({ error: 'Server non trovato' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/mcp/stdio-servers/:id - Elimina server STDIO
router.delete('/stdio-servers/:id', async (req, res) => {
  try {
    const config = await loadConfig();
    const serverId = req.params.id;
    
    if (!config.mcpServers) config.mcpServers = {};
    
    if (config.mcpServers[serverId]) {
      delete config.mcpServers[serverId];
      
      const saved = await saveConfig(config);
      if (saved) {
        res.json({ success: true });
      } else {
        res.status(500).json({ error: 'Errore salvataggio configurazione' });
      }
    } else {
      res.status(404).json({ error: 'Server non trovato' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/mcp/stdio-servers/:id/toggle - Toggle server STDIO
router.post('/stdio-servers/:id/toggle', async (req, res) => {
  try {
    const config = await loadConfig();
    const serverId = req.params.id;
    
    if (!config.mcpServers) config.mcpServers = {};
    
    if (config.mcpServers[serverId]) {
      config.mcpServers[serverId].enabled = !config.mcpServers[serverId].enabled;
      
      const saved = await saveConfig(config);
      if (saved) {
        res.json({ success: true, enabled: config.mcpServers[serverId].enabled });
      } else {
        res.status(500).json({ error: 'Errore salvataggio configurazione' });
      }
    } else {
      res.status(404).json({ error: 'Server non trovato' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/mcp/stdio-servers/:id/test - Test server STDIO
router.get('/stdio-servers/:id/test', async (req, res) => {
  try {
    const config = await loadConfig();
    const serverId = req.params.id;
    
    const serverConfig = config.mcpServers?.[serverId];
    if (!serverConfig) {
      return res.json({ success: false, error: 'Server non trovato' });
    }
    
    const server = {
      id: serverId,
      name: serverId,
      type: 'stdio',
      command: serverConfig.command,
      args: serverConfig.args,
      enabled: serverConfig.enabled,
      timeout: serverConfig.timeout,
      description: serverConfig.description
    };
    
    const startTime = Date.now();
    
    try {
      const tools = await mcpClient.getToolsList(server, true);
      const responseTime = Date.now() - startTime;
      
      res.json({ 
        success: true, 
        note: `Server MCP connesso - ${tools.length} tool disponibili`,
        toolsCount: tools.length,
        responseTime: responseTime
      });
    } catch (error) {
      res.json({ 
        success: false, 
        error: `Errore connessione MCP: ${error.message}`,
        responseTime: Date.now() - startTime
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/mcp/server-mode - Configurazione modalità server
router.get('/server-mode', async (req, res) => {
  try {
    // Per ora restituiamo una configurazione predefinita
    // Questo potrebbe essere estratto da un file di configurazione separato
    const serverMode = {
      serverMode: 'both', // 'rest', 'mcp', 'both'
      restServer: {
        enabled: true,
        port: 8080,
        description: 'Server REST per API HTTP classiche'
      },
      mcpServer: {
        enabled: true,
        port: 5009,
        description: 'Server MCP per protocollo Model Context Protocol'
      },
      defaultMode: 'both',
      allowModeSwitch: true
    };
    
    res.json(serverMode);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/mcp/server-mode - Aggiorna modalità server
router.post('/server-mode', async (req, res) => {
  try {
    const { mode } = req.body;
    
    if (!['rest', 'mcp', 'both'].includes(mode)) {
      return res.status(400).json({ error: 'Modalità non valida' });
    }
    
    // Per ora logghiamo la richiesta
    console.log(`🔄 Richiesta cambio modalità server: ${mode}`);
    
    // In una implementazione completa, qui salveresti la modalità in un file di configurazione
    // e riavvieresti i server appropriati
    
    res.json({ success: true, mode: mode });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/mcp/start-servers - Avvia server
router.post('/start-servers', async (req, res) => {
  try {
    const { mode } = req.body;
    
    console.log(`🚀 Richiesta avvio server in modalità: ${mode || 'both'}`);
    
    // In una implementazione completa, qui avvieresti i server appropriati
    // basandoti sulla modalità richiesta
    
    res.json({ success: true, message: `Server avviati in modalità: ${mode || 'both'}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/mcp/stop-servers - Arresta server
router.post('/stop-servers', async (req, res) => {
  try {
    console.log('🛑 Richiesta arresto server');
    
    // In una implementazione completa, qui arresteresti tutti i server
    
    res.json({ success: true, message: 'Server arrestati' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== FINE ENDPOINT SPECIFICI ====================

// Process cleanup quando il server si chiude
process.on('SIGINT', async () => {
  console.log('Closing MCP connections...');
  await mcpClient.disconnectAll();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Closing MCP connections...');
  await mcpClient.disconnectAll();
  process.exit(0);
});

module.exports = router;
