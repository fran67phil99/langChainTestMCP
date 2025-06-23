# 🎯 GUIDA RAPIDA - Mauden MCP Server Architecture

## ✅ Sistema Implementato con Successo!

Il tuo progetto ora supporta **dinamicamente** due modalità di server:

### 🚀 AVVIO RAPIDO

```bash
# Installa dipendenze
npm install

# Avvia entrambi i server (raccomandato)
npm start

# OPPURE scegli una modalità specifica:
npm run start:rest     # Solo server REST (porta 8080)
npm run start:mcp      # Solo server MCP (porta 5009)
npm run start:both     # Entrambi i server
```

### 🔧 COMANDI PRINCIPALI

| Comando | Descrizione |
|---------|-------------|
| `npm start` | Avvia i server secondo la configurazione |
| `npm run config` | Mostra configurazione attuale |
| `npm test` | Esegue test completi del sistema |
| `npm run server:help` | Mostra aiuto dettagliato |

### 🌐 ENDPOINTS DISPONIBILI

#### Server REST (porta 8080)
```bash
GET  http://localhost:8080/tools      # Lista tools
GET  http://localhost:8080/interns    # Dati stagisti  
GET  http://localhost:8080/employees  # Dati dipendenti
POST http://localhost:8080/search     # Ricerca
```

#### Server MCP (porta 5009) - JSON-RPC 2.0
```bash
POST http://localhost:5009
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "params": {},
  "id": 1
}
```

### 🎛️ CONFIGURAZIONE DINAMICA

Il file `server-config.json` controlla il comportamento:

```json
{
  "serverMode": "both",      // "rest", "mcp", o "both"
  "restServer": {
    "enabled": true,
    "port": 8080
  },
  "mcpServer": {
    "enabled": true,
    "port": 5009
  }
}
```

### 🔄 CAMBIO MODALITÀ

```bash
# Cambia modalità server
node server-manager.js set-mode both
node server-manager.js set-mode rest
node server-manager.js set-mode mcp

# Abilita/disabilita server specifici
node server-manager.js enable rest
node server-manager.js disable mcp
```

### 🧪 CLIENT INTELLIGENTE

Il `EnhancedMcpClient` rileva automaticamente i server disponibili:

```javascript
const EnhancedMcpClient = require('./enhanced-mcp-client');
const client = new EnhancedMcpClient();

// Rilevamento automatico
await client.detectServerMode();

// API unificata - si adatta automaticamente
const tools = await client.getTools();
const result = await client.callTool('get_stagisti_mcp');
```

### 🚨 MIGRAZIONE GRADUALE

**Da REST a MCP:**
1. Avvia modalità `both`
2. Testa che MCP funzioni
3. Cambia gradualmente client
4. Passa a modalità `mcp`

**Da MCP a REST:**
1. Avvia modalità `both`  
2. Aggiorna client per REST
3. Passa a modalità `rest`

### 📊 MONITORAGGIO

```bash
# Verifica stato server
npm run config

# Test completo sistema
npm test

# Log dettagliati
tail -f logs/server.log
```

### ⚡ DIFFERENZE CHIAVE

| Aspetto | REST | MCP |
|---------|------|-----|
| **Protocollo** | HTTP/REST | JSON-RPC 2.0 |
| **Endpoints** | `/tools`, `/interns` | `tools/list`, `tools/call` |
| **Formato** | JSON semplice | JSON-RPC strutturato |
| **Compatibilità** | Sistemi tradizionali | Model Context Protocol |
| **Flessibilità** | Alta | Massima |

### 🎉 VANTAGGI IMPLEMENTATI

✅ **Scelta dinamica** - Cambia modalità senza riavviare  
✅ **Compatibilità totale** - Supporta entrambi i protocolli  
✅ **Client intelligente** - Rilevamento automatico  
✅ **Migrazione graduale** - Passa da REST a MCP senza interruzioni  
✅ **Configurazione semplice** - Un file JSON per tutto  
✅ **Testing completo** - Verifica automatica del sistema  
✅ **Documentazione completa** - Guide e esempi  

### 🔗 DOCUMENTAZIONE ESTESA

- **[README-SERVER-MODES.md](README-SERVER-MODES.md)** - Guida completa
- **[server-config.json](server-config.json)** - Configurazione server
- **[enhanced-mcp-client.js](enhanced-mcp-client.js)** - Client avanzato
- **[system-tester.js](system-tester.js)** - Test di sistema

---

## 🎯 PROSSIMI PASSI

1. **Testa il sistema**: `npm test`
2. **Avvia i server**: `npm start` 
3. **Sperimenta le modalità**: Cambia configurazione e riprova
4. **Integra nei tuoi progetti**: Usa `EnhancedMcpClient`

Il tuo sistema è ora **completamente moderno, flessibile e pronto per la produzione**! 🚀
