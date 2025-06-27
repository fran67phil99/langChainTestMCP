import { Injectable } from '@angular/core';
import { Subject, Observable, BehaviorSubject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

interface ChatMessage {
  message?: string;
  response?: string;
  error?: string;
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
  status: 'info' | 'success' | 'error' | 'warning';
  timestamp: string;
}

interface EnhancedProgressEvent {
  type: 'step_start' | 'step_complete' | 'step_update' | 'substep_add';
  data: any;
}

interface ThreadStats {
  active: EnhancedProgressStep[];
  completed: EnhancedProgressStep[];
  total: number;
  enhancedModeActive: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  private socket!: Socket;
  private messageSubject: Subject<ChatMessage> = new Subject<ChatMessage>();
  private progressSubject: Subject<ProgressEvent> = new Subject<ProgressEvent>();
  private enhancedProgressSubject: Subject<EnhancedProgressEvent> = new Subject<EnhancedProgressEvent>();
  private connectionStatus: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private enhancedModeStatus: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private threadId: string = '';

  constructor() { 
    this.threadId = this.generateThreadId();
  }

  private generateThreadId(): string {
    return 'angular-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  }

  public connect(serverUrl: string = 'http://localhost:8001'): void {
    this.socket = io(serverUrl, {
      query: {
        threadId: this.threadId
      }
    });

    this.socket.on('connect', () => {
      console.log('Socket.IO connection opened with threadId:', this.threadId);
      this.connectionStatus.next(true);
    });

    this.socket.on('system_message', (data: ChatMessage) => {
      console.log('System message received:', data);
      this.messageSubject.next({ message: data.message });
    });    this.socket.on('agent_response', (data: ChatMessage) => {
      console.log('Agent response received:', data);
      this.messageSubject.next({ response: data.response });
    });

    this.socket.on('processing_progress', (data: ProgressEvent) => {
      console.log('Progress update received:', data);
      this.progressSubject.next(data);
    });

    this.socket.on('enhanced_progress_step', (data: EnhancedProgressEvent) => {
      console.log('Enhanced progress step received:', data);
      this.enhancedProgressSubject.next(data);
    });

    this.socket.on('enhanced_mode_changed', (data: any) => {
      console.log('Enhanced mode changed:', data);
      this.enhancedModeStatus.next(data.enabled);
    });

    this.socket.on('thread_stats', (data: any) => {
      console.log('Thread stats received:', data);
      // Emit as a special enhanced progress event
      this.enhancedProgressSubject.next({
        type: 'thread_stats' as any,
        data: data
      });
    });

    this.socket.on('error_message', (data: ChatMessage) => {
      console.error('Error message received:', data);
      this.messageSubject.next({ error: data.message });
    });

    this.socket.on('disconnect', () => {
      console.log('Socket.IO connection closed');
      this.connectionStatus.next(false);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error);
      this.connectionStatus.next(false);
    });
  }  public sendMessage(query: string): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('user_message', { 
        message: query, 
        threadId: this.threadId 
      });
      console.log('Socket.IO message sent:', query);
    } else {
      console.error('Socket.IO is not connected. Message not sent:', query);
      this.messageSubject.next({ error: 'Connessione non disponibile. Riprova.' });
    }
  }

  public getMessages(): Observable<ChatMessage> {
    return this.messageSubject.asObservable();
  }
  public getConnectionStatus(): Observable<boolean> {
    return this.connectionStatus.asObservable();
  }

  public getProgressEvents(): Observable<ProgressEvent> {
    return this.progressSubject.asObservable();
  }

  public getEnhancedProgressEvents(): Observable<EnhancedProgressEvent> {
    return this.enhancedProgressSubject.asObservable();
  }

  public getEnhancedModeStatus(): Observable<boolean> {
    return this.enhancedModeStatus.asObservable();
  }

  public setEnhancedMode(enabled: boolean, threadId?: string): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('set_enhanced_mode', { 
        threadId: threadId || this.threadId, 
        enabled 
      });
      console.log('Enhanced mode set:', enabled, 'for thread:', threadId || this.threadId);
    }
  }

  public getThreadStats(threadId?: string): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('get_thread_stats', { 
        threadId: threadId || this.threadId 
      });
    }
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}
