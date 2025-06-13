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

### 📊 Osservabilità e Monitoraggio
- Integrazione **LangSmith** per tracing e debugging avanzato
- Logging dettagliato di tutte le operazioni degli agenti
- Monitoraggio stato agenti e performance in tempo reale
- Tracciamento completo delle conversazioni multilingue
- Metriche di utilizzo token e latenza per ogni agente

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
   # Modifica il file .env con la tua OpenAI API Key e opzionalmente LangSmith
   OPENAI_API_KEY="sk-your-actual-openai-api-key"
   
   # Optional: Aggiungi LangSmith per debugging e monitoraggio avanzato
   LANGCHAIN_TRACING_V2="true"
   LANGCHAIN_API_KEY="your_langsmith_api_key"
   LANGCHAIN_PROJECT="MyLangGraphProgetto-NodeJS"
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

## 👨‍💻 Guida per Sviluppatori

### 🚀 Setup Completo per lo Sviluppo

Questa sezione fornisce una guida dettagliata per sviluppatori che vogliono contribuire al progetto o utilizzarlo come base per i propri sviluppi.

#### Primo Setup del Progetto

1. **📥 Clona il repository**
   ```bash
   git clone https://github.com/fran67phil99/langChainTestMCP.git
   cd langChainTestMCP
   ```

2. **🔐 Configura le variabili d'ambiente**
   ```bash
   # Copia il template di configurazione
   cp .env.example .env
   ```
   
   **⚠️ IMPORTANTE**: Edita il file `.env` e aggiungi le tue credenziali:
   ```env
   # Aggiungi la tua chiave API OpenAI (OBBLIGATORIA)
   OPENAI_API_KEY="sk-proj-la-tua-chiave-openai-qui"
   
   # Optional: Aggiungi LangSmith per debugging
   LANGCHAIN_API_KEY="your_langsmith_api_key_here"
   LANGCHAIN_TRACING_V2="true"
   LANGCHAIN_PROJECT="MyLangGraphProgetto-NodeJS"
   ```

3. **📦 Installa tutte le dipendenze**
   ```bash
   # Backend Node.js
   npm install
   
   # Frontend Angular
   cd langgraph-frontend
   npm install
   cd ..
   
   # Server MCP Python
   pip install -r requirements.txt
   ```

#### Avvio dell'Ambiente di Sviluppo

**🎯 Opzione A - Avvio Automatico (Consigliato)**
```bash
# Windows PowerShell
.\start-all.ps1

# Windows Command Prompt  
start-all.bat
```

**🔧 Opzione B - Avvio Manuale (Per debugging)**
```bash
# Terminale 1: Server MCP Python
python main_api.py

# Terminale 2: Backend Node.js
npm run dev

# Terminale 3: Frontend Angular (opzionale)
cd langgraph-frontend
ng serve --open
```

#### Endpoint di Sviluppo

Dopo l'avvio, avrai accesso a:
- 🎨 **Frontend Angular**: http://localhost:4200
- 🌐 **Backend Node.js**: http://localhost:8001
- 🐍 **MCP Server Python**: http://localhost:8080
- 📊 **Health Check**: http://localhost:8001/health

### 🧪 Testing e Debugging

#### Test Rapidi del Sistema

```bash
# Test sistema multilingua completo
node test-multilingual.js

# Test architettura modulare
node test-modular.js

# Demo sistema multi-server MCP
node demo-multi-server.js
```

#### Test Componenti Individuali

```bash
# Test configurazione MCP
node mcp-config-cli.js list
node mcp-config-cli.js test --all

# Test con curl
curl -X GET "http://localhost:8001/health"
curl -X GET "http://localhost:8080/tools"
```

### 🏗️ Architettura per Sviluppatori

#### Agenti Modulari

Il sistema è organizzato in **4 agenti specializzati**:

1. **`orchestratorAgent.optimized.js`** - Router intelligente (80% riduzione codice)
2. **`languageAgent.js`** - Gestione multilingua automatica  
3. **`mcpAgent.js`** - Specialista dati aziendali
4. **`generalAgent.js`** - Conoscenza generale

#### Flusso di Elaborazione

```
Input Utente (qualsiasi lingua)
    ↓
🌍 Language Agent → Rilevamento lingua + Traduzione → Inglese
    ↓  
🧠 Orchestrator Agent → Routing LLM-powered → Selezione agente
    ↓
🔧 Specialized Agent → Elaborazione specifica
    ↓
🌍 Language Agent → Traduzione risposta → Lingua originale
    ↓
Output Utente (lingua nativa)
```

