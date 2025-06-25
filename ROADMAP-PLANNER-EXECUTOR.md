# Piano di Evoluzione: Da Router Reattivo a Planner/Executor Proattivo

Questo documento delinea il piano strategico per far evolvere il sistema di agenti, trasformandolo da un router di richieste singole a un motore di pianificazione ed esecuzione in grado di gestire domande complesse e multi-step.

## Principio Guida: Pianificazione Dinamica
Il Planner Agent non avrà una conoscenza statica degli strumenti. Al contrario, l'Orchestratore gli fornirà dinamicamente la lista degli agenti/tool disponibili (scoperti tramite il protocollo MCP). Questo permette al sistema di essere estensibile: aggiungendo un nuovo tool, il Planner imparerà a usarlo senza modifiche al suo prompt.

---

## Fase 1: Introduzione di un "Planner Agent"

**Obiettivo:** Creare un agente specializzato nella scomposizione di domande complesse in un piano JSON eseguibile.

*   **Azione 1.1:** Creazione del file `src/agents/plannerAgent.js`.
*   **Azione 1.2:** Sviluppo di un prompt che istruisca il Planner a:
    1.  Analizzare la richiesta utente e la lista di tool disponibili.
    2.  Determinare se la domanda è "semplice" (1 tool) o "complessa" (più tool/step).
    3.  Se complessa, generare un piano JSON con step sequenziali e dipendenze.
    *   **Esempio di Piano JSON:**
        ```json
        [
          {
            "step_id": 1,
            "tool_to_use": "sql_query_tool",
            "prompt": "Qual è il dipartimento con il maggior numero di stagisti?",
            "dependencies": [],
            "output_variable": "reparto_top"
          },
          {
            "step_id": 2,
            "tool_to_use": "sql_query_tool",
            "prompt": "Qual è l'età media dei dipendenti nel dipartimento '{reparto_top}'?",
            "dependencies": [1],
            "output_variable": "eta_media"
          }
        ]
        ```
*   **Azione 1.3:** Modifica dell'Orchestratore per invocare il Planner come primo passo e ricevere il piano.

---

## Fase 2: Trasformazione dell'Orchestratore in un "Executor"

**Obiettivo:** Evolvere l'Orchestratore da semplice router a esecutore di piani.

*   **Azione 2.1:** Implementare in `orchestratorAgent.optimized.js` la logica per:
    1.  Leggere ed eseguire il piano JSON passo dopo passo.
    2.  Gestire le dipendenze tra gli step.
    3.  Mantenere un "contesto di esecuzione" (un oggetto JSON) per salvare i risultati intermedi (es. `output_variable`).
    4.  Iniettare i risultati degli step precedenti nei prompt degli step successivi.

---

## Fase 3: Introduzione di un "Synthesizer Agent"

**Obiettivo:** Creare un agente che formuli una risposta finale coerente a partire dai risultati raccolti.

*   **Azione 3.1:** Creazione del file `src/agents/synthesizerAgent.js`.
*   **Azione 3.2:** Sviluppo di un prompt che istruisca il Synthesizer a:
    1.  Ricevere la domanda originale dell'utente e il contesto di esecuzione finale.
    2.  Sintetizzare i dati raccolti in una risposta in linguaggio naturale, completa e precisa.

---

## Nuovo Flusso Operativo

1.  **Utente** -> **Orchestrator**
2.  **Orchestrator** -> **Planner Agent** (con la lista dei tool)
3.  **Planner Agent** -> Restituisce Piano JSON -> **Orchestrator/Executor**
4.  **Orchestrator/Executor** -> Esegue il piano step-by-step, invocando i tool necessari e salvando i risultati.
5.  **Orchestrator/Executor** -> **Synthesizer Agent** (con domanda originale e risultati finali)
6.  **Synthesizer Agent** -> Restituisce risposta finale -> **Orchestrator**
7.  **Orchestrator** -> **Utente**
