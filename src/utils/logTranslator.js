// Log Translator - Servizio per tradurre automaticamente i log nella lingua della risposta
const { HumanMessage } = require('@langchain/core/messages');
const { createTrackedLLM } = require('./langsmithConfig');

// Initialize LLM per traduzioni veloci
const llm = createTrackedLLM({
  modelName: "gpt-3.5-turbo",
  temperature: 0.1, // Temperatura molto bassa per traduzioni consistent
});

/**
 * Traduzioni predefinite per log comuni (per performance)
 */
const LOG_TRANSLATIONS = {
  // Messaggi di log backend
  received: {
    it: '📨 Ricevuto',
    en: '📨 Received',
    fr: '📨 Reçu',
    es: '📨 Recibido',
    de: '📨 Empfangen'
  },
  language_detection: {
    it: '🌐 Rilevamento Lingua',
    en: '🌐 Language Detection',
    fr: '🌐 Détection Langue',
    es: '🌐 Detección Idioma',
    de: '🌐 Spracherkennung'
  },
  orchestrator_start: {
    it: '🚀 Avvio Orchestratore',
    en: '🚀 Starting Orchestrator',
    fr: '🚀 Démarrage Orchestrateur',
    es: '🚀 Iniciando Orquestador',
    de: '🚀 Orchestrator Start'
  },
  language_processing: {
    it: '🔍 Analisi Linguistica',
    en: '🔍 Language Analysis',
    fr: '🔍 Analyse Linguistique',
    es: '🔍 Análisis Lingüístico',
    de: '🔍 Sprachanalyse'
  },
  agent_routing: {
    it: '🎯 Selezione Agente',
    en: '🎯 Agent Selection',
    fr: '🎯 Sélection Agent',
    es: '🎯 Selección Agente',
    de: '🎯 Agenten-Auswahl'
  },
  agent_selected: {
    it: '🤖 Agente Selezionato',
    en: '🤖 Agent Selected',
    fr: '🤖 Agent Sélectionné',
    es: '🤖 Agente Seleccionado',
    de: '🤖 Agent Ausgewählt'
  },
  agent_executing: {
    it: '⚙️ Esecuzione Agente',
    en: '⚙️ Agent Executing',
    fr: '⚙️ Exécution Agent',
    es: '⚙️ Ejecutando Agente',
    de: '⚙️ Agent Ausführung'
  },
  processing_complete: {
    it: '✅ Elaborazione Completata',
    en: '✅ Processing Complete',
    fr: '✅ Traitement Terminé',
    es: '✅ Procesamiento Completo',
    de: '✅ Verarbeitung Abgeschlossen'
  },
  // Messaggi A2A (Agent-to-Agent)
  a2a_schema_discovery: {
    it: '🔍 A2A: Scoperta Schema Database',
    en: '🔍 A2A: Database Schema Discovery',
    fr: '🔍 A2A: Découverte Schéma BD',
    es: '🔍 A2A: Descubrimiento Esquema BD',
    de: '🔍 A2A: Datenbankschema-Erkennung'
  },
  a2a_query_generation: {
    it: '📝 A2A: Generazione Query SQL',
    en: '📝 A2A: SQL Query Generation',
    fr: '📝 A2A: Génération Requête SQL',
    es: '📝 A2A: Generación Consulta SQL',
    de: '📝 A2A: SQL-Abfrage Generierung'
  },
  a2a_data_formatting: {
    it: '📊 A2A: Formattazione Risultati',
    en: '📊 A2A: Results Formatting',
    fr: '📊 A2A: Formatage Résultats',
    es: '📊 A2A: Formateo Resultados',
    de: '📊 A2A: Ergebnisformatierung'
  },
  a2a_mcp_delegation: {
    it: '↗️ A2A: Delegazione MCP Agent',
    en: '↗️ A2A: MCP Agent Delegation',
    fr: '↗️ A2A: Délégation Agent MCP',
    es: '↗️ A2A: Delegación Agente MCP',
    de: '↗️ A2A: MCP-Agent Delegation'
  },
  a2a_response_translation: {
    it: '🌍 A2A: Traduzione Risposta',
    en: '🌍 A2A: Response Translation',
    fr: '🌍 A2A: Traduction Réponse',
    es: '🌍 A2A: Traducción Respuesta',
    de: '🌍 A2A: Antwort-Übersetzung'
  }
};