### 🔧 Configurazione Multi-Server MCP

#### Gestione Server via CLI

```bash
# Lista server configurati
node mcp-config-cli.js list

# Aggiungi nuovo server
node mcp-config-cli.js add --id my_server --name "My Server" --url "http://localhost:8082"

# Abilita/disabilita server
node mcp-config-cli.js toggle --id my_server

# Test connettività
node mcp-config-cli.js test --id my_server
```

#### Configurazione Personalizzata

Modifica `mcp_servers.json` per configurazioni avanzate:

```json
{
  "servers": [
    {
      "id": "custom_server",
      "name": "Custom MCP Server",
      "url": "http://localhost:8082", 
      "tools_endpoint": "/api/v1/tools",
      "enabled": true,
      "timeout": 15000,
      "retry_attempts": 5,
      "priority": 1
    }
  ],
  "discovery": {
    "max_concurrent_discoveries": 5,
    "cache_ttl_minutes": 10
  }
}
```

### 🔒 Best Practice di Sicurezza

#### Gestione Chiavi API

- ✅ **File `.env` è ignorato da Git** - le tue chiavi rimangono locali
- ✅ **Template `.env.example`** - condiviso nel repository senza chiavi
- ✅ **Non committare mai chiavi API** - il sistema previene leak accidentali

#### Workflow Sicuro

```bash
# 1. Le tue modifiche al .env rimangono locali
echo "OPENAI_API_KEY=sk-..." >> .env

# 2. Git non traccia il file .env
git status  # .env non appare nelle modifiche

# 3. Solo .env.example è versionato
git add .env.example  # Template sicuro
```

### 📚 Documentazione Aggiuntiva

- **`README-MULTILINGUAL.md`** - Sistema multilingua dettagliato
- **`MCP-MULTI-SERVER.md`** - Configurazione avanzata multi-server
- **`/src/agents/`** - Documentazione inline negli agenti
- **`/test-*.js`** - Esempi pratici di utilizzo

### 🤝 Contribuzioni

#### Workflow di Sviluppo

```bash
# 1. Crea un branch per la tua feature
git checkout -b feature/nome-feature

# 2. Sviluppa e testa
npm test
node test-multilingual.js

# 3. Commit e push
git add .
git commit -m "feat: descrizione feature"
git push origin feature/nome-feature

# 4. Apri una Pull Request
```

#### Linee Guida

- 🧪 **Aggiungi test** per nuove funzionalità
- 📝 **Documenta** le modifiche all'architettura
- 🌍 **Testa il sistema multilingua** se tocchi gli agenti
- 🔧 **Verifica la compatibilità MCP** se modifichi mcpUtils

### 🆘 Risoluzione Problemi Sviluppatori

#### Problemi Comuni

**❌ "OPENAI_API_KEY not configured"**
```bash
# Soluzione: Verifica il file .env
cat .env | grep OPENAI_API_KEY
# Deve contenere: OPENAI_API_KEY="sk-proj-..."
```

**❌ "MCP server connection failed"**  
```bash
# Soluzione: Verifica che il server Python sia attivo
curl http://localhost:8080/tools
# Oppure riavvia: python main_api.py
```

**❌ "Error: 401 Unauthorized"**
```bash
# Soluzione: Chiave API non valida o scaduta
# Genera una nuova chiave su: https://platform.openai.com/api-keys
```

**❌ "No tools discovered from any server"**
```bash
# Soluzione: Testa la configurazione MCP
node mcp-config-cli.js test --all
node demo-multi-server.js
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

## 📊 Integrazione LangSmith - Monitoraggio e Debugging

### Panoramica LangSmith

Il sistema integra **LangSmith** per fornire osservabilità completa e capacità di debugging avanzate su tutti gli agenti del sistema. LangSmith consente di:

- **🔍 Tracciare** ogni esecuzione di agente e routing decision
- **📈 Monitorare** performance, latenza e utilizzo token
- **🐛 Debuggare** problemi di routing e selezione strumenti
- **📊 Analizzare** pattern di utilizzo e efficacia del sistema
- **🌍 Tracciare** flussi multilingue completi

### Configurazione LangSmith

#### 1. Setup Ambiente

Aggiungi le seguenti variabili al tuo file `.env`:

```env
# LangSmith Configuration (completamente opzionale)
LANGCHAIN_TRACING_V2="true"
LANGCHAIN_API_KEY="lsv2_pt_your_langsmith_api_key_here"
LANGCHAIN_ENDPOINT="https://api.smith.langchain.com"
LANGCHAIN_PROJECT="MyLangGraphProgetto-NodeJS"
```

#### 2. Ottenere la API Key LangSmith

1. Vai su [LangSmith](https://smith.langchain.com/)
2. Crea un account o accedi
3. Vai su **Settings** > **API Keys**
4. Crea una nuova API key
5. Copia la chiave nel file `.env`

#### 3. Verifica Configurazione

```bash
# Test della configurazione LangSmith
node test-langsmith.js

