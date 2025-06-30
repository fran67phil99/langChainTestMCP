# Flusso di Lavoro Agentico: Dinamico, Collaborativo e Agnostico

Questo documento descrive il flusso di lavoro del sistema agentico, progettato per essere completamente dinamico, collaborativo e agnostico rispetto al dominio applicativo. L'architettura elimina ogni forma di hardcoding, consentendo agli agenti di scoprire e utilizzare strumenti in modo flessibile, sia che provengano da server MCP, query SQL o altre fonti.

## 1. Principi Architetturali Chiave

- **Agnosticismo del Dominio**: Nessun agente ha conoscenza pregressa o "hardcoded" di specifici tool, server o workflow. La logica è guidata dinamicamente dalle capacità scoperte in tempo reale.
- **Collaborazione tramite Contesto (A2A)**: Gli agenti comunicano e collaborano passandosi un `A2A_context` (Agent-to-Agent context), che contiene i risultati, le osservazioni e i dati necessari per i passi successivi.
- **Orchestrazione Dinamica**: Il sistema non segue percorsi predefiniti. L'`OrchestratorAgent` seleziona l'agente o la sequenza di agenti più adatta in base alla richiesta dell'utente e al contesto attuale.
- **Scoperta Dinamica dei Tool**: L'`MCPAgent` interagisce con qualsiasi server conforme al Mauden Context Protocol (MCP) per scoprirne i tool disponibili, senza bisogno di configurazioni manuali specifiche per ogni tool.

## 2. Attori Principali del Flusso

Il sistema è composto da diversi agenti specializzati che vengono orchestrati per risolvere la richiesta dell'utente.

- **`OrchestratorAgent`**: È il "cervello" del sistema. Riceve la richiesta iniziale e, basandosi sul `PlannerAgent`, decide quale strategia adottare, orchestrando uno o più agenti in sequenza o in parallelo.
- **`PlannerAgent`**: Analizza la richiesta dell'utente e genera un piano strategico multi-step. Il piano non è rigido, ma suggerisce una sequenza di azioni e gli agenti più idonei (es. "prima interroga il database, poi usa i risultati per chiamare un tool MCP").
- **`MCPAgent`**: È il gateway per tutti i server MCP. Quando invocato, contatta i server disponibili, ne scopre i tool e le loro descrizioni, e seleziona (tramite LLM) quello più adatto per eseguire un compito. È in grado di aggregare risultati da più tool per fornire una risposta sintetica.
- **`DataExplorerAgent`**: Specializzato nell'analisi di dati. Riceve dati grezzi (da `MCPAgent`, `SQLAgent`, ecc.) tramite l'`A2A_context` e li analizza per estrarre insight, rispondere a domande specifiche o sintetizzarli per evitare di superare i limiti di token degli LLM.
- **`SQLAgent`**: Gestisce l'interazione con i database. È responsabile della generazione e dell'esecuzione di query SQL.
- **`LanguageAgent`**: Fornisce capacità di traduzione. Può essere inserito in qualsiasi punto del workflow dall'orchestratore, ad esempio per tradurre la richiesta iniziale dell'utente o la risposta finale.
- **`GeneralAgent`**: Un agente generico che può intervenire per compiti non specializzati o per interagire con l'utente.

## 3. Esempio di Flusso di Lavoro Complesso

Consideriamo la richiesta di un utente: *"Trova i dipendenti con le vendite più alte in Italia e riassumi il loro profilo in inglese."*

1.  **Input Utente**: La richiesta viene ricevuta dall'`OrchestratorAgent`.
2.  **Pianificazione (`PlannerAgent`)**: L'orchestratore invoca il `PlannerAgent`, che scompone la richiesta in un piano:
    1.  **Azione 1**: Interrogare una fonte dati per trovare i dipendenti e le loro vendite in Italia. (Agente suggerito: `SQLAgent` o `MCPAgent`).
    2.  **Azione 2**: Analizzare i dati per identificare i profili dei migliori venditori. (Agente suggerito: `DataExplorerAgent`).
    3.  **Azione 3**: Tradurre il riassunto del profilo in inglese. (Agente suggerito: `LanguageAgent`).
    4.  **Azione 4**: Presentare la risposta finale. (Agente suggerito: `GeneralAgent`).
3.  **Esecuzione - Step 1 (`MCPAgent` / `SQLAgent`)**: L'orchestratore esegue la prima azione. Ipotizziamo che scelga l'`MCPAgent`.
    - L'`MCPAgent` scopre dinamicamente un tool `get_sales_data(country: str)` su un server MCP.
    - Esegue il tool con `country="Italia"` e ottiene un elenco di dati di vendita.
    - Il risultato viene salvato nell'`A2A_context`.
4.  **Esecuzione - Step 2 (`DataExplorerAgent`)**: L'orchestratore passa il controllo e l'`A2A_context` al `DataExplorerAgent`.
    - L'agente analizza i dati di vendita, identifica i migliori dipendenti e crea un riassunto del loro profilo.
    - Il riassunto viene aggiunto all'`A2A_context`.
