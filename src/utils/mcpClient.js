const { spawn } = require('child_process');
const fetch = require('node-fetch');

class MCPClient {
  constructor() {
    this.activeConnections = new Map();
    this.requestId = 0;
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
      ready: false
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
      timeout: serverConfig.timeout || 10000
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
      const connection = await this.connectToServer(serverConfig);
      
      if (!connection.ready) {
        throw new Error('Server not ready');
      }

      const request = {
        jsonrpc: "2.0",
        id: this.getNextRequestId(),
        method: "tools/list"
      };

      const response = await this.sendRequest(connection, request);
      
      if (response && response.result && response.result.tools) {
        return response.result.tools;
      }
      
      return [];
    } catch (error) {
      console.error(`Failed to get tools list from ${serverConfig.id}:`, error);
      
      if (throwOnError) {
        throw error; // Propaga l'errore per i test
      }
      
      return [];
    }
  }

  // Invoca un tool specifico
  async callTool(serverConfig, toolName, arguments_) {
    try {
      const connection = await this.connectToServer(serverConfig);
      
      if (!connection.ready) {
        throw new Error('Server not ready');
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

      const response = await this.sendRequest(connection, request);
      
      if (response && response.result) {
        return response.result;
      }
      
      throw new Error('Invalid tool call response');
    } catch (error) {
      console.error(`Failed to call tool ${toolName} on ${serverConfig.id}:`, error);
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
              // Continue reading
            }
          }
        }
        responseBuffer = lines[lines.length - 1];
      };

      const onError = (error) => {
        cleanup();
        reject(error);
      };

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        connection.stdout.removeListener('data', onData);
        connection.stderr.removeListener('data', onError);
      };

      // Set timeout
      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('Request timeout'));
      }, timeout);

      // Listen for response
      connection.stdout.on('data', onData);
      connection.stderr.on('data', onError);

      // Send request
      connection.stdin.write(requestJson);
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
}

module.exports = MCPClient;