/**
 * Rileva la lingua dalla risposta dell'agente
 * @param {string} agentResponse - La risposta finale dell'agente
 * @returns {Promise<string>} - Codice lingua rilevato
 */
async function detectLanguageFromResponse(agentResponse) {
  if (!agentResponse || typeof agentResponse !== 'string') {
    return 'it'; // Default italiano
  }

  // Rilevamento rapido con pattern comuni
  const text = agentResponse.toLowerCase();
  
  // Pattern inglesi
  if (/\b(the|and|or|but|in|on|at|to|for|of|with|by)\b/.test(text) && 
      /\b(employees|data|information|company|team|results)\b/.test(text)) {
    return 'en';
  }
  
  // Pattern francesi
  if (/\b(le|la|de|du|des|avec|pour|dans|sur|et|ou)\b/.test(text) && 
      /\b(employés|données|informations|équipe|résultats)\b/.test(text)) {
    return 'fr';
  }
  
  // Pattern spagnoli
  if (/\b(el|la|de|del|con|para|en|sobre|y|o)\b/.test(text) && 
      /\b(empleados|datos|información|equipo|resultados)\b/.test(text)) {
    return 'es';
  }
  
  // Pattern tedeschi
  if (/\b(der|die|das|und|oder|mit|für|in|auf|zu)\b/.test(text) && 
      /\b(mitarbeiter|daten|informationen|team|ergebnisse)\b/.test(text)) {
    return 'de';
  }
  
  // Pattern italiani (default)
  if (/\b(il|la|di|del|con|per|in|su|e|o)\b/.test(text) && 
      /\b(dipendenti|dati|informazioni|team|risultati)\b/.test(text)) {
    return 'it';
  }
  
  // Fallback: Usa AI per rilevamento più accurato
  try {
    const detectionMessages = [
      new HumanMessage(`Detect the language of this text and respond with ONLY the language code (it, en, fr, es, de):

"${agentResponse.substring(0, 200)}"

Language code:`)
    ];
    
    const response = await llm.invoke(detectionMessages);
    const detectedLang = response.content.trim().toLowerCase();
    
    // Valida il risultato
    if (['it', 'en', 'fr', 'es', 'de'].includes(detectedLang)) {
      return detectedLang;
    }
    
  } catch (error) {
    console.error('❌ Error in AI language detection:', error);
  }
  
  return 'it'; // Default italiano
}

/**
 * Traduce un messaggio di log nella lingua specificata
 * @param {string} logKey - Chiave del log nelle traduzioni predefinite
 * @param {string} logMessage - Messaggio di log da tradurre
 * @param {string} targetLanguage - Lingua target (it, en, fr, es, de)
 * @returns {Promise<string>} - Messaggio tradotto
 */
async function translateLogMessage(logKey, logMessage, targetLanguage = 'it') {
  // Usa traduzioni predefinite se disponibili
  if (LOG_TRANSLATIONS[logKey] && LOG_TRANSLATIONS[logKey][targetLanguage]) {
    return LOG_TRANSLATIONS[logKey][targetLanguage];
  }
  
  // Se non abbiamo traduzione predefinita, usa AI
  if (targetLanguage === 'it') {
    return logMessage; // Già in italiano
  }
  
  try {
    const translationMessages = [
      new HumanMessage(`Translate this log message to ${getLanguageName(targetLanguage)}. Keep it concise and professional. Preserve any emoji icons.

Message to translate: "${logMessage}"

Translated message:`)
    ];
    
    const response = await llm.invoke(translationMessages);
    return response.content.trim();
    
  } catch (error) {
    console.error('❌ Error translating log message:', error);
    return logMessage; // Fallback al messaggio originale
  }
}

/**
 * Traduce i log di progresso in base alla lingua rilevata
 * @param {Array} progressLogs - Array di log di progresso
 * @param {string} targetLanguage - Lingua target
 * @returns {Promise<Array>} - Log tradotti
 */
