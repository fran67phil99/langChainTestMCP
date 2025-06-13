# Orchestratore LangGraph con MCP - Full Stack

Un sistema di agenti AI orchestrato che integra **LangGraph**, **Model Context Protocol (MCP)** e **OpenAI** per creare un'architettura modulare e scalabile. Il progetto include sia un backend Node.js che un frontend Angular per un'esperienza completa.

## 🏗️ Architettura Completa

Il progetto implementa un'architettura full-stack con tre layer principali:

### Frontend Layer
- **🎨 Angular Frontend**: Interfaccia utente moderna con chat in tempo reale
- **🔗 Socket.IO Client**: Comunicazione WebSocket con il backend

### Backend Layer  
- **🌐 Node.js Server**: Server backend con Socket.IO per orchestrazione
- **🎭 Orchestrator Agent**: Router intelligente che analizza le richieste
- **🤖 MCP Agent**: Specializzato nell'esecuzione di strumenti esterni
- **💬 General Agent**: Gestisce conversazioni generali

### Services Layer
- **🐍 MCP Server Python**: Server FastAPI per tools MCP
- **🔧 External APIs**: OpenAI, LangSmith, altri servizi

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Angular       │    │   Node.js        │    │   MCP Server    │
│   Frontend      │◄──►│   Backend        │◄──►│   Python        │
│   :4200         │    │   :8001          │    │   :8080         │
└─────────────────┘    └─────────┬────────┘    └─────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
              ┌─────▼──────┐           ┌──────▼──────┐
              │MCP Agent   │           │General Agent│
              │(Tools)     │           │(Chat)       │
              └────────────┘           └─────────────┘
```

## 🚀 Caratteristiche Principali

### 🔧 Integrazione MCP
- Connessione automatica ai server MCP tramite **FastMCP**
- Cache intelligente degli strumenti disponibili
- Selezione automatica degli strumenti basata su LLM
- Gestione robusta degli errori e timeout

### 🧠 Routing Intelligente
- Analisi automatica delle richieste utente
- Selezione dell'agente più appropriato
- Estrazione parametri per strumenti MCP
- Fallback graceful al General Agent

### 💻 API WebSocket
- Endpoint FastAPI per comunicazione real-time
- Gestione di sessioni multiple tramite `thread_id`
- Supporto CORS per integrazione frontend
- Messaggistica bidirezionale

### 📊 Osservabilità
- Integrazione **LangSmith** per tracing
- Logging dettagliato di tutte le operazioni
- Monitoraggio stato agenti in tempo reale

## 🚀 Quick Start

### Prerequisiti
- **Node.js** (v18+)
- **Python** (v3.8+)
- **Angular CLI** (`npm install -g @angular/cli`)
- **OpenAI API Key**

### Avvio Rapido

1. **Clona il repository**
   ```bash
   git clone <repository-url>
   cd progettoLangGraphProva
   ```

2. **Configura le variabili d'ambiente**
   ```bash
   # Modifica il file .env con la tua OpenAI API Key
   OPENAI_API_KEY="sk-your-actual-openai-api-key"
   ```

3. **Avvia tutti i servizi** (Windows)
   ```bash
   # Usando PowerShell
   .\start-all.ps1
   
   # Oppure usando Batch
   start-all.bat
   ```

4. **Accedi all'applicazione**
   - 🎨 **Frontend Angular**: http://localhost:4200
   - 🌐 **Backend Node.js**: http://localhost:8001  
   - 🐍 **MCP Server Python**: http://localhost:8080

### Avvio Manuale

Se preferisci avviare i servizi manualmente:

```bash
# 1. Avvia il server MCP Python (terminale 1)
python main_api.py

# 2. Compila e avvia il backend Node.js (terminale 2)
npm run build
npm start

