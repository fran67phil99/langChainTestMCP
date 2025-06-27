import { Component, OnInit, AfterViewChecked, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { WebsocketService } from '../websocket.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';

interface ChatMessage {
  content: string;
  isUser: boolean;
  timestamp: Date;
  htmlContent?: SafeHtml;
  id?: string;
  isProcessing?: boolean;
  progressStep?: string;
  progressPercentage?: number;
  progressLogs?: ProgressEvent[];
  showProcessLogs?: boolean;
  processLanguage?: string; // Per tradurre "Processo Elaborativo"
  enhancedSteps?: EnhancedProgressStep[]; // Nuovi step enhanced
  showEnhancedProgress?: boolean; // Controllo visualizzazione enhanced
  showEnhancedDetails?: boolean; // Controllo visualizzazione dettagli enhanced (default: true)
}

interface ProgressEvent {
  threadId: string;
  step: string;
  message: string;
  timestamp: string;
  agent?: string;
  userQuery?: string;
}

interface EnhancedProgressStep {
  id: string;
  threadId: string;
  title: string;
  description: string;
  status: 'running' | 'success' | 'error' | 'warning';
  startTime: string;
  endTime?: string;
  subSteps: EnhancedSubStep[];
  language: string;
  stepNumber: number;
  finalMessage?: string;
}

interface EnhancedSubStep {
  id: string;
  message: string;
  status: 'info' | 'success' | 'error' | 'warning' | 'in_progress' | 'completed' | 'failed';
  timestamp: string;
  type?: string;
  title?: string;
  description?: string;
  details?: {
    fromAgent?: string;
    toAgent?: string;
    operation?: string;
    delegationType?: string;
    [key: string]: any;
  };
}

interface EnhancedProgressEvent {
  type: 'step_start' | 'step_complete' | 'step_update' | 'substep_add';
  data: any;
}

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css'],
  standalone: false
})
export class ChatComponent implements OnInit, AfterViewChecked, AfterViewInit {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  
  messages: ChatMessage[] = [];
  newMessage: string = '';
  isConnected: boolean = false;
  isTyping: boolean = false;
  private hasConnectedOnce: boolean = false; // Flag per tracciare la prima connessione
    // Global progress tracking for current processing
  currentProcessingMessageId: string | null = null;
  
  // Enhanced progress tracking
  enhancedModeEnabled: boolean = true; // Abilitato di default
  currentEnhancedSteps: Map<string, EnhancedProgressStep> = new Map();
  
  // Auto-scroll control
  private shouldAutoScroll: boolean = true;
  private userInteracting: boolean = false;
  private shouldScrollOnComplete: boolean = false; // Nuovo flag per scrolling alla fine
  
  // Progress step queue for smooth display
  private progressQueue: ProgressEvent[] = [];
  private isProcessingQueue: boolean = false;
  private queueTimeout: any = null;
  
  private readonly progressSteps = [
    'received',
    'language_detection', 
    'orchestrator_start',
    'language_processing',
    'agent_routing',
    'agent_selected',
    'agent_executing',
    'processing_complete'
  ];

