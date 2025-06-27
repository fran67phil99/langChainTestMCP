# Architettura del Sistema di Logging in Tempo Reale

## 1. Obiettivo

Sostituire l'attuale sistema di logging con una soluzione robusta, centralizzata e in tempo reale che fornisca all'utente una visione chiara e strutturata del processo di elaborazione della richiesta, simile a un pannello di "Ricerca" con step sequenziali. Questo migliorerà la trasparenza e il debugging.

## 2. Architettura Generale

Il sistema si baserà su **Socket.IO** per la comunicazione bidirezionale tra backend (Node.js) e frontend (Angular).

-   **Backend**: Un utility di logging centralizzata (`progressLogger.js`) riceverà i log da tutti gli agenti e li trasmetterà immediatamente al client tramite un evento WebSocket.
-   **Frontend**: Un servizio Angular (`websocket.service.ts`) ascolterà gli eventi dal server e un componente (`chat.component.ts`) si occuperà di renderizzare i log in un formato visuale strutturato.

## 3. Struttura dei Dati di Log

Ogni messaggio di log inviato dal backend al frontend sarà un oggetto JSON con la seguente struttura, per permettere una visualizzazione ricca e contestuale:

```json
{
  "source": "NomeAgente", // Es: "OrchestratorAgent", "DataExplorerAgent", "SQLSchemaAgent"
  "status": "Stato",     // Es: "start", "info", "in-progress", "success", "error", "warning"
  "message": "Messaggio descrittivo dell'evento.",
  "timestamp": "ISO_8601_timestamp"
}
```

## 4. Piano di Implementazione

### Fase 1: Backend

1.  **Creare il Logger Centralizzato**:
    -   Creare il file `src/utils/progressLogger.js`.
    -   Esporta due funzioni: `init(io)` per inizializzare con l'istanza di Socket.IO e `logProgress(data)` per inviare i log.

2.  **Integrare il Logger nel Server Principale**:
    -   In `simple-server.js`, importare e inizializzare `progressLogger`.
    -   Rimuovere ogni riferimento al vecchio `a2aLogger`.
    -   Passare la funzione `logProgress` all'`orchestratorAgent` all'inizio di ogni richiesta.

3.  **Propagare il Logger attraverso gli Agenti**:
    -   Modificare la firma di ogni funzione agente (`run...Agent`) per accettare `logProgress` come parametro.
    -   Sostituire tutte le chiamate a `console.log` e `a2aLogger` con chiamate a `logProgress`, formattando il messaggio secondo la struttura definita.
    -   Assicurarsi che `logProgress` sia passato a catena a tutti gli agenti secondari (es. da `DataExplorerAgent` a `SQLSchemaAgent`).

4.  **Pulizia**:
    -   Eliminare il file `src/utils/a2aLogger.js`.
    -   Rimuovere tutte le dipendenze `require('../utils/a2aLogger')` dal codice.

### Fase 2: Frontend

1.  **Aggiornare il Servizio WebSocket**:
    -   In `langgraph-frontend/src/app/websocket.service.ts`, assicurarsi che ci sia un metodo per ascoltare un evento specifico (es. `progress_update`) e che restituisca un `Observable`.

2.  **Aggiornare il Componente Chat (Logica)**:
    -   In `langgraph-frontend/src/app/chat/chat.component.ts`:
        -   Creare un array per memorizzare i log ricevuti (es. `progressLogs: any[] = []`).
        -   Sottoscrivere l'`Observable` del servizio WebSocket. Ad ogni log ricevuto, aggiungerlo all'array.
        -   Svuotare l'array all'inizio di una nuova richiesta.

3.  **Aggiornare il Componente Chat (Template)**:
    -   In `langgraph-frontend/src/app/chat/chat.component.html`:
        -   Rimuovere completamente la vecchia visualizzazione dei log.
        -   Implementare una nuova sezione che itera sull'array `progressLogs` (`*ngFor`).
        -   Utilizzare CSS per stilizzare la visualizzazione in modo che assomigli alla timeline verticale mostrata nell'immagine di riferimento (es. con icone o prefissi testuali per indicare la fonte e lo stato).

## 5. Stato del Progetto

### ✅ COMPLETATO
Il sistema di logging centralizzato in tempo reale è stato **completamente implementato e testato con successo**. Tutti gli obiettivi architetturali sono stati raggiunti:

1. **Logger Centralizzato**: `src/utils/progressLogger.js` implementato e integrato
2. **Server Principale**: `simple-server.js` aggiornato con completa rimozione di `a2aLogger`
3. **Propagazione Agenti**: Tutti gli agenti (OrchestratorAgent, DataExplorerAgent, SQLSchemaAgent, ecc.) aggiornati per utilizzare `logProgress`
4. **Frontend in Tempo Reale**: Servizio WebSocket e componente chat aggiornati per visualizzazione timeline
5. **Funzioni SQL**: Implementate `generateSqlQuery` e `executeSqlQuery` per completare la pipeline dati
6. **Ottimizzazioni**: Corretta discovery schema SQLite e pulizia query SQL

### 🚀 RISULTATI
- **Logging Strutturato**: Tutti i log seguono il formato JSON standardizzato
- **Trasmissione Real-Time**: Socket.IO trasmette correttamente i log al frontend
- **Pipeline Completa**: Intera catena di elaborazione funziona end-to-end
- **Performance**: Sistema ottimizzato per SQLite e query MCP
- **Debugging**: Visibilità completa del flusso di elaborazione tramite timeline

### 🔧 MIGLIORAMENTI IMPLEMENTATI
- **SQLite Compatibility**: Uso di `PRAGMA table_info()` invece di `DESCRIBE`
- **Query Cleaning**: Rimozione automatica dei backticks markdown dalle query SQL
- **Parameter Optimization**: Semplificazione parametri per tool MCP

Il sistema è ora **pronto per la produzione** e fornisce una soluzione completa di logging centralizzato e in tempo reale per l'architettura backend-frontend.

---

Questo piano ci permetterà di procedere in modo ordinato, affrontando un componente alla volta e garantendo che il vecchio sistema venga completamente rimosso prima di testare quello nuovo.
