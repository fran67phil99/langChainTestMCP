import { Component, OnInit } from '@angular/core';
import { WebsocketService } from '../websocket.service';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent implements OnInit {
  messages: string[] = [];
  newMessage: string = '';

  constructor(private websocketService: WebsocketService) { }

  ngOnInit(): void {
    this.websocketService.connect('ws://localhost:8000/ws/angular-session');
    this.websocketService.getMessages().subscribe((message: string) => {
      this.messages.push(message);
    });
  }

  sendMessage(): void {
    if (this.newMessage.trim() !== '') {
      this.websocketService.sendMessage(this.newMessage);
      this.messages.push(`You: ${this.newMessage}`); // Display user's message immediately
      this.newMessage = '';
    }
  }
}