  constructor(
    private websocketService: WebsocketService,
    private sanitizer: DomSanitizer
  ) {
    // Configura marked per il parsing markdown
    marked.setOptions({
      breaks: true,
      gfm: true
    });
  }
  ngOnInit(): void {
    this.websocketService.connect('http://localhost:8001');
    
    this.websocketService.getConnectionStatus().subscribe(isConnected => {
      this.isConnected = isConnected;
      if (isConnected) {
        if (!this.hasConnectedOnce) {
          this.hasConnectedOnce = true;
          this.addMessage('Ciao! Sono il tuo assistente AI. Come posso aiutarti oggi?', false);
        }
      } else {
        // Mostra il messaggio di riconnessione solo se ci si era già connessi prima
        if (this.hasConnectedOnce) {
          this.addMessage('Connessione persa. Tentativo di riconnessione...', false);
        }
      }
    });    // Subscribe to regular messages
    this.websocketService.getMessages().subscribe(async (messageData) => {
      this.isTyping = false;
      
      // Complete processing for current message with translated logs support
      if (this.currentProcessingMessageId) {
        await this.completeProcessingMessage(this.currentProcessingMessageId, messageData);
      } else {
        // Handle system messages or errors when no processing message exists
        if (messageData.message) {
          await this.addMessage(messageData.message, false);
        } else if (messageData.error) {
          await this.addMessage(`❌ Errore: ${messageData.error}`, false);
        }
      }
    });

    // Subscribe to progress events
    this.websocketService.getProgressEvents().subscribe((progressEvent) => {
      this.handleProgressEvent(progressEvent);
    });

    // Subscribe to enhanced progress events
    this.websocketService.getEnhancedProgressEvents().subscribe((enhancedEvent) => {
      this.handleEnhancedProgressEvent(enhancedEvent);
    });

    // Subscribe to enhanced mode status
    this.websocketService.getEnhancedModeStatus().subscribe((enabled) => {
      this.enhancedModeEnabled = enabled;
      console.log('Enhanced mode status:', enabled);
    });
  }
  ngAfterViewInit(): void {
    // Aggiungi listener per lo scroll manuale
    if (this.messagesContainer) {
      this.messagesContainer.nativeElement.addEventListener('scroll', () => {
        this.onUserScroll();
      });
      
      // Aggiungi listener per clicchi nell'area messaggi per disabilitare auto-scroll temporaneamente
      this.messagesContainer.nativeElement.addEventListener('click', (event: Event) => {
        // Se l'utente clicca su elementi interattivi, disabilita auto-scroll
        const target = event.target as HTMLElement;
        if (target.closest('.process-header') || target.closest('.process-toggle')) {
          this.userInteracting = true;
          this.shouldAutoScroll = false;
          
          // Riabilita dopo un delay
          setTimeout(() => {
            this.userInteracting = false;
            this.checkIfShouldAutoScroll();
          }, 800);
        }
      });
    }
  }

  private onUserScroll(): void {
    if (!this.messagesContainer) return;
    
    const element = this.messagesContainer.nativeElement;
    const isAtBottom = element.scrollHeight - element.clientHeight <= element.scrollTop + 1;
    
    // Se l'utente scorre manualmente verso l'alto, disabilita auto-scroll
    if (!isAtBottom) {
      this.shouldAutoScroll = false;
    } else {
      // Se l'utente torna in fondo, riabilita auto-scroll
      this.shouldAutoScroll = true;
    }
  }  ngAfterViewChecked(): void {
    // Solo scroll automatico se:
    // 1. Non stiamo interagendo 
    // 2. Dovremmo fare auto-scroll
    // 3. NON c'è elaborazione in corso (nuovo controllo)
    // 4. È stato richiesto esplicitamente lo scroll alla fine
    if (this.shouldAutoScroll && !this.userInteracting && !this.isUserCurrentlyInteracting()) {
      // Se c'è un messaggio in elaborazione, NON fare scroll automatico
      if (this.currentProcessingMessageId && !this.shouldScrollOnComplete) {
        return; // Blocca lo scrolling durante l'elaborazione
      }
      
      // Se è stato richiesto scroll alla fine, eseguilo e reset del flag
      if (this.shouldScrollOnComplete) {
        this.scrollToBottom();
        this.shouldScrollOnComplete = false;
      } else if (!this.currentProcessingMessageId) {
        // Scroll normale solo se non c'è elaborazione in corso
        this.scrollToBottom();
      }
    }
  }

  private isUserCurrentlyInteracting(): boolean {
    // Controlla se ci sono elementi con focus o hover attivi che indicano interazione
    if (!this.messagesContainer) return false;
    
    const activeElement = document.activeElement;
    const hoveredElements = document.querySelectorAll(':hover');
    
    // Se c'è un elemento focusato o in hover nell'area messaggi, considera come interazione
    return Array.from(hoveredElements).some(el => 
      this.messagesContainer.nativeElement.contains(el) && 
      (el.classList.contains('process-header') || el.classList.contains('process-toggle'))
    );
  }

  async addMessage(content: string, isUser: boolean): Promise<void> {
    const messageId = this.generateMessageId();
    const message: ChatMessage = {
      id: messageId,
      content: content,
      isUser: isUser,
      timestamp: new Date(),
      isProcessing: false,
      progressLogs: [],
      showEnhancedDetails: true // Default: mostra i dettagli enhanced
    };

    if (!isUser) {
      // Processa il markdown per i messaggi dell'agente
      try {
        const htmlContent = await marked(content);
        message.htmlContent = this.sanitizer.bypassSecurityTrustHtml(htmlContent);
      } catch (error) {
        console.error('Errore nel parsing markdown:', error);
        message.htmlContent = this.sanitizer.bypassSecurityTrustHtml(content);
      }
    }

    this.messages.push(message);
  }