# Il sistema funziona perfettamente anche SENZA LangSmith configurato
npm start  # Funziona sempre, con o senza LangSmith
```

### Funzionalità di Monitoring

#### Tracciamento Automatico

Il sistema traccia automaticamente:

```javascript
// Routing decisions dell'orchestratore
await logAgentActivity('orchestrator', 'routing_decision', {
    user_input: message,
    selected_agent: agentType,
    routing_reason: 'Based on LLM analysis',
    confidence: 'high'
});

// Detection linguistiche
await logAgentActivity('language', 'language_detection', {
    detected_language: language,
    confidence: confidence,
    original_text: text.substring(0, 100)
});

// Esecuzione strumenti MCP
await logAgentActivity('mcp', 'tool_execution', {
    tool_name: selectedTool.name,
    server_source: selectedTool.server_source,
    execution_time: `${Date.now() - startTime}ms`,
    success: true
});
```

#### Dashboard LangSmith

Dopo aver configurato LangSmith, accedi alla dashboard per vedere:

1. **📊 Trace Completi**: Visualizza l'intero flusso di elaborazione
2. **⚡ Performance Metrics**: Tempo di risposta per ogni agente
3. **🎯 Success/Error Rates**: Tasso di successo routing e tool execution
4. **💰 Token Usage**: Monitoraggio costi e utilizzo per agente
5. **🌍 Language Analytics**: Pattern di utilizzo multilingue

### Utilizzo per Debugging

#### Scenario 1: Debugging Routing Problems

Se l'orchestratore seleziona l'agente sbagliato:

1. **Vai su LangSmith** → Il tuo progetto
2. **Cerca trace** con tag `orchestrator` e `routing_decision`
3. **Analizza il reasoning** del LLM per il routing
4. **Identifica pattern** di routing incorretti
5. **Ottimizza prompt** dell'orchestratore se necessario

#### Scenario 2: Performance Analysis

Per ottimizzare performance:

1. **Filtra trace** per agente specifico
2. **Analizza token usage** per identificare agenti costosi
3. **Monitora latency** per identificare bottleneck
4. **Confronta versioni** dopo ottimizzazioni

#### Scenario 3: Multilingue Debugging

Per problemi di traduzione o detection lingua:

1. **Cerca trace** con tag `language` 
2. **Verifica accuracy** detection lingua
3. **Analizza qualità** traduzioni
4. **Identifica lingue** problematiche

### Configurazione Avanzata

#### Custom Project Settings

```javascript
// src/utils/langsmithConfig.js
const initializeLangSmith = () => {
    if (process.env.LANGCHAIN_TRACING_V2 === 'true') {
        process.env.LANGCHAIN_PROJECT = process.env.LANGCHAIN_PROJECT || 'MyLangGraphProgetto-NodeJS';
        process.env.LANGCHAIN_ENDPOINT = process.env.LANGCHAIN_ENDPOINT || 'https://api.smith.langchain.com';
        
        console.log('✅ LangSmith initialized for project:', process.env.LANGCHAIN_PROJECT);
        return true;
    }
    return false;
};
```

#### Custom Tracking per Agent Personalizzati

```javascript
const { logAgentActivity } = require('./src/utils/langsmithConfig');

