s# 🚨 ZERO HARDCODED DESCRIPTIONS - MCP Dynamic Discovery

## Problema Rilevato ❌

Nel log è apparso:
```
- get_model_summary_mcp: [Mauden MCP Server] Gets the summary and details...
- query_database: [Mauden SQL MCP Server] Execute SQL queries...
```

**Questo è COMPLETAMENTE SBAGLIATO!** 

## Come Dovrebbe Funzionare ✅

### 1. **MCP Protocol Dynamic Discovery**
Le descrizioni dei tool devono venire **DIRETTAMENTE** dai server MCP tramite la chiamata standard:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

La risposta contiene le descrizioni reali:
```json
{
  "result": {
    "tools": [
      {
        "name": "query_database",
        "description": "Execute SQL queries on the film database",
        "inputSchema": { ... }
      }
    ]
  }
}
```

### 2. **Zero Configuration Hardcoding**
Il file `mcp_servers_standard.json` dovrebbe contenere SOLO:
- URL dei server
- Configurazioni di connessione
- Timeout e retry settings

**NON dovrebbe contenere:**
- Nomi specifici di tool
- Descrizioni di tool
- Logica di business hardcoded

### 3. **Flusso Corretto**

```
1. Sistema avvia discovery MCP
2. Chiama tools/list su ogni server
3. Server MCP risponde con le sue funzioni reali
4. Sistema usa le descrizioni DAL SERVER
5. Planner riceve descrizioni dynamic e accurate
```

## Correzioni Implementate ✅

### 1. **Rimosso Prefisso Hardcoded**
```javascript
// PRIMA (SBAGLIATO):
description: `[${serverConfig.name}] ${mcpTool.description}`

// DOPO (CORRETTO):
description: mcpTool.description || 'Tool description not provided by server'
```

### 2. **Nomi Server Corretti**
```json
// PRIMA (FUORVIANTE):
"name": "Mauden SQL MCP Server"

// DOPO (DESCRITTIVO):
"name": "De Agostini Film Database"
```

### 3. **Verifica nel Planner**
Il Revolutionary Planner ora avvisa se trova descrizioni hardcoded:
```javascript
if (description.includes('[Mauden') || description.includes('Mauden MCP Server')) {
    console.warn(`⚠️ Tool ${name} has hardcoded description: ${description}`);
}
```

## Benefici della Soluzione ✅

### **Dynamic Discovery**
- Tool descriptions vengono dai server reali
- Zero hardcoding nel codice
- Sistema si adatta automaticamente a nuovi tool

### **Domain Agnostic**
- Nessun riferimento a "Mauden" nel codice
- Sistema funziona con qualsiasi MCP server
- Descriptions accurate per ogni dominio

### **Revolutionary Planner Compatible**
- Riceve informazioni accurate sui tool
- Può pianificare collaborazioni basate su capabilities reali
- Non fa assunzioni sbagliate basate su nomi hardcoded

## Test di Verifica 🧪

```bash
node test-real-mcp-descriptions.js
```

Questo test verifica che:
- Le descrizioni vengano dai server MCP
- Non ci siano più prefissi hardcoded
- Il planner riceva informazioni accurate

## Principi Fondamentali 🎯

1. **NEVER HARDCODE** tool descriptions nel codice
2. **ALWAYS USE** MCP protocol per discovery dinamico
3. **TRUST THE SERVER** - se un server dice di fare X, fa X
4. **DOMAIN AGNOSTIC** - il sistema non deve sapere cosa fa un tool
5. **DYNAMIC ADAPTATION** - il sistema si adatta ai tool disponibili

## Risultato Finale 🎉

Il Revolutionary Planner ora riceve:
```
- query_database: Execute SQL queries on the film database (params: query)
- list_tables: List all available tables in the database (params: none)
- get_table_info: Get detailed information about a specific table (params: table_name)
```

**Invece di:**
```
- query_database: [Mauden SQL MCP Server] Execute SQL queries... ❌
```

**Il sistema è ora veramente domain-agnostic e dynamic!** 🚀
