// A2A Logger - Sistema per tracciare le comunicazioni Agent-to-Agent
const { createA2ALog } = require('../utils/logTranslator');
const { enhancedProgressLogger } = require('./enhancedProgressLogger');

/**
 * Sistema per tracciare e loggare le comunicazioni A2A tra agenti
 */
class A2ALogger {
  constructor() {
    this.logs = new Map(); // threadId -> [a2aLogs]
  }
  
  /**
   * Logga una delegazione A2A 
   * @param {string} fromAgent - Agente che delega
   * @param {string} toAgent - Agente che riceve la delegazione
   * @param {string} operation - Operazione richiesta
   * @param {Object} details - Dettagli dell'operazione
   * @param {string} threadId - ID del thread
   */
  logDelegation(fromAgent, toAgent, operation, details = {}, threadId) {
    const log = createA2ALog(fromAgent, toAgent, 'delegation', {
      ...details,
      operation,
      threadId
    });
    
    this.addLog(threadId, log);
    console.log(`🤝 A2A: ${fromAgent} delegates "${operation}" to ${toAgent}`);
    
    // Emit enhanced progress event for A2A delegation
    enhancedProgressLogger.emitSubstep(threadId, {
      type: 'a2a_delegation',
      title: `${fromAgent} → ${toAgent}`,
      description: `Delegating ${operation}`,
      status: 'in_progress',
      details: {
        fromAgent,
        toAgent,
        operation,
        delegationType: 'task_handoff',
        ...details
      }
    });
    
    return log;
  }
  
  /**
   * Logga il completamento di un'operazione A2A
   * @param {string} fromAgent - Agente che ha completato l'operazione
   * @param {string} toAgent - Agente che ha ricevuto il risultato
   * @param {string} operation - Operazione completata
   * @param {Object} result - Risultato dell'operazione
   * @param {string} threadId - ID del thread
   */
  logCompletion(fromAgent, toAgent, operation, result = {}, threadId) {
    const log = createA2ALog(fromAgent, toAgent, 'response_return', {
      operation,
      success: result.success !== false,
      resultType: typeof result,
      threadId
    });
    
    this.addLog(threadId, log);
    console.log(`✅ A2A: ${fromAgent} returns "${operation}" results to ${toAgent}`);
    
    // Emit enhanced progress event for A2A completion
    enhancedProgressLogger.emitSubstep(threadId, {
      type: 'a2a_completion',
      title: `${fromAgent} → ${toAgent}`,
      description: `Completed ${operation}`,
      status: result.success !== false ? 'completed' : 'failed',
      details: {
        fromAgent,
        toAgent,
        operation,
        delegationType: 'result_return',
        success: result.success !== false,
        resultType: typeof result,
        ...result
      }
    });
    
    return log;
  }
  
  /**
   * Logga un'operazione specifica (schema discovery, query generation, etc.)
   * @param {string} fromAgent - Agente richiedente
   * @param {string} toAgent - Agente che esegue
   * @param {string} specificOperation - Operazione specifica
   * @param {Object} details - Dettagli
   * @param {string} threadId - ID del thread
   */
  logSpecificOperation(fromAgent, toAgent, specificOperation, details = {}, threadId) {
    const log = createA2ALog(fromAgent, toAgent, specificOperation, {
      ...details,
      threadId
    });
    
    this.addLog(threadId, log);
    console.log(`🔧 A2A: ${fromAgent} → ${toAgent} executing "${specificOperation}"`);
    
    // Emit enhanced progress event for specific A2A operation
    enhancedProgressLogger.emitSubstep(threadId, {
      type: 'a2a_operation',
      title: `${fromAgent} → ${toAgent}`,
      description: `Executing ${specificOperation}`,
      status: 'in_progress',
      details: {
        fromAgent,
        toAgent,
        operation: specificOperation,
        delegationType: 'specific_operation',
        ...details
      }
    });
    
    return log;
  }
  
  /**
   * Aggiunge un log alla collezione per thread
   */
  addLog(threadId, log) {
    if (!this.logs.has(threadId)) {
      this.logs.set(threadId, []);
    }
    this.logs.get(threadId).push(log);
  }
  
  /**
   * Ottiene tutti i log A2A per un thread
   * @param {string} threadId - ID del thread
   * @returns {Array} - Array di log A2A
   */
  getLogsForThread(threadId) {
    return this.logs.get(threadId) || [];
  }
  
  /**
   * Pulisce i log per un thread
   * @param {string} threadId - ID del thread
   */
  clearLogsForThread(threadId) {
    this.logs.delete(threadId);
  }
  
  /**
   * Ottiene statistiche sui log A2A
   * @param {string} threadId - ID del thread (opzionale)
   * @returns {Object} - Statistiche
   */
  getStats(threadId = null) {
    if (threadId) {
      const logs = this.getLogsForThread(threadId);
      return {
        total: logs.length,
        operations: logs.reduce((acc, log) => {
          acc[log.operation] = (acc[log.operation] || 0) + 1;
          return acc;
        }, {}),
        agents: [...new Set(logs.map(log => log.agent))]
      };
    }
    
    // Stats globali
    let totalLogs = 0;
    const allOperations = {};
    const allAgents = new Set();
    
    for (const [, logs] of this.logs) {
      totalLogs += logs.length;
      logs.forEach(log => {
        allOperations[log.operation] = (allOperations[log.operation] || 0) + 1;
        allAgents.add(log.agent);
      });
    }
    
    return {
      total: totalLogs,
      operations: allOperations,
      agents: [...allAgents],
      threads: this.logs.size
    };
  }
}

// Istanza globale del logger A2A
const a2aLogger = new A2ALogger();

module.exports = {
  A2ALogger,
  a2aLogger
};
