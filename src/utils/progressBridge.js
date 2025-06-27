// Progress Bridge - Bridge tra sistema esistente e nuovo sistema enhanced
// Questo modulo garantisce che il sistema esistente continui a funzionare
// mentre gradualmente introduce le nuove funzionalità

const { enhancedProgressLogger } = require('./enhancedProgressLogger');

/**
 * Bridge che unifica il vecchio sistema di progress con quello nuovo
 * Permette una transizione graduale senza rompere l'esistente
 */
class ProgressBridge {
  constructor() {
    this.io = null;
    this.enhancedMode = true; // Flag per abilitare/disabilitare il nuovo sistema - ABILITATO DI DEFAULT
    this.threadEnhancedMode = new Map(); // threadId -> boolean (per controllo per thread)
  }

  /**
   * Inizializza il bridge con Socket.IO
   * @param {Object} io - Istanza Socket.IO
   */
  init(io) {
    this.io = io;
    enhancedProgressLogger.init(io);
    console.log('🌉 Progress Bridge initialized');
  }

  /**
   * Abilita/disabilita il modo enhanced globalmente
   * @param {boolean} enabled - Se abilitare il modo enhanced
   */
  setEnhancedMode(enabled) {
    this.enhancedMode = enabled;
    console.log(`🔧 Enhanced mode ${enabled ? 'enabled' : 'disabled'} globally`);
  }

  /**
   * Abilita/disabilita il modo enhanced per uno specifico thread
   * @param {string} threadId - ID del thread
   * @param {boolean} enabled - Se abilitare il modo enhanced
   */
  setThreadEnhancedMode(threadId, enabled) {
    this.threadEnhancedMode.set(threadId, enabled);
    console.log(`🔧 Enhanced mode ${enabled ? 'enabled' : 'disabled'} for thread ${threadId}`);
  }

  /**
   * Verifica se il modo enhanced è attivo per un thread
   * @param {string} threadId - ID del thread
   * @returns {boolean}
   */
  isEnhancedModeActive(threadId) {
    // Prima controlla il setting per thread, poi quello globale
    if (this.threadEnhancedMode.has(threadId)) {
      return this.threadEnhancedMode.get(threadId);
    }
    return this.enhancedMode;
  }

  /**
   * Emette un evento di progress mantenendo compatibilità
   * Se enhanced mode è attivo, crea anche step avanzati
   * @param {Object} socket - Socket
   * @param {string} threadId - ID del thread  
   * @param {string} step - Nome dello step
   * @param {Object} details - Dettagli
   */
  async emitProgress(socket, threadId, step, details = {}) {
    // SEMPRE emette l'evento compatibile (per non rompere l'esistente)
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
    console.log(`📡 Bridge Progress: ${step} - ${progressEvent.message}`);

    // Se enhanced mode è attivo, crea anche gli step avanzati
    if (this.isEnhancedModeActive(threadId)) {
      this.createEnhancedStep(threadId, step, details);
    }
  }