  private generateMessageId(): string {
    return 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }
  sendMessage(): void {
    if (this.newMessage.trim() !== '' && this.isConnected) {
      this.addMessage(this.newMessage, true);
      this.websocketService.sendMessage(this.newMessage);
      this.newMessage = '';
      this.isTyping = true;
      
      // Durante l'elaborazione, DISABILITA auto-scroll per evitare salti continui
      this.shouldAutoScroll = true; // Mantieni abilitato per quando finisce
      this.shouldScrollOnComplete = false; // Reset flag
      this.userInteracting = false;
      
      // Create placeholder message for AI response with processing state
      this.createProcessingMessage();
    }
  }

  // Enhanced Progress Control Methods
  toggleEnhancedMode(): void {
    const newMode = !this.enhancedModeEnabled;
    this.websocketService.setEnhancedMode(newMode);
    console.log('Toggling enhanced mode to:', newMode);
  }

  getEnhancedModeStatus(): boolean {
    return this.enhancedModeEnabled;
  }

  // Enhanced Progress Utility Methods
  getEnhancedStepIcon(status: string): string {
    switch (status) {
      case 'running': return '⏳';
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      default: return '📋';
    }
  }

  getEnhancedStepStatusClass(status: string): string {
    return `enhanced-step-${status}`;
  }

  getSubStepIcon(status: string): string {
    switch (status) {
      case 'info': return '📝';
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'in_progress': return '⏳';
      case 'completed': return '✅';
      case 'failed': return '❌';
      default: return '•';
    }
  }

  // A2A Interaction Detection and Display Methods
  isA2AInteraction(subStep: any): boolean {
    if (!subStep.details) return false;
    return subStep.type && (
      subStep.type === 'a2a_delegation' ||
      subStep.type === 'a2a_completion' ||
      subStep.type === 'a2a_operation'
    );
  }

  getSubStepClass(subStep: any): string {
    if (this.isA2AInteraction(subStep)) {
      return `substep-a2a substep-${subStep.type}`;
    }
    return `substep-${subStep.status || 'info'}`;
  }

  getA2ATypeLabel(delegationType: string | undefined): string {
    if (!delegationType) return '🔄 Interazione';
    
    const labels: { [key: string]: string } = {
      'task_handoff': '📤 Delega Task',
      'result_return': '📥 Ritorno Risultato',
      'specific_operation': '🔧 Operazione Specifica'
    };
    return labels[delegationType] || '🔄 Interazione';
  }

  private createProcessingMessage(): void {
    const messageId = this.generateMessageId();
    const processingMessage: ChatMessage = {
      id: messageId,
      content: '_Inizializzazione elaborazione..._',
      isUser: false,
      timestamp: new Date(),
      isProcessing: true,
      progressStep: 'Inizializzazione...',
      progressPercentage: 0,
      progressLogs: [],
      showProcessLogs: false,
      processLanguage: 'it', // Default, verrà aggiornato dall'agente di lingua
      showEnhancedDetails: true // Default: mostra i dettagli enhanced
    };
    
    // Set as HTML content in italics for processing with indicator
    processingMessage.htmlContent = this.sanitizer.bypassSecurityTrustHtml(
      '<em>Inizializzazione elaborazione...</em><span class="processing-indicator"></span>'
    );
    
    this.messages.push(processingMessage);
    this.currentProcessingMessageId = messageId;
  }  private async completeProcessingMessage(messageId: string, messageData: any): Promise<void> {
    const message = this.messages.find(msg => msg.id === messageId);
    if (!message || !message.isProcessing) return;

    // Clear the progress queue and stop processing when response arrives
    this.progressQueue = [];
    this.isProcessingQueue = false;
    if (this.queueTimeout) {
      clearTimeout(this.queueTimeout);
      this.queueTimeout = null;
    }

    // Get the actual response content
    const responseContent = messageData.response || messageData.message || 'Nessuna risposta disponibile';
    
    // Update message with final content
    message.isProcessing = false;
    message.content = responseContent;
    
    // FASE CRITICA: Usa i log tradotti se disponibili
    if (messageData.translatedLogs && Array.isArray(messageData.translatedLogs)) {
      console.log(`🌍 Using translated logs (${messageData.detectedLanguage}):`, messageData.translatedLogs.length);
      message.progressLogs = messageData.translatedLogs;
      message.processLanguage = messageData.detectedLanguage || 'it';
    }
    
    // Process markdown for the response
    try {
      const htmlContent = await marked(responseContent);
      message.htmlContent = this.sanitizer.bypassSecurityTrustHtml(htmlContent);
    } catch (error) {
      console.error('Errore nel parsing markdown:', error);
      message.htmlContent = this.sanitizer.bypassSecurityTrustHtml(responseContent);
    }
    
    console.log(`✅ Processing message completed. Language: ${message.processLanguage}, Logs: ${message.progressLogs?.length || 0}`);
    
    this.currentProcessingMessageId = null;
    
    // IMPORTANTE: Ora che il messaggio è completato, richiedi lo scroll finale
    this.shouldScrollOnComplete = true;
    
    // Forza un ciclo di rilevamento delle modifiche per attivare lo scroll
    setTimeout(() => {
      if (this.shouldAutoScroll && !this.userInteracting) {
        this.scrollToBottom();
        this.shouldScrollOnComplete = false;
      }
    }, 100);
  }
  private handleProgressEvent(progressEvent: ProgressEvent): void {
    console.log('Progress event received:', progressEvent);
    
    if (!this.currentProcessingMessageId) return;
    
    const processingMessage = this.messages.find(msg => 
      msg.id === this.currentProcessingMessageId && msg.isProcessing
    );
    
    if (processingMessage) {
      // Add to progress logs immediately
      processingMessage.progressLogs = processingMessage.progressLogs || [];
      processingMessage.progressLogs.push(progressEvent);
      
      // Add to queue for smooth display
      this.progressQueue.push(progressEvent);
      
      // Process the queue if not already processing
      if (!this.isProcessingQueue) {
        this.processProgressQueue();
      }
    }
  }

