import { Component, OnInit, AfterViewChecked, ViewChild, ElementRef } from '@angular/core';
import { WebsocketService } from '../websocket.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';

interface ChatMessage {
  content: string;
  isUser: boolean;
  timestamp: Date;
  htmlContent?: SafeHtml;
}

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css'],
  standalone: false
})
export class ChatComponent implements OnInit, AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  
  messages: ChatMessage[] = [];
  newMessage: string = '';
  isConnected: boolean = false;
  isTyping: boolean = false;

  constructor(
    private websocketService: WebsocketService,
    private sanitizer: DomSanitizer
  ) {
    // Configura marked per il parsing markdown
    marked.setOptions({
      breaks: true,
      gfm: true
    });
  }  ngOnInit(): void {
    this.websocketService.connect('ws://localhost:8001/ws/angular-session');
    this.websocketService.getMessages().subscribe(async (message: string) => {
      this.isTyping = false;
      await this.addMessage(message, false);
    });

    // Aggiungi messaggio di benvenuto
    this.addMessage('Ciao! Sono il tuo assistente AI. Come posso aiutarti oggi?', false);
    this.isConnected = true;
  }

  ngAfterViewChecked(): void {
    this.scrollToBottom();
  }
  async addMessage(content: string, isUser: boolean): Promise<void> {
    const message: ChatMessage = {
      content: content,
      isUser: isUser,
      timestamp: new Date()
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

  sendMessage(): void {
    if (this.newMessage.trim() !== '' && this.isConnected) {
      this.addMessage(this.newMessage, true);
      this.websocketService.sendMessage(this.newMessage);
      this.newMessage = '';
      this.isTyping = true;
    }
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
}
