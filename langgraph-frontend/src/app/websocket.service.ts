import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WebsocketService {
  private websocket!: WebSocket;
  private messageSubject: Subject<string> = new Subject<string>();

  constructor() { }

  public connect(url: string): void {
    this.websocket = new WebSocket(url);

    this.websocket.onopen = (event) => {
      console.log('WebSocket connection opened:', event);
    };

    this.websocket.onmessage = (event) => {
      console.log('WebSocket message received:', event.data);
      this.messageSubject.next(event.data);
    };

    this.websocket.onerror = (event) => {
      console.error('WebSocket error:', event);
    };

    this.websocket.onclose = (event) => {
      console.log('WebSocket connection closed:', event);
      // Optionally, attempt to reconnect or notify the application
      // For example, you could emit a special message or try to reconnect:
      // this.messageSubject.next('DISCONNECTED');
      // setTimeout(() => this.connect(url), 3000); // Attempt to reconnect after 3 seconds
    };
  }

  public sendMessage(message: string): void {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(message);
      console.log('WebSocket message sent:', message);
    } else {
      console.error('WebSocket is not open. Message not sent:', message);
      // Optionally, queue the message or handle the error
    }
  }

  public getMessages(): Observable<string> {
    return this.messageSubject.asObservable();
  }
}
