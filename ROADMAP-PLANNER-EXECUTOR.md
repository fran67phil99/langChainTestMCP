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
*   **Stato:** ✅ **Completata**

---

## Fase 3: Aggiunta di un "Synthesizer Agent"

**Obiettivo:** Creare un agente finale che trasformi i dati grezzi raccolti dall'Executor in una risposta naturale e coerente per l'utente.

*   **Azione 3.1:** Creazione del file `src/agents/synthesizerAgent.js`.
*   **Azione 3.2:** Sviluppo di un prompt che istruisca il Synthesizer a:
    1.  Analizzare la domanda originale dell'utente.
    2.  Esaminare il contesto di esecuzione contenente tutti i dati raccolti.
    3.  Formulare una risposta unica e fluida nella lingua originale della richiesta.
    4.  Evitare di menzionare dettagli tecnici come i nomi delle variabili o gli step del piano.
*   **Azione 3.3:** Modifica dell'Executor per invocare il Synthesizer come passo finale, passandogli la domanda originale e il contesto di esecuzione.
*   **Stato:** ✅ **Completata**

---

## Stato Attuale del Progetto

L'architettura **Planner-Executor-Synthesizer** è stata implementata con successo. Il sistema è ora in grado di:

1.  **Pianificare:** Decomporre una domanda complessa in un piano eseguibile.
2.  **Eseguire:** Eseguire il piano passo dopo passo, gestendo le dipendenze e raccogliendo i dati necessari.
3.  **Sintetizzare:** Generare una risposta finale, coerente e in linguaggio naturale a partire dai dati raccolti.

Il sistema è robusto, estensibile e pronto per future evoluzioni.