# 3. Avvia il frontend Angular (terminale 3)
cd langgraph-frontend
ng serve --open
```

## 🛠️ Installazione

### Prerequisiti
- Python 3.11+
- Server MCP in esecuzione su `localhost:8080`
- Chiave API OpenAI

### Setup Locale

1. **Clona il repository**
```bash
git clone <repository-url>
cd progettoLangGraphProva
```

2. **Installa le dipendenze**
```bash
pip install -r requirements.txt
```

3. **Configura le variabili d'ambiente**
```bash
# Copia e modifica il file .env
cp .env.example .env
```

Edita `.env` con le tue credenziali:
```env
OPENAI_API_KEY=your_openai_api_key_here
LANGCHAIN_API_KEY=your_langsmith_api_key_here
LANGCHAIN_TRACING_V2=true
LANGCHAIN_PROJECT=langgraph-agent-project
MCP_DISCOVERY_URL=http://localhost:8080/sse
MCP_ENABLE_DISCOVERY=true
```

4. **Avvia il server**
```bash
python main_api.py
```

### Setup Docker

1. **Build dell'immagine**
```bash
docker build -t langgraph-mcp .
```

2. **Avvia il container**
```bash
docker run -p 8001:8001 --env-file .env langgraph-mcp
```

## 🎯 Utilizzo

### WebSocket API

Connettiti all'endpoint WebSocket per interagire con gli agenti:

```javascript
const ws = new WebSocket('ws://localhost:8001/ws/my-session-id');

ws.onopen = function() {
    ws.send('Chi sono gli stagisti di Mauden?');
};

ws.onmessage = function(event) {
    console.log('Risposta:', event.data);
};
```

### Esempi di Query

**Query per MCP Agent:**
```
- "Chi sono gli stagisti di Mauden?"
- "Mostrami i dati dei dipendenti"
- "Quante donne ci sono in azienda?"
```

**Query per General Agent:**
```
- "Ciao, come stai?"
- "Raccontami una barzelletta"
- "Spiegami cos'è l'intelligenza artificiale"
```

## 🚀 Frontend Angular

Per avviare l'interfaccia utente Angular di testing:

1.  **Naviga nella directory del frontend:**
    ```bash
    cd langgraph-frontend
    ```

2.  **Installa le dipendenze:**
    ```bash
    npm install
    ```

3.  **Avvia il server di sviluppo Angular:**
    ```bash
    ng serve
    ```

4.  Apri il browser e naviga a `http://localhost:4200/`. L'applicazione si connetterà automaticamente al backend WebSocket su `ws://localhost:8001/ws/angular-session`.

## 🧪 Testing

### Test Locale degli Agenti
```bash
# Test dell'orchestratore
cd my_agent
python orchestrator_agent.py

# Test del general agent
python general_agent.py

# Test del MCP agent
python mcp_agent.py
```

### Test dell'API
```bash
# Avvia il server
python main_api.py

# In un altro terminale, testa con curl
curl -X GET "http://localhost:8001/health"
```

## 📁 Struttura del Progetto

```
progettoLangGraphProva/
├── 📄 main_api.py              # Server FastAPI con WebSocket
├── 📄 mcp_utils.py             # Utilities per MCP connection
├── 📄 mcp_servers.json         # Configurazione server MCP
├── 📄 requirements.txt         # Dipendenze Python
├── 📄 Dockerfile              # Container configuration
├── 📄 .env                     # Variabili d'ambiente
└── 📁 my_agent/
    ├── 📄 orchestrator_agent.py # Agente router principale
    ├── 📄 mcp_agent.py         # Agente per strumenti MCP
    ├── 📄 general_agent.py     # Agente conversazionale
    └── 📄 __init__.py
```

## ⚙️ Configurazione

### Strumenti MCP Disponibili

Il sistema si connette automaticamente al server MCP e scopre gli strumenti disponibili:

- **`get_stagisti_mcp`**: Recupera lista stagisti Mauden
- **`get_dati_csv_mcp`**: Recupera dati dipendenti da CSV

### Configurazione Server MCP

Modifica `mcp_servers.json` per aggiungere nuovi server:

```json
{
  "servers": [
    {
      "id": "mauden_server",
      "name": "Mauden MCP Server", 
      "url": "http://localhost:8080/sse",
      "description": "Server MCP principale per tools Mauden"
    }
  ]
}
```

## 🔧 Configurazione MCP Multi-Server

### Sistema di Configurazione Dinamica