  private handleEnhancedProgressEvent(enhancedEvent: EnhancedProgressEvent): void {
    console.log('Enhanced progress event received:', enhancedEvent);
    
    if (!this.currentProcessingMessageId || !this.enhancedModeEnabled) return;
    
    const processingMessage = this.messages.find(msg => 
      msg.id === this.currentProcessingMessageId && msg.isProcessing
    );
    
    if (!processingMessage) return;
    
    // Initialize enhanced steps array if not exists
    processingMessage.enhancedSteps = processingMessage.enhancedSteps || [];
    processingMessage.showEnhancedProgress = true;
    
    switch (enhancedEvent.type) {
      case 'step_start':
        const newStep = enhancedEvent.data as EnhancedProgressStep;
        processingMessage.enhancedSteps.push(newStep);
        this.currentEnhancedSteps.set(newStep.id, newStep);
        break;
        
      case 'step_complete':
        const completedStep = enhancedEvent.data as EnhancedProgressStep;
        this.updateEnhancedStep(processingMessage, completedStep);
        this.currentEnhancedSteps.delete(completedStep.id);
        break;
        
      case 'step_update':
        const updatedStep = enhancedEvent.data as EnhancedProgressStep;
        this.updateEnhancedStep(processingMessage, updatedStep);
        this.currentEnhancedSteps.set(updatedStep.id, updatedStep);
        break;
        
      case 'substep_add':
        const { parentStepId, subStep } = enhancedEvent.data;
        this.addSubStepToEnhancedStep(processingMessage, parentStepId, subStep);
        break;
    }
    
    // Auto-scroll if needed
    setTimeout(() => this.scrollToBottom(), 100);
  }

  private updateEnhancedStep(message: ChatMessage, updatedStep: EnhancedProgressStep): void {
    if (!message.enhancedSteps) return;
    
    const index = message.enhancedSteps.findIndex(step => step.id === updatedStep.id);
    if (index !== -1) {
      message.enhancedSteps[index] = updatedStep;
    }
  }

  private addSubStepToEnhancedStep(message: ChatMessage, parentStepId: string, subStep: any): void {
    if (!message.enhancedSteps) return;
    
    const parentStep = message.enhancedSteps.find(step => step.id === parentStepId);
    if (parentStep) {
      parentStep.subSteps.push(subStep);
    }
  }