async function translateProgressLogs(progressLogs, targetLanguage = 'it') {
  if (!progressLogs || !Array.isArray(progressLogs) || targetLanguage === 'it') {
    return progressLogs; // Nessuna traduzione necessaria
  }
  
  const translatedLogs = [];
  
  for (const log of progressLogs) {
    const translatedLog = { ...log };
    
    // Traduce il messaggio usando la chiave del step
    translatedLog.message = await translateLogMessage(
      log.step, 
      log.message, 
      targetLanguage
    );
    
    translatedLogs.push(translatedLog);
  }
  
  return translatedLogs;
}

/**
 * Crea log dettagliati per passaggi A2A (Agent-to-Agent)
 * @param {string} fromAgent - Agente di origine
 * @param {string} toAgent - Agente di destinazione
 * @param {string} operation - Operazione eseguita
 * @param {Object} details - Dettagli aggiuntivi
 * @param {string} language - Lingua per i log
 * @returns {Object} - Log A2A formattato
 */
function createA2ALog(fromAgent, toAgent, operation, details = {}, language = 'it') {
  const timestamp = new Date().toISOString();
  
  const operations = {
    schema_discovery: {
      it: `🔍 ${fromAgent} → ${toAgent}: Scoperta schema database`,
      en: `🔍 ${fromAgent} → ${toAgent}: Database schema discovery`,
      fr: `🔍 ${fromAgent} → ${toAgent}: Découverte schéma base de données`,
      es: `🔍 ${fromAgent} → ${toAgent}: Descubrimiento esquema base de datos`,
      de: `🔍 ${fromAgent} → ${toAgent}: Datenbankschema-Erkennung`
    },
    query_generation: {
      it: `📝 ${fromAgent} → ${toAgent}: Generazione query SQL`,
      en: `📝 ${fromAgent} → ${toAgent}: SQL query generation`,
      fr: `📝 ${fromAgent} → ${toAgent}: Génération requête SQL`,
      es: `📝 ${fromAgent} → ${toAgent}: Generación consulta SQL`,
      de: `📝 ${fromAgent} → ${toAgent}: SQL-Abfrage Generierung`
    },
    data_formatting: {
      it: `📊 ${fromAgent} → ${toAgent}: Formattazione risultati`,
      en: `📊 ${fromAgent} → ${toAgent}: Results formatting`,
      fr: `📊 ${fromAgent} → ${toAgent}: Formatage résultats`,
      es: `📊 ${fromAgent} → ${toAgent}: Formateo resultados`,
      de: `📊 ${fromAgent} → ${toAgent}: Ergebnisformatierung`
    },
    delegation: {
      it: `↗️ ${fromAgent} → ${toAgent}: Delegazione task`,
      en: `↗️ ${fromAgent} → ${toAgent}: Task delegation`,
      fr: `↗️ ${fromAgent} → ${toAgent}: Délégation tâche`,
      es: `↗️ ${fromAgent} → ${toAgent}: Delegación tarea`,
      de: `↗️ ${fromAgent} → ${toAgent}: Aufgaben-Delegation`
    },
    response_return: {
      it: `↩️ ${toAgent} → ${fromAgent}: Ritorno risultati`,
      en: `↩️ ${toAgent} → ${fromAgent}: Results return`,
      fr: `↩️ ${toAgent} → ${fromAgent}: Retour résultats`,
      es: `↩️ ${toAgent} → ${fromAgent}: Retorno resultados`,
      de: `↩️ ${toAgent} → ${fromAgent}: Ergebnis-Rückgabe`
    }
  };
  
  return {
    threadId: details.threadId || 'unknown',
    step: `a2a_${operation}`,
    message: operations[operation]?.[language] || operations[operation]?.it || `${fromAgent} → ${toAgent}: ${operation}`,
    timestamp,
    agent: fromAgent,
    targetAgent: toAgent,
    operation,
    details
  };
}

/**
 * Ottiene il nome completo della lingua dal codice
 * @param {string} langCode - Codice lingua
 * @returns {string} - Nome completo della lingua
 */
function getLanguageName(langCode) {
  const languages = {
    it: 'Italian',
    en: 'English',
    fr: 'French',
    es: 'Spanish',
    de: 'German'
  };
  return languages[langCode] || 'Italian';
}

module.exports = {
  detectLanguageFromResponse,
  translateLogMessage,
  translateProgressLogs,
  createA2ALog,
  getLanguageName,
  LOG_TRANSLATIONS
};