Il sistema ora supporta la **configurazione di multipli server MCP** tramite file JSON, permettendo di aggiungere, rimuovere e gestire server senza modificare il codice.

#### File di Configurazione: `mcp_servers.json`

```json
{
  "servers": [
    {
      "id": "mauden_server",
      "name": "Mauden MCP Server",
      "url": "http://localhost:8080",
      "tools_endpoint": "/tools",
      "description": "Server MCP principale per tools Mauden",
      "enabled": true,
      "timeout": 10000,
      "retry_attempts": 3,
      "priority": 1
    },
    {
      "id": "weather_api",
      "name": "Weather API Server", 
      "url": "http://localhost:8081",
      "tools_endpoint": "/api/tools",
      "description": "Server per dati meteorologici",
      "enabled": true,
      "priority": 2
    }
  ],
  "discovery": {
    "enabled": true,
    "timeout_per_server": 10000,
    "max_concurrent_discoveries": 3,
    "cache_ttl_minutes": 5,
    "fallback_to_mock": true
  }
}
```

#### CLI per Gestione Server

```bash
# Lista server configurati
node mcp-config-cli.js list

# Aggiungi nuovo server
node mcp-config-cli.js add \
  --id new_server \
  --name "New MCP Server" \
  --url "http://localhost:8082" \
  --description "Nuovo server MCP"

# Rimuovi server
node mcp-config-cli.js remove --id server_id

# Testa connessioni
node mcp-config-cli.js test --all
```

#### Funzionalità Multi-Server

- **🔍 Discovery Parallelo**: Connessione concorrente a multipli server
- **⚡ Cache Intelligente**: Cache separata per ogni server con TTL configurabile  
- **🔄 Retry Automatico**: Retry con exponential backoff per server temporaneamente down
- **📊 Priorità Server**: Ordinamento server per priorità configurabile
- **🛡️ Fallback Robusto**: Continuità di servizio anche con server parzialmente down
- **🎯 Tool Identification**: Ogni tool include informazioni sul server di origine

Vedi `MCP-MULTI-SERVER.md` per la documentazione completa.

## 🐛 Troubleshooting

### Problemi Comuni

**Errore: "MCP tools cache is empty"**
- Verifica che il server MCP sia in esecuzione su `localhost:8080`
- Controlla la configurazione in `mcp_servers.json`
- Verifica `MCP_ENABLE_DISCOVERY=true` nel file `.env`

**Errore: "OPENAI_API_KEY non configurata"**
- Assicurati che la chiave API OpenAI sia corretta nel file `.env`
- Verifica che il file `.env` sia nella directory root del progetto

**L'orchestratore non seleziona lo strumento MCP corretto**
- Le descrizioni degli strumenti potrebbero essere troppo generiche
- Modifica `mcp_utils.py` per migliorare le descrizioni degli strumenti

### Debug con LangSmith

Se hai configurato LangSmith, puoi monitorare l'esecuzione degli agenti:

1. Vai su [LangSmith](https://smith.langchain.com)
2. Cerca il progetto configurato in `LANGCHAIN_PROJECT`
3. Analizza i trace per identificare problemi di routing o esecuzione

## 🤝 Contribuire

1. Fork del repository
2. Crea un branch per la tua feature (`git checkout -b feature/amazing-feature`)
3. Commit delle modifiche (`git commit -m 'Add amazing feature'`)
4. Push al branch (`git push origin feature/amazing-feature`)
5. Apri una Pull Request

## 📋 TODO

- [ ] Migliorare le descrizioni degli strumenti MCP per un routing più accurato
- [ ] Implementare caching persistente per conversation history
- [ ] Aggiungere autenticazione e autorizzazione
- [ ] Implementare rate limiting
- [ ] Aggiungere metriche e monitoring
- [x] Creare frontend web per testing
- [ ] Documentazione API con OpenAPI/Swagger

## 📄 Licenza

Questo progetto è rilasciato sotto licenza MIT. Vedi il file `LICENSE` per i dettagli.

## 🆘 Supporto

Per supporto tecnico o domande:
- Apri una issue su GitHub
- Controlla la sezione [Troubleshooting](#-troubleshooting)
- Verifica i log di LangSmith per errori dettagliati