  private processProgressQueue(): void {
    if (this.progressQueue.length === 0 || !this.currentProcessingMessageId) {
      this.isProcessingQueue = false;
      return;
    }

    this.isProcessingQueue = true;
    const progressEvent = this.progressQueue.shift()!;
    
    const processingMessage = this.messages.find(msg => 
      msg.id === this.currentProcessingMessageId && msg.isProcessing
    );
    
    if (processingMessage) {
      // Update current progress step and show in italics
      processingMessage.progressStep = progressEvent.message;
      processingMessage.content = `_${progressEvent.message}_`;
      processingMessage.htmlContent = this.sanitizer.bypassSecurityTrustHtml(
        `<em>${progressEvent.message}</em><span class="processing-indicator"></span>`
      );
      
      // Calculate progress percentage based on step
      const stepIndex = this.progressSteps.indexOf(progressEvent.step);
      if (stepIndex !== -1) {
        processingMessage.progressPercentage = ((stepIndex + 1) / this.progressSteps.length) * 100;
      }
      
      // Detect language if available
      if (progressEvent.step === 'language_detection' && progressEvent.agent) {
        processingMessage.processLanguage = this.detectLanguageFromAgent(progressEvent);
      }
      
      // Schedule next step display (minimum 1 second)
      this.queueTimeout = setTimeout(() => {
        this.processProgressQueue();
      }, 1000);
    } else {
      this.isProcessingQueue = false;
    }
  }

  private detectLanguageFromAgent(progressEvent: ProgressEvent): string {
    // Logic to detect language from progress event
    // For now, default to Italian, but could be enhanced
    const message = progressEvent.message.toLowerCase();
    if (message.includes('english') || message.includes('inglese')) return 'en';
    if (message.includes('french') || message.includes('francese')) return 'fr';
    if (message.includes('spanish') || message.includes('spagnolo')) return 'es';
    return 'it'; // Default to Italian
  }

  getProcessTitle(language: string = 'it'): string {
    const titles: { [key: string]: string } = {
      'it': 'Processo Elaborativo',
      'en': 'Processing Details',
      'fr': 'Détails du Traitement',
      'es': 'Detalles del Procesamiento'
    };
    return titles[language] || titles['it'];
  }

  private stopProcessingForMessage(messageId: string): void {
    const message = this.messages.find(msg => msg.id === messageId);
    if (message && message.isProcessing) {
      // Remove the processing message as it will be replaced by the actual response
      const index = this.messages.findIndex(msg => msg.id === messageId);
      if (index !== -1) {
        this.messages.splice(index, 1);
      }
    }
    this.currentProcessingMessageId = null;
  }  toggleProcessLogs(message: ChatMessage): void {
    // Blocca completamente l'auto-scroll durante l'interazione
    this.shouldAutoScroll = false;
    this.userInteracting = true;
    
    message.showProcessLogs = !message.showProcessLogs;
    
    // Ripristina auto-scroll dopo un delay più lungo e solo se l'utente è in fondo
    setTimeout(() => {
      this.userInteracting = false;
      // Controlla se l'utente è ancora in fondo alla chat
      this.checkIfShouldAutoScroll();
    }, 500);
  }

  toggleEnhancedDetails(message: ChatMessage): void {
    // Blocca completamente l'auto-scroll durante l'interazione
    this.shouldAutoScroll = false;
    this.userInteracting = true;
    
    message.showEnhancedDetails = !message.showEnhancedDetails;
    
    // Ripristina auto-scroll dopo un delay più lungo e solo se l'utente è in fondo
    setTimeout(() => {
      this.userInteracting = false;
      this.checkIfShouldAutoScroll();
    }, 500);
  }

  private checkIfShouldAutoScroll(): void {
    if (!this.messagesContainer) return;
    
    const element = this.messagesContainer.nativeElement;
    const isAtBottom = element.scrollHeight - element.clientHeight <= element.scrollTop + 5;
    
    // Riabilita auto-scroll solo se l'utente è effettivamente in fondo
    if (isAtBottom) {
      this.shouldAutoScroll = true;
    }
  }

  // Utility methods for the template
  getProgressStepIcon(step: string): string {
    const stepIcons: { [key: string]: string } = {
      'received': '📨',
      'language_detection': '🌐',
      'orchestrator_start': '🚀',
      'language_processing': '🔍',
      'agent_routing': '🎯',
      'agent_selected': '🤖',
      'agent_executing': '⚙️',
      'processing_complete': '✅'
    };
    return stepIcons[step] || '⚡';
  }

  formatLogTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('it-IT', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  }
  getLogStepName(step: string): string {
    // Supporto multilingue per i nomi dei step
    const stepNames: { [key: string]: { [lang: string]: string } } = {
      'received': {
        'it': '📨 Ricevuto',
        'en': '📨 Received',
        'fr': '📨 Reçu',
        'es': '📨 Recibido',
        'de': '📨 Empfangen'
      },
      'language_detection': {
        'it': '🌐 Rilevamento Lingua',
        'en': '🌐 Language Detection',
        'fr': '🌐 Détection Langue',
        'es': '📨 Detección Idioma',
        'de': '🌐 Spracherkennung'
      },
      'orchestrator_start': {
        'it': '🚀 Avvio Orchestratore',
        'en': '🚀 Starting Orchestrator',
        'fr': '🚀 Démarrage Orchestrateur',
        'es': '🚀 Iniciando Orquestador',
        'de': '🚀 Orchestrator Start'
      },
      'language_processing': {
        'it': '🔍 Analisi Linguistica',
        'en': '🔍 Language Analysis',
        'fr': '🔍 Analyse Linguistique',
        'es': '🔍 Análisis Lingüístico',
        'de': '🔍 Sprachanalyse'
      },
      'agent_routing': {
        'it': '🎯 Selezione Agente',
        'en': '🎯 Agent Selection',
        'fr': '🎯 Sélection Agent',
        'es': '🎯 Selección Agente',
        'de': '🎯 Agenten-Auswahl'
      },
      'agent_selected': {
        'it': '🤖 Agente Selezionato',
        'en': '🤖 Agent Selected',
        'fr': '🤖 Agent Sélectionné',
        'es': '🤖 Agente Seleccionado',
        'de': '🤖 Agent Ausgewählt'
      },
      'agent_executing': {
        'it': '⚙️ Esecuzione Agente',
        'en': '⚙️ Agent Executing',
        'fr': '⚙️ Exécution Agent',
        'es': '⚙️ Ejecutando Agente',
        'de': '⚙️ Agent Ausführung'
      },
      'processing_complete': {
        'it': '✅ Elaborazione Completata',
        'en': '✅ Processing Complete',
        'fr': '✅ Traitement Terminé',
        'es': '✅ Procesamiento Completo',
        'de': '✅ Verarbeitung Abgeschlossen'
      },
      // A2A Operations
      'a2a_schema_discovery': {
        'it': '🔍 A2A: Scoperta Schema',
        'en': '🔍 A2A: Schema Discovery',
        'fr': '🔍 A2A: Découverte Schéma',
        'es': '🔍 A2A: Descubrimiento Esquema',
        'de': '🔍 A2A: Schema-Erkennung'
      },
      'a2a_query_generation': {
        'it': '📝 A2A: Generazione Query',
        'en': '📝 A2A: Query Generation',
        'fr': '📝 A2A: Génération Requête',
        'es': '📝 A2A: Generación Consulta',
        'de': '📝 A2A: Abfrage-Generierung'
      },
      'a2a_delegation': {
        'it': '↗️ A2A: Delegazione Task',
        'en': '↗️ A2A: Task Delegation',
        'fr': '↗️ A2A: Délégation Tâche',
        'es': '↗️ A2A: Delegación Tarea',
        'de': '↗️ A2A: Aufgaben-Delegation'
      },
      'a2a_response_return': {
        'it': '↩️ A2A: Ritorno Risultati',
        'en': '↩️ A2A: Results Return',
        'fr': '↩️ A2A: Retour Résultats',
        'es': '↩️ A2A: Retorno Resultados',
        'de': '↩️ A2A: Ergebnis-Rückgabe'
      }
    };
    
    // Usa la lingua del messaggio corrente se disponibile, altrimenti italiano
    const currentLanguage = 'it'; // Default, sarà sostituito dalla logica del messaggio
    
    return stepNames[step]?.[currentLanguage] || stepNames[step]?.['it'] || step;
  }

  onKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  private scrollToBottom(): void {
    try {
      if (this.messagesContainer) {
        this.messagesContainer.nativeElement.scrollTop = 
          this.messagesContainer.nativeElement.scrollHeight;
      }
    } catch(err) {}
  }

  formatTime(timestamp: Date): string {
    return timestamp.toLocaleTimeString('it-IT', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }

  formatEnhancedTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString('it-IT', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  }

  calculateStepDuration(step: EnhancedProgressStep): string {
    if (!step.endTime) return '';
    
    const start = new Date(step.startTime);
    const end = new Date(step.endTime);
    const duration = end.getTime() - start.getTime();
    
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(1)}s`;
  }

  trackByStepId(index: number, step: EnhancedProgressStep): string {
    return step.id;
  }
}