  /**
   * Crea step enhanced basati sui step esistenti
   * @param {string} threadId - ID del thread
   * @param {string} step - Nome dello step esistente
   * @param {Object} details - Dettagli dello step
   */
  createEnhancedStep(threadId, step, details = {}) {
    // Mapping avanzato dai step esistenti a quelli enhanced
    const enhancedMappings = {
      'received': {
        title: 'Message Received',
        description: 'Processing incoming user message',
        icon: '📨',
        autoComplete: true,
        duration: 1500 // Increased duration to see the step better
      },
      'language_detection': {
        title: 'Language Detection',
        description: 'Analyzing message language and locale',
        icon: '🌍',
        subSteps: [
          { message: 'Scanning text patterns', status: 'info' },
          { message: 'Applying language models', status: 'info' },
          { message: 'Language detected', status: 'success' }
        ],
        autoComplete: true,
        duration: 800
      },
      'orchestrator_start': {
        title: 'Orchestrator Started',
        description: 'Initializing intelligent request orchestrator',
        icon: '🧠',
        subSteps: [
          { message: 'Loading orchestrator module', status: 'info' },
          { message: 'Analyzing request complexity', status: 'info' }
        ],
        autoComplete: true,
        duration: 600
      },
      'language_processing': {
        title: 'Language Processing',
        description: 'Deep linguistic analysis and understanding',
        icon: '📝',
        subSteps: [
          { message: 'Tokenizing message', status: 'info' },
          { message: 'Extracting semantic meaning', status: 'info' },
          { message: 'Context analysis complete', status: 'success' }
        ],
        autoComplete: true,
        duration: 700
      },
      'agent_routing': {
        title: 'Agent Selection',
        description: 'Selecting most appropriate specialized agent',
        icon: '🎯', 
        subSteps: [
          { message: 'Evaluating agent capabilities', status: 'info' },
          { message: 'Matching request to expertise', status: 'info' }
        ],
        duration: 1000 // Non auto-completa, aspetta agent_selected
      },
      'agent_selected': {
        title: 'Agent Selected',
        description: `Selected: ${details.agent || 'Specialized Agent'}`,
        icon: '✅',
        completes: 'agent_routing', // Completa lo step di routing
        autoComplete: true,
        duration: 300
      },
      'agent_executing': {
        title: 'Agent Execution', 
        description: 'Processing request with selected agent',
        icon: '⚙️',
        subSteps: [
          { message: 'Initializing agent', status: 'info' },
          { message: 'Processing request', status: 'info' }
        ],
        duration: 2000 // Più lungo, aspetta processing_complete
      },
      'processing_complete': {
        title: 'Processing Complete',
        description: 'Request processing finished successfully',
        icon: '🎉', 
        completes: 'agent_executing', // Completa l'esecuzione
        autoComplete: true,
        duration: 500
      }
    };

    const mapping = enhancedMappings[step];
    if (!mapping) return;

    const stepId = `${step}_${Date.now()}`;
    
    // Se questo step completa un altro step
    if (mapping.completes) {
      const activeSteps = enhancedProgressLogger.activeSteps.get(threadId);
      if (activeSteps) {
        // Trova lo step da completare
        for (const [activeStepId, activeStep] of activeSteps) {
          if (activeStepId.startsWith(mapping.completes)) {
            enhancedProgressLogger.completeStep(threadId, activeStepId, 'success');
            break;
          }
        }
      }
    }

    // Crea il nuovo step
    enhancedProgressLogger.startStep(
      threadId, 
      stepId, 
      mapping.title, 
      mapping.description,
      details.language || 'it'
    );

    // Aggiunge sub-step se specificati
    if (mapping.subSteps) {
      mapping.subSteps.forEach((subStep, index) => {
        setTimeout(() => {
          enhancedProgressLogger.addSubStep(
            threadId,
            stepId,
            `${stepId}_sub_${index}`,
            subStep.message,
            subStep.status || 'info'
          );
        }, index * 200); // Delay progressivo per i sub-step
      });
    }

    // Auto-completa se specificato
    if (mapping.autoComplete) {
      console.log(`⏰ Setting auto-completion for step ${stepId} in ${mapping.duration || 1000}ms`);
      setTimeout(() => {
        console.log(`✅ Auto-completing step ${stepId}`);
        enhancedProgressLogger.completeStep(threadId, stepId, 'success');
      }, mapping.duration || 1000);
    }
  }

  /**
   * Metodo per creare step manuali avanzati (per nuove funzionalità)
   * @param {string} threadId - ID del thread
   * @param {string} stepId - ID dello step
   * @param {string} title - Titolo dello step
   * @param {string} description - Descrizione
   * @param {string} language - Lingua
   */
  startEnhancedStep(threadId, stepId, title, description = '', language = 'it') {
    if (this.isEnhancedModeActive(threadId)) {
      enhancedProgressLogger.startStep(threadId, stepId, title, description, language);
    }
  }

  /**
   * Completa uno step enhanced manuale
   * @param {string} threadId - ID del thread
   * @param {string} stepId - ID dello step
   * @param {string} status - Stato finale
   * @param {string} finalMessage - Messaggio finale
   */
  completeEnhancedStep(threadId, stepId, status = 'success', finalMessage = '') {
    if (this.isEnhancedModeActive(threadId)) {
      enhancedProgressLogger.completeStep(threadId, stepId, status, finalMessage);
    }
  }

  /**
   * Aggiunge un sub-step a uno step enhanced
   * @param {string} threadId - ID del thread
   * @param {string} parentStepId - ID dello step padre
   * @param {string} subStepId - ID del sub-step
   * @param {string} message - Messaggio
   * @param {string} status - Stato
   */
  addEnhancedSubStep(threadId, parentStepId, subStepId, message, status = 'info') {
    if (this.isEnhancedModeActive(threadId)) {
      enhancedProgressLogger.addSubStep(threadId, parentStepId, subStepId, message, status);
    }
  }

  /**
   * Pulisce tutti gli step per un thread
   * @param {string} threadId - ID del thread
   */
  clearSteps(threadId) {
    enhancedProgressLogger.clearSteps(threadId);
    this.threadEnhancedMode.delete(threadId);
  }

  /**
   * Ottiene statistiche sui step per un thread
   * @param {string} threadId - ID del thread
   * @returns {Object}
   */
  getThreadStats(threadId) {
    const steps = enhancedProgressLogger.getStepsForThread(threadId);
    return {
      ...steps,
      enhancedModeActive: this.isEnhancedModeActive(threadId)
    };
  }
}

// Istanza singleton
const progressBridge = new ProgressBridge();

module.exports = {
  progressBridge,
  ProgressBridge
};
