// Enhanced Progress Logger - Sistema di logging migliorato per la visualizzazione timeline
// Questo sistema mantiene compatibilità completa con il sistema esistente

/**
 * Sistema di logging avanzato che crea una timeline simile a quella di ricerca mostrata nell'immagine
 * Supporta step gerarchici, sub-step, e una visualizzazione più ricca
 */
class EnhancedProgressLogger {
  constructor() {
    this.io = null;
    this.activeSteps = new Map(); // threadId -> active steps
    this.completedSteps = new Map(); // threadId -> completed steps 
    this.stepCounters = new Map(); // threadId -> step counter
  }

  /**
   * Inizializza il logger con l'istanza Socket.IO
   * @param {Object} io - Istanza di Socket.IO 
   */
  init(io) {
    this.io = io;
    console.log('🔧 Enhanced Progress Logger initialized');
  }

  /**
   * Avvia un nuovo step principale nella timeline
   * @param {string} threadId - ID del thread
   * @param {string} stepId - ID univoco dello step
   * @param {string} title - Titolo dello step (es. "Generating Search Queries")
   * @param {string} description - Descrizione opzionale
   * @param {string} language - Lingua per la traduzione
   */
  startStep(threadId, stepId, title, description = '', language = 'it') {
    if (!this.io) return;

    const stepData = {
      id: stepId,
      threadId,
      title,
      description,
      status: 'running',
      startTime: new Date().toISOString(),
      subSteps: [],
      language,
      stepNumber: this.getNextStepNumber(threadId)
    };

    // Memorizza lo step attivo
    if (!this.activeSteps.has(threadId)) {
      this.activeSteps.set(threadId, new Map());
    }
    this.activeSteps.get(threadId).set(stepId, stepData);

    // Emette l'evento
    this.io.emit('enhanced_progress_step', {
      type: 'step_start',
      data: stepData
    });

    console.log(`🚀 Enhanced Step Started: ${title} (${stepId})`);
  }

  /**
   * Aggiunge un sub-step all'interno di uno step principale
   * @param {string} threadId - ID del thread
   * @param {string} parentStepId - ID dello step padre
   * @param {string} subStepId - ID del sub-step
   * @param {string} message - Messaggio del sub-step
   * @param {string} status - Stato (info, success, error, warning)
   */
  addSubStep(threadId, parentStepId, subStepId, message, status = 'info') {
    if (!this.io) return;

    const activeSteps = this.activeSteps.get(threadId);
    if (!activeSteps || !activeSteps.has(parentStepId)) {
      console.warn(`⚠️ Parent step ${parentStepId} not found for thread ${threadId}`);
      return;
    }

    const parentStep = activeSteps.get(parentStepId);
    const subStep = {
      id: subStepId,
      message,
      status,
      timestamp: new Date().toISOString()
    };

    parentStep.subSteps.push(subStep);

    // Emette l'evento
    this.io.emit('enhanced_progress_step', {
      type: 'substep_add',
      data: {
        threadId,
        parentStepId,
        subStep
      }
    });

    console.log(`📋 Sub-step added to ${parentStepId}: ${message}`);
  }

  /**
   * Completa uno step principale
   * @param {string} threadId - ID del thread
   * @param {string} stepId - ID dello step
   * @param {string} status - Stato finale (success, error, warning)
   * @param {string} finalMessage - Messaggio finale opzionale
   */
  completeStep(threadId, stepId, status = 'success', finalMessage = '') {
    if (!this.io) return;

    const activeSteps = this.activeSteps.get(threadId);
    if (!activeSteps || !activeSteps.has(stepId)) {
      console.warn(`⚠️ Step ${stepId} not found for thread ${threadId}`);
      return;
    }

    const step = activeSteps.get(stepId);
    step.status = status;
    step.endTime = new Date().toISOString();
    step.finalMessage = finalMessage;

    // Sposta lo step ai completati
    if (!this.completedSteps.has(threadId)) {
      this.completedSteps.set(threadId, []);
    }
    this.completedSteps.get(threadId).push(step);
    
    // Rimuove dagli attivi
    activeSteps.delete(stepId);

    // Emette l'evento
    this.io.emit('enhanced_progress_step', {
      type: 'step_complete',
      data: step
    });

    console.log(`✅ Enhanced Step Completed: ${step.title} (${status})`);
  }

  /**
   * Aggiorna lo stato di uno step esistente
   * @param {string} threadId - ID del thread
   * @param {string} stepId - ID dello step
   * @param {Object} updates - Aggiornamenti da applicare
   */
  updateStep(threadId, stepId, updates) {
    if (!this.io) return;

    const activeSteps = this.activeSteps.get(threadId);
    if (!activeSteps || !activeSteps.has(stepId)) {
      console.warn(`⚠️ Step ${stepId} not found for thread ${threadId}`);
      return;
    }

    const step = activeSteps.get(stepId);
    Object.assign(step, updates);

    // Emette l'evento
    this.io.emit('enhanced_progress_step', {
      type: 'step_update',
      data: step
    });

    console.log(`🔄 Enhanced Step Updated: ${step.title}`);
  }

