// MCP Configuration Manager - Gestisce la configurazione multi-server
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class McpConfigManager {
  constructor() {
    this.configPath = path.join(__dirname, '..', '..', 'mcp_servers.json');
    this.config = null;
    this.toolsCache = new Map(); // Cache per server
    this.lastCacheUpdate = new Map();
  }

  /**
   * Carica la configurazione dal file JSON
   */
  loadConfig() {
    try {
      if (!fs.existsSync(this.configPath)) {
        console.warn(`⚠️ MCP config file not found: ${this.configPath}`);
        return this.getDefaultConfig();
      }

      const configContent = fs.readFileSync(this.configPath, 'utf8');
      this.config = JSON.parse(configContent);
      console.log(`✅ Loaded MCP configuration with ${this.config.servers.length} servers`);
      return this.config;
    } catch (error) {
      console.error(`❌ Error loading MCP config: ${error.message}`);
      return this.getDefaultConfig();
    }
  }

  /**
   * Configurazione di default se il file non esiste
   */
  getDefaultConfig() {
    return {
      servers: [
        {
          id: "default_server",
          name: "Default MCP Server",
          url: process.env.MCP_BASE_URL || "http://localhost:8080",
          tools_endpoint: "/tools",
          description: "Default MCP server from environment",
          enabled: true,
          timeout: 10000,
          retry_attempts: 3,
          priority: 1
        }
      ],
      discovery: {
        enabled: process.env.MCP_ENABLE_DISCOVERY !== 'false',
        timeout_per_server: 10000,
        max_concurrent_discoveries: 3,
        cache_ttl_minutes: 5,
        fallback_to_mock: true
      },
      tools_override: {
        enabled: false,
        custom_tools: []
      }
    };
  }

  /**
   * Ottiene tutti i server abilitati
   */
  getEnabledServers() {
    if (!this.config) {
      this.loadConfig();
    }
    
    return this.config.servers
      .filter(server => server.enabled)
      .sort((a, b) => (a.priority || 1) - (b.priority || 1));
  }

  /**
   * Verifica se la cache è valida per un server
   */
  isCacheValid(serverId) {
    const lastUpdate = this.lastCacheUpdate.get(serverId);
    if (!lastUpdate) return false;

    const ttlMs = (this.config.discovery.cache_ttl_minutes || 5) * 60 * 1000;
    return (Date.now() - lastUpdate) < ttlMs;
  }

  /**
   * Aggiorna la cache per un server
   */
  updateCache(serverId, tools) {
    this.toolsCache.set(serverId, tools);
    this.lastCacheUpdate.set(serverId, Date.now());
  }

  /**
   * Ottiene i tool dalla cache
   */
  getCachedTools(serverId) {
    return this.toolsCache.get(serverId) || [];
  }

  /**
   * Ottiene la configurazione di discovery
   */
  getDiscoveryConfig() {
    if (!this.config) {
      this.loadConfig();
    }
    return this.config.discovery;
  }

  /**
   * Verifica se il discovery è abilitato
   */
  isDiscoveryEnabled() {
    return this.getDiscoveryConfig().enabled;
  }

  /**
   * Ottiene i tool personalizzati se abilitati
   */
  getCustomTools() {
    if (!this.config) {
      this.loadConfig();
    }
    
    if (this.config.tools_override.enabled) {
      return this.config.tools_override.custom_tools;
    }
    return [];
  }

  /**
   * Aggiunge un nuovo server alla configurazione
   */
  addServer(serverConfig) {
    if (!this.config) {
      this.loadConfig();
    }

    // Verifica che l'ID sia unico
    if (this.config.servers.find(s => s.id === serverConfig.id)) {
      throw new Error(`Server with ID '${serverConfig.id}' already exists`);
    }

    // Aggiungi valori di default se mancanti
    const newServer = {
      enabled: true,
      timeout: 10000,
      retry_attempts: 3,
      priority: this.config.servers.length + 1,
      tools_endpoint: "/tools",
      ...serverConfig
    };

    this.config.servers.push(newServer);
    this.saveConfig();
    console.log(`✅ Added new MCP server: ${newServer.name} (${newServer.id})`);
  }

  /**
   * Rimuove un server dalla configurazione
   */
  removeServer(serverId) {
    if (!this.config) {
      this.loadConfig();
    }

    const index = this.config.servers.findIndex(s => s.id === serverId);
    if (index === -1) {
      throw new Error(`Server with ID '${serverId}' not found`);
    }

    const removed = this.config.servers.splice(index, 1)[0];
    
    // Pulisci la cache
    this.toolsCache.delete(serverId);
    this.lastCacheUpdate.delete(serverId);
    
    this.saveConfig();
    console.log(`✅ Removed MCP server: ${removed.name} (${serverId})`);
  }

  /**
   * Salva la configurazione nel file
   */
  saveConfig() {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
      console.log('✅ MCP configuration saved successfully');
    } catch (error) {
      console.error(`❌ Error saving MCP config: ${error.message}`);
      throw error;
    }
  }

  /**
   * Ricarica la configurazione dal file
   */
  reloadConfig() {
    this.config = null;
    this.toolsCache.clear();
    this.lastCacheUpdate.clear();
    return this.loadConfig();
  }
}

// Esporta singleton
const mcpConfigManager = new McpConfigManager();
module.exports = { mcpConfigManager };
