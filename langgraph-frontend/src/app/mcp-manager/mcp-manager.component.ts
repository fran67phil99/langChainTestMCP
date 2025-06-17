import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

interface McpServer {
  id: string;
  name: string;
  type: 'http' | 'command';
  url?: string;
  tools_endpoint?: string;
  command?: string;
  args?: string[];
  enabled: boolean;
  timeout: number;
  quick_route_patterns: string[];
  description?: string;
}

@Component({
  selector: 'app-mcp-manager',
  standalone: false,
  templateUrl: './mcp-manager.component.html',
  styleUrl: './mcp-manager.component.css'
})
export class McpManagerComponent implements OnInit {
  servers: McpServer[] = [];
  showForm = false;
  editingServer: McpServer | null = null;
  currentServer: Partial<McpServer> = {};
  argsText = '';
  patternsText = '';
  testResults: any[] = [];

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadServers();
  }

  trackByServerId(index: number, server: McpServer): string {
    return server.id;
  }

  async loadServers() {
    try {
      this.servers = await this.http.get<McpServer[]>('/api/mcp/servers').toPromise() || [];
      console.log('📋 Loaded servers:', this.servers);
    } catch (error) {
      console.error('Errore caricamento server:', error);
      // Mock data per sviluppo
      this.servers = [
        {
          id: 'mauden_server',
          name: 'Mauden MCP Server',
          type: 'http',
          url: 'http://localhost:8080',
          enabled: true,
          timeout: 10000,
          quick_route_patterns: ['\\\\b(stagisti|dipendenti|mauden)\\\\b'],
          description: 'Server MCP principale per tools Mauden'
        }
      ];
    }
  }

  addNewServer() {
    this.currentServer = {
      type: 'http',
      enabled: true,
      timeout: 10000,
      quick_route_patterns: []
    };
    this.argsText = '';
    this.patternsText = '';
    this.editingServer = null;
    this.showForm = true;
  }

  editServer(server: McpServer) {
    this.currentServer = { ...server };
    this.argsText = server.args?.join('\n') || '';
    this.patternsText = server.quick_route_patterns.join('\n');
    this.editingServer = server;
    this.showForm = true;
  }

  cancelEdit() {
    this.showForm = false;
    this.editingServer = null;
    this.currentServer = {};
  }

  onServerTypeChange() {
    if (this.currentServer.type === 'http') {
      delete this.currentServer.command;
      delete this.currentServer.args;
    } else {
      delete this.currentServer.url;
      delete (this.currentServer as any).tools_endpoint;
    }
  }

  async saveServer() {
    const serverData = { ...this.currentServer };
    
    if (this.argsText) {
      serverData.args = this.argsText.split('\n').filter(arg => arg.trim());
    }
    
    if (this.patternsText) {
      serverData.quick_route_patterns = this.patternsText.split('\n').filter(p => p.trim());
    }

    if (!serverData.id) {
      serverData.id = `server_${Date.now()}`;
    }

    try {
      if (this.editingServer) {
        await this.http.put(`/api/mcp/servers/${this.editingServer.id}`, serverData).toPromise();
      } else {
        await this.http.post('/api/mcp/servers', serverData).toPromise();
      }

      await this.loadServers();
      this.cancelEdit();
    } catch (error) {
      console.error('Errore salvataggio server:', error);
    }
  }

  async toggleServer(server: McpServer) {
    try {
      await this.http.post(`/api/mcp/servers/${server.id}/toggle`, {}).toPromise();
      await this.loadServers();
    } catch (error) {
      console.error('Errore toggle server:', error);
    }
  }

  async deleteServer(serverId: string) {
    if (confirm('Sei sicuro di voler eliminare questo server?')) {
      try {
        await this.http.delete(`/api/mcp/servers/${serverId}`).toPromise();
        await this.loadServers();
      } catch (error) {
        console.error('Errore eliminazione server:', error);
      }
    }
  }

  async testAllServers() {
    this.testResults = [];
    
    for (const server of this.servers.filter(s => s.enabled)) {
      try {
        const result = await this.http.get<any>(`/api/mcp/servers/${server.id}/test`).toPromise();
        
        this.testResults.push({
          serverName: server.name,
          success: result?.success || false,
          error: result?.error
        });
      } catch (error) {
        this.testResults.push({
          serverName: server.name,
          success: false,
          error: (error as Error).message
        });
      }
    }
  }
}