  /**
   * Pulisce tutti gli step per un thread
   * @param {string} threadId - ID del thread
   */
  clearSteps(threadId) {
    this.activeSteps.delete(threadId);
    this.completedSteps.delete(threadId);
    this.stepCounters.delete(threadId);
    console.log(`🧹 Enhanced Steps cleared for thread: ${threadId}`);
  }

  /**
   * Ottiene il prossimo numero di step per un thread
   * @param {string} threadId - ID del thread
   * @returns {number} - Numero progressivo dello step
   */
  getNextStepNumber(threadId) {
    if (!this.stepCounters.has(threadId)) {
      this.stepCounters.set(threadId, 0);
    }
    const current = this.stepCounters.get(threadId);
    this.stepCounters.set(threadId, current + 1);
    return current + 1;
  }

  /**
   * Ottiene tutti gli step (attivi e completati) per un thread
   * @param {string} threadId - ID del thread
   * @returns {Object} - Oggetto con step attivi e completati
   */
  getStepsForThread(threadId) {
    const active = Array.from((this.activeSteps.get(threadId) || new Map()).values());
    const completed = this.completedSteps.get(threadId) || [];
    
    return {
      active,
      completed,
      total: active.length + completed.length
    };
  }

  /**
   * Emette un substep direttamente nel thread corrente (usato per A2A interactions)
   * @param {string} threadId - ID del thread
   * @param {Object} subStepData - Dati completi del substep
   */
  emitSubstep(threadId, subStepData) {
    if (!this.io) return;

    // Crea un substep con timestamp
    const subStep = {
      id: subStepData.id || `substep-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      type: subStepData.type || 'info',
      title: subStepData.title || '',
      description: subStepData.description || '',
      message: subStepData.message || subStepData.description || '',
      status: subStepData.status || 'info',
      timestamp: new Date().toISOString(),
      details: subStepData.details || {}
    };

    // Trova uno step attivo per questo thread per aggiungere il substep
    const activeSteps = this.activeSteps.get(threadId);
    if (activeSteps && activeSteps.size > 0) {
      // Aggiunge al primo step attivo disponibile
      const firstActiveStep = Array.from(activeSteps.values())[0];
      firstActiveStep.subSteps.push(subStep);

      // Emette l'evento
      this.io.emit('enhanced_progress_step', {
        type: 'substep_add',
        data: {
          threadId,
          parentStepId: firstActiveStep.id,
          subStep
        }
      });

      console.log(`🔄 A2A substep emitted: ${subStep.title} - ${subStep.description}`);
    } else {
      console.warn(`⚠️ No active steps found for thread ${threadId} to add A2A substep`);
    }
  }

  // === METODI DI COMPATIBILITÀ CON IL SISTEMA ESISTENTE ===

  /**
   * Wrapper per mantenere compatibilità con emitProgress esistente
   * @param {Object} socket - Socket
   * @param {string} threadId - ID del thread
   * @param {string} step - Step name
   * @param {Object} details - Dettagli
   */
  emitProgressCompat(socket, threadId, step, details = {}) {
    // Mantiene la compatibilità emettendo l'evento esistente
    const progressEvent = {
      threadId,
      step,
      message: details.message || step,
      timestamp: new Date().toISOString(),
      agent: details.agent || 'system',
      userQuery: details.userQuery || '',
      language: details.language || 'it',
      details: details.details || {}
    };
    
    socket.emit('processing_progress', progressEvent);
    console.log(`📡 Compat Progress emitted: ${step} - ${progressEvent.message}`);
  }

  /**
   * Crea step automaticamente dal sistema esistente
   * @param {string} threadId - ID del thread
   * @param {string} step - Nome dello step esistente
   * @param {Object} details - Dettagli dello step
   */
  autoCreateStepFromExisting(threadId, step, details = {}) {
    // Mapping dai step esistenti a step migliorati
    const stepMappings = {
      'received': {
        title: 'Message Received',
        description: 'Processing incoming message'
      },
      'language_detection': {
        title: 'Language Detection',
        description: 'Detecting message language'
      },
      'orchestrator_start': {
        title: 'Orchestrator Started',
        description: 'Starting intelligent orchestrator'
      },
      'language_processing': {
        title: 'Language Processing', 
        description: 'Analyzing linguistic patterns'
      },
      'agent_routing': {
        title: 'Agent Selection',
        description: 'Selecting specialized agent'
      },
      'agent_executing': {
        title: 'Agent Execution',
        description: 'Processing request with selected agent'
      },
      'processing_complete': {
        title: 'Processing Complete',
        description: 'Request processing finished'
      }
    };

    const mapping = stepMappings[step];
    if (mapping) {
      const stepId = `${step}_${Date.now()}`;
      this.startStep(threadId, stepId, mapping.title, mapping.description, details.language || 'it');
      
      // Auto-completa dopo un delay (per simulare il processo)
      setTimeout(() => {
        this.completeStep(threadId, stepId, 'success');
      }, 1000);
    }
  }
}

// Istanza singleton
const enhancedProgressLogger = new EnhancedProgressLogger();

module.exports = {
  enhancedProgressLogger,
  EnhancedProgressLogger
};
