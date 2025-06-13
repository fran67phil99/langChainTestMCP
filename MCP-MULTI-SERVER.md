# MCP Multi-Server Configuration Guide

## 🏗️ Sistema di Configurazione MCP Multi-Server

Il sistema ora supporta la configurazione di **multiple server MCP** tramite file JSON, permettendo di aggiungere, rimuovere e gestire server senza modificare il codice.

## 📋 Struttura del File `mcp_servers.json`

```json
{
  "servers": [
    {
      "id": "unique_server_id",
      "name": "Server Display Name", 
      "url": "http://localhost:8080",
      "tools_endpoint": "/tools",
      "description": "Server description",
      "enabled": true,
      "timeout": 10000,
      "retry_attempts": 3,
      "priority": 1
    }
  ],
  "discovery": {
    "enabled": true,
    "timeout_per_server": 10000,
    "max_concurrent_discoveries": 3,
    "cache_ttl_minutes": 5,
    "fallback_to_mock": true
  },
  "tools_override": {
    "enabled": false,
    "custom_tools": []
  }
}
```

## 🔧 Gestione via CLI

### Installazione del CLI
```bash
npm install commander
```

### Comandi Disponibili

**Lista server configurati:**
```bash
node mcp-config-cli.js list
node mcp-config-cli.js list --enabled-only
```

**Aggiungi nuovo server:**
```bash
node mcp-config-cli.js add \
  --id weather_api \
  --name "Weather API Server" \
  --url "http://localhost:8081" \
  --description "Server per dati meteorologici" \
  --endpoint "/api/tools" \
  --priority 2
```

**Rimuovi server:**
```bash
node mcp-config-cli.js remove --id weather_api
```

**Abilita/Disabilita server:**
```bash
node mcp-config-cli.js toggle --id weather_api
```

**Testa connessioni:**
```bash
node mcp-config-cli.js test --all
node mcp-config-cli.js test --id mauden_server
```

## 🌟 Esempi di Configurazioni Multi-Server

### Esempio 1: Sistema Aziendale Multi-Dominio

```json
{
  "servers": [
    {
      "id": "hr_server",
      "name": "HR Management Server",
      "url": "http://localhost:8080",
      "tools_endpoint": "/tools",
      "description": "Server per gestione risorse umane",
      "enabled": true,
      "priority": 1
    },
    {
      "id": "finance_server", 
      "name": "Finance Analytics Server",
      "url": "http://localhost:8081",
      "tools_endpoint": "/api/tools",
      "description": "Server per analisi finanziarie",
      "enabled": true,
      "priority": 2
    },
    {
      "id": "crm_server",
      "name": "CRM Integration Server", 
      "url": "http://localhost:8082",
      "tools_endpoint": "/crm/tools",
      "description": "Server per integrazione CRM",
      "enabled": true,
      "priority": 3
    }
  ]
}
```

### Esempio 2: Sistema con Server Esterni

```json
{
  "servers": [
    {
      "id": "internal_tools",
      "name": "Internal Company Tools",
      "url": "http://localhost:8080", 
      "enabled": true,
      "priority": 1
    },
    {
      "id": "weather_api",
      "name": "Weather Service",
      "url": "https://api.weather-mcp.com",
      "tools_endpoint": "/v1/tools",
      "description": "Servizio meteorologico esterno",
      "enabled": true,
      "timeout": 15000,
      "priority": 5
    },
    {
      "id": "dev_tools",
      "name": "Development Tools",
      "url": "http://dev-server:8083",
      "description": "Server di sviluppo (disabilitato in prod)",
      "enabled": false,
      "priority": 10
    }
  ]
}
```

## 🔄 Funzionalità Avanzate

### Cache Intelligente
- **TTL configurabile** per ogni server
- **Cache per server** separata
- **Invalidazione automatica** dopo timeout

### Discovery Parallelo
- **Discovery concorrente** da multiple server
- **Limite di concorrenza** configurabile
- **Timeout indipendenti** per server

### Fallback Robusto
- **Retry automatico** con exponential backoff
- **Fallback a tool mock** se tutti i server falliscono
- **Continuità di servizio** anche con server parzialmente down

### Priorità e Routing
- **Priorità configurabile** per i server
- **Tool con prefisso server** nelle descrizioni
- **Routing intelligente** basato su disponibilità

## 🚀 Integrazione con l'Architettura Modulare

Il sistema si integra perfettamente con l'architettura modulare esistente:

```javascript
// Automaticamente carica da configurazione
const tools = await getAllMcpTools();

// Tools includono informazioni sul server di origine
tools.forEach(tool => {
  console.log(`${tool.name} from ${tool.serverName}`);
});
```

## 📊 Monitoraggio e Debug

### Logging Dettagliato
```
🔍 Starting discovery from 3 MCP servers...
✅ HR Server: Loaded 5 tools
❌ Weather API: Connection timeout
✅ CRM Server: Loaded 2 tools  
🎯 Total tools discovered: 7
```

### Test di Connettività
```bash
# Testa tutti i server
node mcp-config-cli.js test --all

# Output:
🧪 Testing MCP server connections...
🔍 Testing: HR Management Server (hr_server)
   ✅ Success (245ms): Found 5 tools
🔍 Testing: Weather Service (weather_api)  
   ❌ Connection refused: Server not running
```

## 🔒 Sicurezza e Best Practices

### Configurazione Produzione
```json
{
  "discovery": {
    "timeout_per_server": 5000,
    "max_concurrent_discoveries": 2,
    "cache_ttl_minutes": 10,
    "fallback_to_mock": false
  }
}
```

### Gestione Errori
- **Timeout aggressivi** in produzione
- **Retry limitati** per evitare cascading failures
- **Fallback disabilitato** per sicurezza

## 🎯 Prossimi Passi

1. **Aggiungi i tuoi server MCP** alla configurazione
2. **Testa le connessioni** con il CLI
3. **Monitora i log** durante il discovery
4. **Configura timeout** appropriati per il tuo ambiente
5. **Disabilita fallback** in produzione se necessario

Il sistema è ora completamente configurabile e pronto per scenari enterprise multi-server! 🚀
