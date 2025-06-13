import { Injectable } from '@angular/core';
import { Subject, Observable, BehaviorSubject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

interface ChatMessage {
  message?: string;
  response?: string;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  private socket!: Socket;
  private messageSubject: Subject<ChatMessage> = new Subject<ChatMessage>();
  private connectionStatus: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
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
    });

    this.socket.on('agent_response', (data: ChatMessage) => {
      console.log('Agent response received:', data);
      this.messageSubject.next({ response: data.response });
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

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}