// Nel tuo agente personalizzato
async function myCustomAgent(input) {
    const startTime = Date.now();
    
    try {
        // La tua logica qui
        const result = await processInput(input);
        
        // Log success
        await logAgentActivity('my_custom_agent', 'processing', {
            input_type: typeof input,
            processing_time: `${Date.now() - startTime}ms`,
            success: true,
            output_length: result.length
        });
        
        return result;
    } catch (error) {
        // Log errors
        await logAgentActivity('my_custom_agent', 'error', {
            error_type: error.name,
            error_message: error.message,
            processing_time: `${Date.now() - startTime}ms`,
            success: false
        });
        throw error;
    }
}
```

### Sistema Resiliente

**⚡ Caratteristica Importante**: Il sistema è progettato per essere **completamente resiliente**:

- ✅ **Funziona perfettamente** anche SENZA LangSmith configurato
- ✅ **Zero downtime** se LangSmith è temporaneamente non disponibile  
- ✅ **Graceful degradation** - logging silently fails, sistema continua
- ✅ **No breaking changes** - LangSmith è puramente additive

```javascript
// Il sistema gestisce automaticamente errori LangSmith
try {
    await logAgentActivity(/* ... */);
} catch (error) {
    // Errore LangSmith ignorato silenziosamente
    // Il sistema continua normalmente
}
```

### Best Practices

#### 1. Organizzazione Projects

- **Un progetto per ambiente**: `Dev-MyLangGraph`, `Prod-MyLangGraph`
- **Progetti separati per features**: `MyLangGraph-Multilingual`, `MyLangGraph-MCP`

#### 2. Tag Strategy

Usa tag consistenti per facilitare filtering:

```javascript
await logAgentActivity('orchestrator', 'routing_decision', {
    // Dati specifici
}, {
    environment: 'production',
    version: '1.0.0',
    user_session: sessionId
});
```

#### 3. Performance Monitoring

- **Monitor token usage** per evitare costi eccessivi
- **Set up alerts** per error rates anomali
- **Track latency trends** nel tempo

#### 4. Privacy e Sicurezza

- ⚠️ **Non loggare dati sensibili** nelle activity logs
- ✅ **Usa abstractions** per dati utente privati
- ✅ **Configura retention policies** appropriate

### Troubleshooting LangSmith

#### Problema: "LangSmith not tracking"

```bash
# Verifica configurazione
echo $LANGCHAIN_TRACING_V2  # Deve essere "true"
echo $LANGCHAIN_API_KEY     # Deve iniziare con "lsv2_"

# Test connessione
node test-langsmith.js
```

#### Problema: "Invalid API Key"

1. Rigenera API key su LangSmith dashboard
2. Verifica che inizi con `lsv2_`
3. Controlla che non ci siano spazi extra nel `.env`

#### Problema: "Project not found"

1. Verifica nome progetto su LangSmith dashboard
2. Il progetto viene creato automaticamente se non esiste
3. Controlla permessi dell'API key

### Risorse Aggiuntive

- 📚 **[LangSmith Documentation](https://docs.smith.langchain.com/)**
- 🎥 **[LangSmith Video Tutorials](https://www.youtube.com/playlist?list=PLfaIDFEXuae2LXbO1_PKyVJiQ23ZztA0x)**
- 💬 **[LangSmith Discord Community](https://discord.gg/langchain)**

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
- Usa LangSmith per analizzare le decisioni di routing dell'orchestratore

**Errore: "LangSmith tracing failed"**
- LangSmith è completamente opzionale - il sistema continua a funzionare
- Verifica `LANGCHAIN_API_KEY` nel file `.env` se vuoi usare LangSmith
- Testa con: `node test-langsmith.js`

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
- [x] ✅ **Integrazione LangSmith completa** - Monitoraggio e debugging avanzato
- [x] ✅ **Sistema multilingue automatico** - Detection e traduzione seamless
- [x] ✅ **Architettura modulare ottimizzata** - 4 agenti specializzati
- [x] Creare frontend web per testing
- [ ] Documentazione API con OpenAPI/Swagger
- [ ] Implementare dashboard analytics personalizzata con metriche LangSmith
- [ ] Aggiungere alerting automatico per performance degradation

## 📄 Licenza

Questo progetto è rilasciato sotto licenza MIT. Vedi il file `LICENSE` per i dettagli.

## 🆘 Supporto

Per supporto tecnico o domande:
- Apri una issue su GitHub
- Controlla la sezione [Troubleshooting](#-troubleshooting)
- Verifica i log di LangSmith per errori dettagliati (se configurato)
- Testa con i file di esempio: `node test-multilingual.js`, `node test-langsmith.js`
- Controlla la [documentazione LangSmith](#-integrazione-langsmith---monitoraggio-e-debugging) per debugging avanzato
