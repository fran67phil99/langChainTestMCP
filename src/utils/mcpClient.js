const { spawn } = require('child_process');
const fetch = require('node-fetch');

class MCPClient {
  constructor() {
    this.activeConnections = new Map();
    this.requestId = 0;
    this.connectionHealth = new Map(); // Track connection health
    this.lastHealthCheck = new Map(); // Track when we last checked health
    this.healthCheckInterval = 30000; // Health check every 30 seconds
    this.maxConnectionAge = 300000; // Max connection age: 5 minutes
  }
  // Crea una connessione a un server MCP (STDIO o HTTP)
  async connectToServer(serverConfig) {
    const serverId = serverConfig.id || serverConfig.name;
    
    if (this.activeConnections.has(serverId)) {
      return this.activeConnections.get(serverId);
    }

    try {
      // Determina il tipo di server (STDIO o HTTP)
      if (serverConfig.url) {
        // Server HTTP MCP
        return await this.connectToHttpServer(serverConfig);
      } else {
        // Server STDIO MCP
        return await this.connectToStdioServer(serverConfig);
      }
    } catch (error) {
      console.error(`Failed to connect to MCP server ${serverId}:`, error);
      throw error;
    }
  }

  // Connessione a server STDIO MCP
  async connectToStdioServer(serverConfig) {
    const serverId = serverConfig.id || serverConfig.name;
    
    const process = spawn(serverConfig.command, serverConfig.args || [], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const connection = {
      type: 'stdio',
      process,
      stdin: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
      serverId,
      ready: false,
      createdAt: Date.now() // Track when the connection was created
    };

    // Setup error handling
    process.on('error', (error) => {
      console.error(`MCP Server ${serverId} error:`, error);
      this.activeConnections.delete(serverId);
    });

    process.on('close', (code) => {
      console.log(`MCP Server ${serverId} closed with code:`, code);
      this.activeConnections.delete(serverId);
    });

    this.activeConnections.set(serverId, connection);
    
    // Initialize the connection
    await this.initializeConnection(connection);
    
    return connection;
  }

  // Connessione a server HTTP MCP
  async connectToHttpServer(serverConfig) {
    const serverId = serverConfig.id || serverConfig.name;
    
    // Verifica che il server HTTP sia raggiungibile
    try {
      const healthCheck = await fetch(`${serverConfig.url}/health`, {
        method: 'GET',
        timeout: 5000
      });
      
      if (!healthCheck.ok) {
        throw new Error(`HTTP server not healthy: ${healthCheck.status}`);
      }
    } catch (error) {
      // Se non ha endpoint /health, prova con il server base
      try {
        const baseCheck = await fetch(serverConfig.url, {
          method: 'GET',
          timeout: 5000
        });
        if (!baseCheck.ok && baseCheck.status !== 404) {
          throw new Error(`HTTP server not reachable: ${baseCheck.status}`);
        }
      } catch (innerError) {
        throw new Error(`HTTP server unreachable: ${innerError.message}`);
      }
    }

    const connection = {
      type: 'http',
      url: serverConfig.url,
      serverId,
      ready: false,
      timeout: serverConfig.timeout || 10000,
      createdAt: Date.now() // Track when the connection was created
    };

    this.activeConnections.set(serverId, connection);
    
    // Initialize the HTTP MCP connection
    await this.initializeConnection(connection);
    
    return connection;
  }
  // Inizializza la connessione MCP con handshake (STDIO o HTTP)
  async initializeConnection(connection) {
    try {
      // Send initialize request
      const initRequest = {
        jsonrpc: "2.0",
        id: this.getNextRequestId(),
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {}
          },
          clientInfo: {
            name: "Mauden-MCP-Client",
            version: "1.0.0"
          }
        }
      };

      const response = await this.sendRequest(connection, initRequest);
      
      if (response && response.result) {
        connection.ready = true;
        connection.serverCapabilities = response.result.capabilities;
        console.log(`MCP Server ${connection.serverId} initialized successfully`);
        
        // Send initialized notification
        const initializedNotification = {
          jsonrpc: "2.0",
          method: "notifications/initialized"
        };
        
        this.sendNotification(connection, initializedNotification);
        
        return true;
      }
      
      throw new Error('Invalid initialize response');
    } catch (error) {
      console.error(`Failed to initialize MCP server ${connection.serverId}:`, error);
      throw error;
    }
  }
  // Ottiene la lista dei tool disponibili
  async getToolsList(serverConfig, throwOnError = false) {
    try {
      // Usa la connessione sana invece di connectToServer direttamente
      const connection = await this.ensureHealthyConnection(serverConfig);
      
      if (!connection.ready) {
        throw new Error('Server not ready after connection attempt');
      }

      const request = {
        jsonrpc: "2.0",
        id: this.getNextRequestId(),
        method: "tools/list"
      };

      console.log(`🔍 Requesting tools list from ${serverConfig.id}...`);
      const response = await this.sendRequest(connection, request);
      
      if (response && response.result && response.result.tools) {
        console.log(`✅ Successfully got ${response.result.tools.length} tools from ${serverConfig.id}`);
        return response.result.tools;
      }
      
      console.warn(`⚠️ Empty or invalid tools response from ${serverConfig.id}`);
      return [];
    } catch (error) {
      console.error(`❌ Failed to get tools list from ${serverConfig.id}:`, error);
      
      if (throwOnError) {
        throw error; // Propaga l'errore per i test
      }
      
      return [];
    }
  }

  // Invoca un tool specifico
  async callTool(serverConfig, toolName, arguments_) {
    try {
      // Usa la connessione sana invece di connectToServer direttamente
      const connection = await this.ensureHealthyConnection(serverConfig);
      
      if (!connection.ready) {
        throw new Error('Server not ready after connection attempt');
      }

      const request = {
        jsonrpc: "2.0",
        id: this.getNextRequestId(),
        method: "tools/call",
        params: {
          name: toolName,
          arguments: arguments_ || {}
        }
      };

      console.log(`🔧 Calling tool ${toolName} on ${serverConfig.id}...`);
      const response = await this.sendRequest(connection, request);
      
      if (response && response.result) {
        console.log(`✅ Successfully called tool ${toolName} on ${serverConfig.id}`);
        return response.result;
      }
      
      throw new Error('Invalid tool call response');
    } catch (error) {
      console.error(`❌ Failed to call tool ${toolName} on ${serverConfig.id}:`, error);
      throw error;
    }
  }
  // Invia una richiesta JSON-RPC e attende la risposta (STDIO o HTTP)
  async sendRequest(connection, request, timeout = 10000) {
    if (connection.type === 'http') {
      return this.sendHttpRequest(connection, request, timeout);
    } else {
      return this.sendStdioRequest(connection, request, timeout);
    }
  }

  // Invia una richiesta JSON-RPC via HTTP
  async sendHttpRequest(connection, request, timeout = 10000) {
    try {
      const response = await fetch(`${connection.url}/jsonrpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        timeout: timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }

      const jsonResponse = await response.json();
      return jsonResponse;
    } catch (error) {
      throw new Error(`HTTP request failed: ${error.message}`);
    }
  }

  // Invia una richiesta JSON-RPC via STDIO
  async sendStdioRequest(connection, request, timeout = 10000) {
    return new Promise((resolve, reject) => {
      // Check if process is still alive
      if (!connection.process || connection.process.killed) {
        reject(new Error('Process is not running'));
        return;
      }

      const requestJson = JSON.stringify(request) + '\n';
      
      let responseBuffer = '';
      let timeoutId;

      const onData = (data) => {
        responseBuffer += data.toString();
        
        // Check for complete JSON-RPC response
        const lines = responseBuffer.split('\n');
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (line) {
            try {
              const response = JSON.parse(line);
              if (response.id === request.id) {
                cleanup();
                resolve(response);
                return;
              }
            } catch (e) {
              // Continue reading - might be partial JSON
            }
          }
        }
        responseBuffer = lines[lines.length - 1];
      };

      const onError = (error) => {
        cleanup();
        reject(new Error(`STDERR: ${error.toString()}`));
      };

      const onClose = () => {
        cleanup();
        reject(new Error('Process closed unexpectedly'));
      };

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        connection.stdout.removeListener('data', onData);
        connection.stderr.removeListener('data', onError);
        connection.process.removeListener('close', onClose);
      };

      // Set timeout
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      // Listen for response and errors
      connection.stdout.on('data', onData);
      connection.stderr.on('data', onError);
      connection.process.on('close', onClose);

      // Send request
      try {
        connection.stdin.write(requestJson);
      } catch (error) {
        cleanup();
        reject(new Error(`Failed to write to stdin: ${error.message}`));
      }
    });
  }
  // Invia una notifica (senza aspettare risposta) - STDIO o HTTP
  sendNotification(connection, notification) {
    if (connection.type === 'http') {
      // Per HTTP, invia la notifica come richiesta POST senza aspettare risposta
      fetch(`${connection.url}/jsonrpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notification),
        timeout: 5000
      }).catch(error => {
        console.warn(`Failed to send notification to ${connection.serverId}:`, error);
      });
    } else {
      // Per STDIO, invia direttamente
      const notificationJson = JSON.stringify(notification) + '\n';
      connection.stdin.write(notificationJson);
    }
  }
  // Disconnette da un server specifico
  async disconnectFromServer(serverId) {
    const connection = this.activeConnections.get(serverId);
    if (connection) {
      if (connection.type === 'stdio' && connection.process) {
        connection.process.kill();
      }
      // Per HTTP non c'è bisogno di kill, solo rimuovere dalla mappa
      this.activeConnections.delete(serverId);
    }
  }

  // Disconnette da tutti i server
  async disconnectAll() {
    for (const [serverId, connection] of this.activeConnections) {
      if (connection.type === 'stdio' && connection.process) {
        connection.process.kill();
      }
    }
    this.activeConnections.clear();
  }

  // Utility per generare ID richieste
  getNextRequestId() {
    return ++this.requestId;
  }

  // Verifica se un server è connesso
  isConnected(serverId) {
    const connection = this.activeConnections.get(serverId);
    return connection && connection.ready;
  }

  // Ottiene statistiche sulle connessioni
  getConnectionStats() {
    const stats = {
      totalConnections: this.activeConnections.size,
      readyConnections: 0,
      staleConnections: 0,
      connectionsByType: {
        stdio: 0,
        http: 0
      }
    };

    for (const [serverId, connection] of this.activeConnections) {
      if (connection.ready) {
        stats.readyConnections++;
      } else {
        stats.staleConnections++;
      }

      if (connection.type === 'stdio') {
        stats.connectionsByType.stdio++;
      } else if (connection.type === 'http') {
        stats.connectionsByType.http++;
      }
    }

    return stats;
  }

  // Verifica se una connessione è sana e pronta
  async ensureHealthyConnection(serverConfig) {
    const serverId = serverConfig.id || serverConfig.name;
    const connection = this.activeConnections.get(serverId);
    
    if (!connection) {
      console.log(`🔄 No connection exists for ${serverId}, creating new one`);
      return await this.connectToServer(serverConfig);
    }
    
    // Check if connection is too old
    const connectionAge = Date.now() - (connection.createdAt || 0);
    if (connectionAge > this.maxConnectionAge) {
      console.log(`🔄 Connection for ${serverId} is too old (${Math.round(connectionAge/1000)}s), reconnecting`);
      await this.disconnectFromServer(serverId);
      return await this.connectToServer(serverConfig);
    }
    
    // Check connection health
    const lastCheck = this.lastHealthCheck.get(serverId) || 0;
    const timeSinceLastCheck = Date.now() - lastCheck;
    
    if (timeSinceLastCheck > this.healthCheckInterval) {
      console.log(`🔍 Performing health check for ${serverId}`);
      const isHealthy = await this.performHealthCheck(connection);
      this.lastHealthCheck.set(serverId, Date.now());
      
      if (!isHealthy) {
        console.warn(`🔄 Connection ${serverId} failed health check, reconnecting`);
        await this.disconnectFromServer(serverId);
        return await this.connectToServer(serverConfig);
      }
    }
    
    return connection;
  }

  // Esegue un health check su una connessione
  async performHealthCheck(connection) {
    try {
      // For STDIO connections, check if process is still alive
      if (connection.type === 'stdio') {
        if (!connection.process || connection.process.killed) {
          return false;
        }
        
        // Try to send a simple ping request
        const pingRequest = {
          jsonrpc: "2.0",
          id: this.getNextRequestId(),
          method: "ping"
        };
        
        // Use a short timeout for health check
        const response = await this.sendRequest(connection, pingRequest, 3000);
        return response !== null; // Any response means it's alive
      }
      
      // For HTTP connections, try a simple request
      if (connection.type === 'http') {
        const healthCheck = await fetch(`${connection.url}/health`, {
          method: 'GET',
          timeout: 3000
        });
        return healthCheck.ok;
      }
      
      return false;
    } catch (error) {
      console.warn(`⚠️ Health check failed for ${connection.serverId}: ${error.message}`);
      return false;
    }
  }
}

module.exports = MCPClient;