5.  **Esecuzione - Step 3 (`LanguageAgent`)**: L'orchestratore invoca il `LanguageAgent`.
    - L'agente prende il riassunto in italiano dall'`A2A_context` e lo traduce in inglese.
    - Il testo tradotto sostituisce o si aggiunge a quello precedente nel contesto.
6.  **Esecuzione - Step 4 (`GeneralAgent`)**: L'orchestratore passa il contesto finale al `GeneralAgent`, che formatta la risposta e la presenta all'utente.

Questo flusso dimostra come il sistema possa orchestrare dinamicamente una catena di agenti specializzati, ognuno dei quali opera in modo agnostico e collabora passando un contesto arricchito, per risolvere una richiesta complessa e multi-dominio.

## 4. Implementazione Dinamica dei Tool

### 4.1 Eliminazione della Logica Hardcoded

Il sistema è stato completamente refactorizzato per rimuovere ogni traccia di logica hardcoded:

- **Selezione Tool Dinamica**: Non esiste più la funzione `findBestMcpTool` che utilizzava pattern-matching hardcoded. La selezione dei tool avviene esclusivamente tramite l'`MCPAgent` utilizzando le descrizioni dei tool scoperte dinamicamente.

- **Nessuna Assunzione sui Dati**: Gli agenti non fanno alcuna assunzione su nomi di tabelle, colonne, o business logic specifica. Tutto è guidato dalla scoperta dello schema in tempo reale.

- **Tool Selection via LLM**: L'`MCPAgent` utilizza LLM per analizzare le descrizioni dei tool disponibili e selezionare quello più appropriato per ogni task specifico.

### 4.2 Flusso di Tool Selection

1. **Scoperta Dinamica**: Il sistema scopre i tool MCP disponibili e le loro descrizioni
2. **Analisi Semantica**: L'`MCPAgent` usa LLM per analizzare il task e le descrizioni dei tool  
3. **Selezione Intelligente**: Seleziona il tool (o i tool) più appropriati basandosi solo sulle descrizioni
4. **Esecuzione Diretta**: Esegue il tool selezionato con i parametri appropriati
5. **Risultati Formatati**: Formatta i risultati per l'utente o per il prossimo agente

### 4.3 Collaborazione Agente-a-Agente Avanzata

- **`DataExplorerAgent`**: Ora utilizza l'`MCPAgent` per la selezione e esecuzione dei tool invece di logica hardcoded
- **Schema Discovery**: Completamente dinamico, non fa assunzioni su tipi di database o strutture
- **Query Generation**: Generato semanticamente basandosi sullo schema scoperto, non su pattern predefiniti
- **Execution via MCP**: Tutte le esecuzioni passano attraverso l'`MCPAgent` per garantire consistenza e dinamicità

## 5. Vantaggi dell'Architettura Dinamica

- **Scalabilità**: Il sistema può lavorare con qualsiasi set di tool MCP senza modifiche al codice
- **Flessibilità**: Non è legato a specifici domini business o strutture dati
- **Manutenibilità**: Eliminando la logica hardcoded, il sistema è più facile da mantenere e debuggare
- **Robustezza**: Gestisce gracefully tool non disponibili o configurazioni diverse
- **Context-Aware**: Ogni decisione è basata sul contesto attuale, non su assunzioni predefinite

## 6. Issue Identificati e Risolti

Durante l'implementazione sono stati identificati e risolti diversi problemi critici:

### 6.1 Problema: DataExplorerAgent non esegue query SQL reali

**Sintomo**: Il DataExplorerAgent riceve schema e task complessi ma restituisce dati fittizi invece di eseguire query SQL reali sul database.

**Causa Identificata**: 
- Flow di esecuzione interrotto prima della fase di query generation
- Possibile early return nella logica A2A o nelle condizioni di controllo
- Problema nella transizione tra schema discovery e query execution

**Debugging in Corso**:
- Aggiunto extensive logging per tracciare il flow di esecuzione
- Verificata l'integrazione tra DataExplorerAgent e MCP Agent  
- Analisi delle condizioni che potrebbero bloccare l'esecuzione

### 6.2 Soluzione: Refactoring Dynamic Tool Selection

**Completato**: 
- ✅ Rimossa funzione `findBestMcpTool` hardcoded
- ✅ Integrato MCP Agent per selezione dinamica dei tool
- ✅ Eliminata logica pattern-based per business logic

**In Progress**:
- 🔄 Debug del flow di query execution nel DataExplorerAgent
- 🔄 Verifica dell'integrazione end-to-end tra tutti gli agenti
- 🔄 Test con scenari reali di query complesse

## 7. Roadmap Prossimi Passi

1. **Completamento Debug**: Identificare e risolvere il problema di query execution
2. **Test End-to-End**: Verificare che tutto il sistema funzioni con query SQL reali  
3. **Ottimizzazione Performance**: Migliorare l'efficienza delle operazioni dinamiche
4. **Error Handling**: Rafforzare la gestione degli errori in scenari edge
5. **Documentation**: Completare la documentazione tecnica del sistema
