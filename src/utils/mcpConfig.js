// MCP Configuration Manager - Gestisce la configurazione multi-server
const fs = require('fs');
const path = require('path');
const axios = require('axios');

class McpConfigManager {
  constructor() {
    this.configPath = path.join(__dirname, '..', '..', 'mcp_servers_standard.json');
    this.config = null;
    this.toolsCache = new Map(); // Cache per server
    this.lastCacheUpdate = new Map();
    this.connectionErrors = new Map(); // Track connection errors per server
    this.lastErrorTime = new Map(); // Track when errors occurred
    this.errorThreshold = 30000; // 30 seconds threshold for recent errors
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
      const rawConfig = JSON.parse(configContent);
      
      // Converti la struttura del file mcp_servers_standard.json in una struttura unificata
      this.config = this.normalizeConfig(rawConfig);
      
      console.log(`✅ Loaded MCP configuration with ${this.config.servers.length} servers`);
      return this.config;
    } catch (error) {
      console.error(`❌ Error loading MCP config: ${error.message}`);
      return this.getDefaultConfig();
    }
  }

  /**
   * Normalizza la configurazione dal formato mcp_servers_standard.json
   */
  normalizeConfig(rawConfig) {
    const servers = [];
    
    // Aggiungi server HTTP dal campo httpServers
    if (rawConfig.httpServers && Array.isArray(rawConfig.httpServers)) {
      for (const server of rawConfig.httpServers) {
        servers.push({
          id: server.id,
          name: server.name,
          url: server.url,
          mcp_endpoint: server.mcp_endpoint || '/mcp',
          tools_endpoint: server.tools_endpoint || '/tools',
          description: server.description,
          enabled: server.enabled !== false, // default true
          timeout: server.timeout || 10000,
          retry_attempts: server.retry_attempts || 3,
          priority: server.priority || 1,
          type: 'http'
        });
      }
    }
    
    // Aggiungi server STDIO dal campo mcpServers (se necessario in futuro)
    if (rawConfig.mcpServers && typeof rawConfig.mcpServers === 'object') {
      for (const [key, server] of Object.entries(rawConfig.mcpServers)) {
        if (server.enabled) {
          servers.push({
            id: key,
            name: server.name || key,
            command: server.command,
            args: server.args,
            description: server.description,
            enabled: server.enabled !== false,
            timeout: server.timeout || 10000,
            retry_attempts: server.retry_attempts || 3,
            priority: server.priority || 1,
            type: 'stdio'
          });
        }
      }
    }
    
    return {
      servers,
      discovery: rawConfig.discovery || {
        enabled: true,
        timeout_per_server: 10000,
        max_concurrent_discoveries: 3,
        cache_ttl_minutes: 5,
        fallback_to_mock: true
      },
      tools_override: rawConfig.tools_override || {
        enabled: false,
        custom_tools: []
      }
    };
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
    // Protezione contro config null/undefined
    if (!this.config) {
      console.warn(`⚠️ isCacheValid: Config is null, reloading for ${serverId}`);
      this.loadConfig();
    }
    
    if (!this.config || !this.config.discovery) {
      console.warn(`⚠️ isCacheValid: Invalid config or discovery config for ${serverId}`);
      return false;
    }
    
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
   * Registra un errore di connessione per un server
   */
  recordConnectionError(serverId, error) {
    this.connectionErrors.set(serverId, error);
    this.lastErrorTime.set(serverId, Date.now());
    console.warn(`📝 Recorded connection error for ${serverId}: ${error.message}`);
  }

  /**
   * Verifica se ci sono stati errori di connessione recenti
   */
  hasRecentConnectionErrors(serverId) {
    const lastError = this.lastErrorTime.get(serverId);
    if (!lastError) return false;
    
    const timeSinceError = Date.now() - lastError;
    return timeSinceError < this.errorThreshold;
  }

  /**
   * Cancella gli errori di connessione per un server (dopo una connessione riuscita)
   */
  clearConnectionErrors(serverId) {
    this.connectionErrors.delete(serverId);
    this.lastErrorTime.delete(serverId);
    console.log(`✅ Cleared connection errors for ${serverId}`);
  }

  /**
   * Ottiene le statistiche degli errori di connessione
   */
  getConnectionErrorStats() {
    const stats = {
      totalServersWithErrors: this.connectionErrors.size,
      recentErrors: 0,
      errorsByServer: {}
    };

    for (const [serverId, error] of this.connectionErrors) {
      const lastError = this.lastErrorTime.get(serverId);
      const isRecent = lastError && (Date.now() - lastError) < this.errorThreshold;
      
      if (isRecent) {
        stats.recentErrors++;
      }
      
      stats.errorsByServer[serverId] = {
        error: error.message,
        lastOccurred: new Date(lastError).toISOString(),
        isRecent
      };
    }

    return stats;
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
