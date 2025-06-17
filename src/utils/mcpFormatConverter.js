// MCP Format Converter - Supporta formati standard e personalizzati
const fs = require('fs');
const path = require('path');

class McpFormatConverter {
  constructor() {
    this.standardConfigPath = path.join(__dirname, '../../mcp_servers_standard.json');
    this.originalConfigPath = path.join(__dirname, '../../mcp_servers.json');
  }

  /**
   * Carica configurazione supportando entrambi i formati
   */
  loadUnifiedConfig() {
    try {
      // Prova prima il nuovo formato standard
      if (fs.existsSync(this.standardConfigPath)) {
        const standardData = fs.readFileSync(this.standardConfigPath, 'utf8');
        const standardConfig = JSON.parse(standardData);
        return this.normalizeStandardConfig(standardConfig);
      }
      
      // Fallback al formato originale
      if (fs.existsSync(this.originalConfigPath)) {
        const originalData = fs.readFileSync(this.originalConfigPath, 'utf8');
        return JSON.parse(originalData);
      }
      
      return this.getDefaultConfig();
    } catch (error) {
      console.error('Error loading MCP configuration:', error);
      return this.getDefaultConfig();
    }
  }

  /**
   * Normalizza configurazione standard MCP al formato interno
   */
  normalizeStandardConfig(standardConfig) {
    const normalized = {
      servers: [],
      discovery: standardConfig.discovery || this.getDefaultDiscovery(),
      tools_override: standardConfig.tools_override || { enabled: false, custom_tools: [] }
    };

    // Converti httpServers
    if (standardConfig.httpServers) {
      normalized.servers.push(...standardConfig.httpServers.map(server => ({
        ...server,
        type: 'http'
      })));
    }

    // Converti mcpServers (comando) in formato interno
    if (standardConfig.mcpServers) {
      Object.entries(standardConfig.mcpServers).forEach(([name, config]) => {
        normalized.servers.push({
          id: name.toLowerCase().replace(/\s+/g, '_'),
          name,
          command: config.command,
          args: config.args,
          enabled: config.enabled !== false,
          timeout: config.timeout || 10000,
          retry_attempts: config.retry_attempts || 3,
          priority: config.priority || 99,
          quick_route_patterns: config.quick_route_patterns || [],
          description: config.description || '',
          type: 'command'
        });
      });
    }

    return normalized;
  }

  /**
   * Converte dal formato interno al formato standard MCP
   */
  convertToStandardFormat(internalConfig) {
    const standardConfig = {
      mcpServers: {},
      httpServers: [],
      discovery: internalConfig.discovery || this.getDefaultDiscovery(),
      tools_override: internalConfig.tools_override || { enabled: false, custom_tools: [] }
    };

    internalConfig.servers.forEach(server => {
      if (server.type === 'command' || (server.command && server.args)) {
        // Server di tipo comando
        standardConfig.mcpServers[server.name] = {
          command: server.command,
          args: server.args,
          enabled: server.enabled,
          timeout: server.timeout,
          retry_attempts: server.retry_attempts,
          priority: server.priority,
          quick_route_patterns: server.quick_route_patterns,
          description: server.description
        };
      } else {
        // Server HTTP
        const { type, command, args, ...httpServer } = server;
        standardConfig.httpServers.push(httpServer);
      }
    });

    return standardConfig;
  }

  /**
   * Estrae tutti i pattern di routing dinamici
   */
  getAllQuickRoutePatterns(config) {
    const patterns = [];
    
    config.servers.forEach(server => {
      if (server.enabled && server.quick_route_patterns) {
        server.quick_route_patterns.forEach(pattern => {
          patterns.push({
            pattern: new RegExp(pattern, 'i'),
            serverId: server.id,
            serverName: server.name
          });
        });
      }
    });

    return patterns;
  }

  /**
   * Salva configurazione nel formato appropriato
   */
  saveConfig(config, preferStandard = true) {
    try {
      if (preferStandard) {
        const standardConfig = this.convertToStandardFormat(config);
        fs.writeFileSync(this.standardConfigPath, JSON.stringify(standardConfig, null, 2));
        console.log('✅ Saved configuration in standard MCP format');
      } else {
        fs.writeFileSync(this.originalConfigPath, JSON.stringify(config, null, 2));
        console.log('✅ Saved configuration in original format');
      }
    } catch (error) {
      console.error('Error saving configuration:', error);
      throw error;
    }
  }

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
          priority: 1,
          type: 'http',
          quick_route_patterns: []
        }
      ],
      discovery: this.getDefaultDiscovery(),
      tools_override: {
        enabled: false,
        custom_tools: []
      }
    };
  }

  getDefaultDiscovery() {
    return {
      enabled: true,
      timeout_per_server: 10000,
      max_concurrent_discoveries: 3,
      cache_ttl_minutes: 5,
      fallback_to_mock: true
    };
  }
}

module.exports = { McpFormatConverter };
