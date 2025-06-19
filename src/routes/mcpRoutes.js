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
  
  // Aggiungi server command (formato standard MCP)
  if (config.mcpServers) {
    Object.entries(config.mcpServers).forEach(([name, serverConfig]) => {
      servers.push({
        id: name.toLowerCase().replace(/\s+/g, '_'),
        name,
        type: 'command',
        command: serverConfig.command,        args: serverConfig.args,
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
      config.httpServers.push(newServer);
    } else if (newServer.type === 'command') {
      if (!config.mcpServers) config.mcpServers = {};
      config.mcpServers[newServer.name] = {
        command: newServer.command,        args: newServer.args,
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
      }
    } else if (updatedServer.type === 'command') {
      if (config.mcpServers[updatedServer.name]) {
        config.mcpServers[updatedServer.name] = {
          command: updatedServer.command,          args: updatedServer.args,
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
    
    // Cerca nei server command
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
    
    // Cerca nei server command
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
    
    if (server.type === 'command') {
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
    
    if (server.type === 'command') {
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
