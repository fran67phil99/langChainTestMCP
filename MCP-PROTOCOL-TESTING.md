# Protocollo MCP - Sequenza di Chiamate e Test

## 🔄 Sequenza Standard MCP

Il Model Context Protocol richiede una sequenza specifica di chiamate per stabilire e mantenere la connessione:

### 1. **initialize** - Prima Chiamata Obbligatoria

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "roots": {
        "listChanged": true
      },
      "sampling": {}
    },
    "clientInfo": {
      "name": "Mauden MCP Test Client",
      "version": "1.0.0"
    }
  }
}
```

**Risposta Attesa:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "logging": {},
      "tools": {
        "listChanged": true
      }
    },
    "serverInfo": {
      "name": "Server Name",
      "version": "1.0.0"
    }
  }
}
```

### 2. **tools/list** - Scoperta Tool Disponibili

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

**Risposta Attesa:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "get_weather",
        "description": "Get current weather information",
        "inputSchema": {
          "type": "object",
          "properties": {
            "location": {
              "type": "string",
              "description": "City name"
            }
          },
          "required": ["location"]
        }
      }
    ]
  }
}
```

## 🧪 Implementazione dei Test

Il sistema Mauden MCP ora implementa questa sequenza per testare i server:

### Test Automatico nel Frontend
1. **Step 1**: Chiama `initialize` per stabilire la connessione MCP
2. **Step 2**: Chiama `tools/list` per scoprire i tool disponibili
3. **Fallback**: Se MCP fallisce, prova endpoint REST classici (`/tools`, `/`)

### Risultati del Test
- **✅ Successo MCP**: Server supporta protocollo completo
- **⚠️ Successo REST**: Server funziona ma solo con HTTP REST
- **❌ Errore**: Server non raggiungibile o non funzionante

## 🔧 Configurazione Server

### Server MCP-Compliant
```json
{
  "id": "azure_mcp_server",
  "name": "Azure MCP Server",
  "url": "http://localhost:5009",
  "description": "Server MCP completo con JSON-RPC 2.0",
  "enabled": true,
  "timeout": 10000
}
```

### Server REST Classico
```json
{
  "id": "rest_server",
  "name": "REST API Server",
  "url": "http://localhost:8080",
  "tools_endpoint": "/tools",
  "description": "Server HTTP REST classico",
  "enabled": true,
  "timeout": 5000
}
```

## 📋 Debugging e Troubleshooting

### Log del Server API
```bash
# Server logs durante test MCP
🔧 Testing MCP server Azure MCP Server - Step 1: Initialize
🔧 Testing MCP server Azure MCP Server - Step 2: Tools List
⚠️  MCP protocol failed for REST Server, trying REST endpoints...
```

### Errori Comuni

1. **404 su /tools**: Server non implementa endpoint REST classico
   - **Soluzione**: Verificare se supporta protocollo MCP
   
2. **Timeout su initialize**: Server non risponde a JSON-RPC
   - **Soluzione**: Controllare se server è effettivamente MCP-compliant
   
3. **CORS Error**: Server non accetta richieste cross-origin
   - **Soluzione**: Configurare CORS headers appropriati

## 🚀 Implementazione Personalizzata

### Aggiungere Nuovi Metodi di Test
```javascript
// In src/routes/mcpRoutes.js
const customTestPayload = {
  "jsonrpc": "2.0",
  "id": 3,
  "method": "custom/method",
  "params": { /* parametri custom */ }
};
```

### Estendere Capacità Client
```javascript
// Capabilities avanzate
"capabilities": {
  "roots": { "listChanged": true },
  "sampling": {},
  "resources": { "subscribe": true, "listChanged": true },
  "prompts": { "listChanged": true },
  "tools": { "listChanged": true }
}
```

## 📚 Riferimenti

- [MCP Specification](https://modelcontextprotocol.io/)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk)
