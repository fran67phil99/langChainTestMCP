# Architettura Frontend-Backend MCP

## 🏗️ Panoramica dell'Architettura

Il sistema Mauden MCP ora utilizza un'architettura completamente rinnovata con separazione chiara tra frontend e backend:

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND LAYER                           │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  │
│  │   Angular Frontend      │  │    MCP Manager UI       │  │
│  │   (porta 4200)          │  │   (Gestione Server)     │  │
│  └─────────────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP API Calls
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND API LAYER                       │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │          MCP API Server (porta 3000)                    │  │
│  │  ┌─────────────────┐  ┌─────────────────────────────┐  │  │
│  │  │  Express.js     │  │      MCP Routes             │  │  │
│  │  │  Server Core    │  │  /api/mcp/configuration     │  │  │
│  │  │                 │  │  /api/mcp/http-servers      │  │  │
│  │  │                 │  │  /api/mcp/stdio-servers     │  │  │
│  │  └─────────────────┘  └─────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ File System I/O
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  CONFIGURATION LAYER                       │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │         mcp_servers_standard.json                       │  │
│  │  ┌──────────────┐  ┌──────────────┐ ┌──────────────┐   │  │
│  │  │ httpServers  │  │ mcpServers   │ │  discovery   │   │  │
│  │  │ (REST APIs)  │  │ (STDIO)      │ │  (settings)  │   │  │
│  │  └──────────────┘  └──────────────┘ └──────────────┘   │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ MCP Protocol / HTTP
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES                       │
│  ┌─────────────────┐  ┌─────────────────┐ ┌─────────────┐  │
│  │   HTTP Servers  │  │  STDIO Servers  │ │   Docker    │  │
│  │   (porta 8080)  │  │  (MCP Native)   │ │   Servers   │  │
│  │   (porta 5009)  │  │                 │ │             │  │
│  └─────────────────┘  └─────────────────┘ └─────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 Componenti Principali

### 1. Frontend Angular (porta 4200)
- **Location**: `langgraph-frontend/`
- **Componente MCP Manager**: `src/app/mcp-manager/`
- **Funzionalità**:
  - Gestione unificata di server HTTP e STDIO
  - Interfaccia per aggiungere/modificare/eliminare server
  - Test di connettività in tempo reale
  - Configurazione modalità server dinamica

### 2. Backend API Server (porta 3000)
- **File**: `mcp-api-server.js`
- **Routes**: `src/routes/mcpRoutes.js`
- **Funzionalità**:
  - API REST per gestione configurazione MCP
  - CRUD operations per server HTTP e STDIO
  - Proxy per test di connettività
  - Gestione file di configurazione `mcp_servers_standard.json`

### 3. Configurazione Centralizzata
- **File**: `mcp_servers_standard.json`
- **Struttura**:
  ```json
  {
    "httpServers": [
      {
        "id": "server_id",
        "name": "Server Name",
        "url": "http://localhost:8080",
        "tools_endpoint": "/tools",
        "enabled": true,
        "timeout": 10000
      }
    ],
    "mcpServers": {
      "Server Name": {
        "command": "npx",
        "args": ["-y", "@azure/mcp@latest"],
        "enabled": false,
        "timeout": 30000
      }
    },
    "discovery": {
      "enabled": true,
      "timeout_per_server": 10000
    }
  }
  ```

## 🔄 Flusso di Lavoro

### 1. Avvio del Sistema
```bash
# Metodo automatico
.\start-mcp-system.ps1

# Metodo manuale
npm run api-server          # Terminal 1: Backend API
cd langgraph-frontend && ng serve  # Terminal 2: Frontend
```

### 2. Gestione Server
1. **Frontend**: L'utente accede al MCP Manager (http://localhost:4200)
2. **UI**: Visualizza la lista dei server dal backend API
3. **API**: Backend legge da `mcp_servers_standard.json`
4. **Modifiche**: L'utente modifica/aggiunge server tramite UI
5. **Persistenza**: Backend salva le modifiche nel file di configurazione
6. **Sync**: Frontend si aggiorna automaticamente

### 3. Test di Connettività
1. **Trigger**: Utente clicca "Testa Tutti i Server"
2. **HTTP Servers**: Backend testa endpoint `/tools`
3. **STDIO Servers**: Backend avvia processo MCP e testa connessione
4. **Risultati**: Mostrati in tempo reale nel frontend

## 📡 API Endpoints

### Configurazione
- `GET /api/mcp/configuration` - Configurazione completa
- `GET /api/mcp/server-mode` - Modalità server attuale

### Server HTTP
- `GET /api/mcp/http-servers` - Lista server HTTP
- `POST /api/mcp/http-servers` - Aggiungi server HTTP
- `PUT /api/mcp/http-servers/{id}` - Modifica server HTTP
- `DELETE /api/mcp/http-servers/{id}` - Elimina server HTTP
- `POST /api/mcp/http-servers/{id}/toggle` - Abilita/Disabilita
- `GET /api/mcp/http-servers/{id}/test` - Test connettività

### Server STDIO
- `GET /api/mcp/stdio-servers` - Lista server STDIO
- `POST /api/mcp/stdio-servers` - Aggiungi server STDIO
- `PUT /api/mcp/stdio-servers/{id}` - Modifica server STDIO
- `DELETE /api/mcp/stdio-servers/{id}` - Elimina server STDIO
- `POST /api/mcp/stdio-servers/{id}/toggle` - Abilita/Disabilita
- `GET /api/mcp/stdio-servers/{id}/test` - Test connettività

### Controllo Server
- `POST /api/mcp/server-mode` - Cambia modalità server
- `POST /api/mcp/start-servers` - Avvia server
- `POST /api/mcp/stop-servers` - Arresta server

## 🔧 Sviluppo e Debugging

### Logs
- **Frontend**: Console del browser per errori Angular
- **Backend**: Console del terminale API server
- **Files**: Verificare `mcp_servers_standard.json` per persistenza

### Troubleshooting
1. **Server API non risponde**: Verificare che sia avviato su porta 3000
2. **Frontend non carica dati**: Controllare CORS e URL API
3. **Configurazione non salva**: Verificare permessi file system
4. **Test falliscono**: Controllare che i server esterni siano raggiungibili

### Personalizzazione
- **Nuovi Endpoint**: Aggiungi route in `src/routes/mcpRoutes.js`
- **UI Modifiche**: Modifica componenti in `langgraph-frontend/src/app/`
- **Configurazione**: Estendi struttura in `mcp_servers_standard.json`

## 🚀 Deploy in Produzione

### Variabili d'Ambiente
```bash
# Backend API
PORT=3000
NODE_ENV=production

# Frontend Angular
ng build --prod
```

### Docker
```dockerfile
# Esempio Dockerfile per il backend
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "mcp-api-server.js"]
```

### Reverse Proxy (Nginx)
```nginx
server {
    listen 80;
    
    # Frontend
    location / {
        root /var/www/angular-dist;
        try_files $uri $uri/ /index.html;
    }
    
    # Backend API
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 🔄 Migrazione da Architettura Precedente

Se stai migrando da una versione precedente:

1. **Backup**: Salva la configurazione esistente
2. **Install**: `npm install` per nuove dipendenze
3. **Config**: Trasferisci server in `mcp_servers_standard.json`
4. **Test**: Verifica che tutti i server funzionino
5. **Deploy**: Usa nuovi script di avvio

## 📚 Risorse Aggiuntive

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Angular Documentation](https://angular.io/)
- [Express.js Guide](https://expressjs.com/)
- [Socket.IO Documentation](https://socket.io/)
