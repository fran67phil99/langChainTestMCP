# 🚀 Mauden MCP Server Architecture - Modalità Dinamica

## 📋 Panoramica

Questo progetto implementa un'architettura server moderna e flessibile che supporta due modalità operative:

1. **Server REST Classico** (porta 8080) - API HTTP tradizionale con endpoints REST
2. **Server MCP-Compliant** (porta 5009) - Model Context Protocol con JSON-RPC 2.0
3. **Modalità Ibrida** - Entrambi i server simultaneamente

## 🎯 Scelta della Modalità

### Modalità Disponibili

| Modalità | Descrizione | Porta | Protocollo |
|----------|-------------|-------|------------|
| `rest` | Solo server HTTP REST | 8080 | HTTP/REST |
| `mcp` | Solo server MCP JSON-RPC 2.0 | 5009 | JSON-RPC 2.0 |
| `both` | Entrambi i server | 8080 + 5009 | HTTP/REST + JSON-RPC |

### Quando Usare Quale Modalità

**Usa `rest` quando:**
- Hai bisogno di endpoints HTTP tradizionali
- Vuoi integrare con sistemi esistenti che usano REST
- Preferisci endpoints semplici come `/tools`, `/interns`, `/employees`

**Usa `mcp` quando:**
- Vuoi la massima compatibilità con il Model Context Protocol
- Hai bisogno di funzionalità avanzate come resources e prompts
- Vuoi usare JSON-RPC 2.0 per comunicazioni strutturate

**Usa `both` quando:**
- Vuoi supportare entrambi i tipi di client
- Stai migrando gradualmente da REST a MCP
- Hai bisogno di massima flessibilità

## 🛠️ Installazione e Setup

### 1. Installa le dipendenze

```bash
npm install
```

### 2. Configura i server

Modifica `server-config.json` per personalizzare le impostazioni:

```json
{
  "serverMode": "both",
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

## 🚀 Utilizzo

### Metodo 1: Script NPM (Raccomandato)

```bash
# Avvia in modalità automatica (legge da config)
npm start

# Avvia solo server REST
npm run start:rest

# Avvia solo server MCP
npm run start:mcp

# Avvia entrambi i server
npm run start:both

# Mostra configurazione attuale
npm run config

# Mostra aiuto
npm run server:help
```

### Metodo 2: Server Manager Diretto

```bash
# Avvia con modalità specifica
node server-manager.js start rest
node server-manager.js start mcp
node server-manager.js start both

# Gestione configurazione
node server-manager.js config
node server-manager.js set-mode both
node server-manager.js enable rest
node server-manager.js disable mcp
```

### Metodo 3: PowerShell Scripts

```powershell
# Per Windows
.\start-all.ps1
```

## 🔧 API Endpoints

### Server REST (porta 8080)

```bash
# Lista tools disponibili
GET http://localhost:8080/tools

# Ottieni dati stagisti
GET http://localhost:8080/interns

# Ottieni dati dipendenti
GET http://localhost:8080/employees

# Ricerca
GET http://localhost:8080/search?q=termine
```

### Server MCP (porta 5009)

```bash
# Inizializzazione
POST http://localhost:5009
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {}
  },
  "id": 1
}

# Lista tools
POST http://localhost:5009
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "params": {},
  "id": 2
}

# Chiama tool
POST http://localhost:5009
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "get_stagisti_mcp",
    "arguments": {}
  },
  "id": 3
}
```

## 📡 Client Intelligente

Il progetto include un `EnhancedMcpClient` che può:

- **Rilevare automaticamente** quale server è attivo
- **Adattarsi dinamicamente** al tipo di server disponibile
- **Fornire fallback** da MCP a REST se necessario
- **Unificare le API** per entrambi i tipi di server

### Esempio di Utilizzo Client

```javascript
const EnhancedMcpClient = require('./enhanced-mcp-client');

const client = new EnhancedMcpClient();

// Rilevamento automatico
await client.detectServerMode();

// Ottieni tools (auto-detect modalità)
const tools = await client.getTools();

// Forza modalità specifica
const restTools = await client.getTools('rest');
const mcpTools = await client.getTools('mcp');

// Chiama tool con fallback automatico
const result = await client.callTool('get_stagisti_mcp');
```

## 🔄 Migrazione tra Modalità

### Da REST a MCP

1. Testa la modalità `both` per assicurarti che tutto funzioni
2. Aggiorna i client per supportare JSON-RPC
3. Cambia la modalità a `mcp` quando sei pronto

### Da MCP a REST

1. Abilita la modalità `both`
2. Aggiorna i client per usare endpoints REST
3. Cambia la modalità a `rest`

## 🧪 Testing

### Test Automatici

```bash
# Test del client enhanced
node enhanced-mcp-client.js

# Test esteso (entrambi i server)
node test-extended-mcp-client.js

# Test rapido
node tests/quick-test.js
```

### Test Manuali

```bash
# Verifica server REST
curl http://localhost:8080/tools

# Verifica server MCP
curl -X POST http://localhost:5009 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}'
```

## 📊 Monitoraggio

### Log dei Server

I log sono disponibili in:
- `logs/server.log` - Log generale
- `logs/mcp-server.log` - Log specifico MCP
- `logs/exceptions.log` - Errori e eccezioni

### Stato dei Server

```bash
# Controlla se i server sono attivi
node server-manager.js config

# Controlla informazioni dettagliate
node enhanced-mcp-client.js
```

## ⚙️ Configurazione Avanzata

### File di Configurazione

- `server-config.json` - Configurazione modalità server
- `mcp_servers_standard.json` - Configurazione client MCP
- `services-config.json` - Configurazione servizi

### Personalizzazione Porte

```json
{
  "restServer": {
    "port": 8080,
    "endpoints": {
      "/tools": "Lista tools personalizzata",
      "/custom": "Endpoint personalizzato"
    }
  },
  "mcpServer": {
    "port": 5009,
    "features": ["tools", "resources", "prompts"]
  }
}
```

## 🚨 Troubleshooting

### Problemi Comuni

1. **Porto già in uso**
   ```bash
   # Cambia porta in server-config.json
   node server-manager.js config
   ```

2. **Server non risponde**
   ```bash
   # Verifica stato
   node enhanced-mcp-client.js
   ```

3. **Errori di dipendenze**
   ```bash
   npm install
   ```

### Debug

```bash
# Abilita debug verbose
DEBUG=* node server-manager.js start both

# Log dettagliati
tail -f logs/server.log
```

## 📚 Documentazione Aggiuntiva

- [MCP-MULTI-SERVER.md](MCP-MULTI-SERVER.md) - Dettagli tecnici
- [MAUDEN-ENTERPRISE-MCP-SPECS.md](MAUDEN-ENTERPRISE-MCP-SPECS.md) - Specifiche aziendali
- [ROADMAP-MCP-EVOLUTION.md](ROADMAP-MCP-EVOLUTION.md) - Evoluzione futura

## 🤝 Contributi

Per contribuire al progetto:

1. Fai fork del repository
2. Crea un branch per la tua feature
3. Testa con entrambe le modalità
4. Crea una pull request

## 📄 Licenza

Questo progetto è rilasciato sotto licenza ISC. Vedi [LICENSE](LICENSE) per i dettagli.

---

🔗 **Links Utili:**
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
