import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';

interface McpServer {
  id?: string;
  name: string;
  type: 'http' | 'stdio';
  url?: string;
  tools_endpoint?: string;
  command?: string;
  args?: string[];
  enabled: boolean;
  timeout: number;
  description?: string;
  retry_attempts?: number;
  priority?: number;
}

interface HttpServer {
  id: string;
  name: string;
  url: string;
  tools_endpoint?: string;
  description?: string;
  enabled: boolean;
  timeout: number;
  retry_attempts?: number;
  priority?: number;
}

interface StdioServer {
  command: string;
  args: string[];
  enabled: boolean;
  timeout: number;
  description?: string;
}

interface McpConfiguration {
  mcpServers: { [key: string]: StdioServer };
  httpServers: HttpServer[];
  discovery: {
    enabled: boolean;
    timeout_per_server: number;
    max_concurrent_discoveries: number;
    cache_ttl_minutes: number;
    fallback_to_mock: boolean;
  };
}

interface ServerMode {
  serverMode: 'rest' | 'mcp' | 'both';
  restServer: {
    enabled: boolean;
    port: number;
    description: string;
  };
  mcpServer: {
    enabled: boolean;
    port: number;
    description: string;
  };
  defaultMode: string;
  allowModeSwitch: boolean;
}

@Component({
  selector: 'app-mcp-manager',
  standalone: false,
  templateUrl: './mcp-manager.component.html',
  styleUrl: './mcp-manager.component.css'
})
export class McpManagerComponent implements OnInit {
  // Configurazione completa MCP
  mcpConfiguration: McpConfiguration = {
    mcpServers: {},
    httpServers: [],
    discovery: {
      enabled: true,
      timeout_per_server: 10000,
      max_concurrent_discoveries: 3,
      cache_ttl_minutes: 5,
      fallback_to_mock: true
    }
  };
  
  // Configurazione modalità server
  serverMode: ServerMode = {
    serverMode: 'both',
    restServer: { enabled: true, port: 8080, description: '' },
    mcpServer: { enabled: true, port: 5009, description: '' },
    defaultMode: 'both',
    allowModeSwitch: true
  };

  // UI State
  showForm = false;
  showModeConfig = false;
  editingServer: McpServer | null = null;
  currentServer: Partial<McpServer> = {};
  argsText = '';
  testResults: any[] = [];
  
  // Vista unificata per l'UI
  servers: McpServer[] = [];

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadConfiguration();
  }

  trackByServerId(index: number, server: McpServer): string {
    return server.id || `server_${index}`;
  }  async loadConfiguration() {
    try {
      // Carica la configurazione MCP standard dal nuovo server API
      this.mcpConfiguration = await this.http.get<McpConfiguration>('http://localhost:3000/api/mcp/configuration').toPromise() || this.mcpConfiguration;
      
      // Carica la configurazione modalità server
      this.serverMode = await this.http.get<ServerMode>('http://localhost:3000/api/mcp/server-mode').toPromise() || this.serverMode;
      
      // Converti in formato unificato per l'UI
      this.buildUnifiedServerList();
      
      console.log('📋 Configurazione caricata:', {
        mcpConfig: this.mcpConfiguration,
        serverMode: this.serverMode,
        servers: this.servers
      });
    } catch (error) {
      console.error('Errore caricamento configurazione:', error);
      // Usa configurazione predefinita
      this.buildUnifiedServerList();
      alert('Errore nel caricamento della configurazione MCP. Assicurati che il server API sia avviato su http://localhost:3000');
    }
  }

  buildUnifiedServerList() {
    this.servers = [];
    
    // Aggiungi HTTP servers
    this.mcpConfiguration.httpServers.forEach(server => {
      this.servers.push({
        id: server.id,
        name: server.name,
        type: 'http',
        url: server.url,
        tools_endpoint: server.tools_endpoint,
        enabled: server.enabled,
        timeout: server.timeout,
        description: server.description,
        retry_attempts: server.retry_attempts,
        priority: server.priority
      });
    });
    
    // Aggiungi MCP STDIO servers
    Object.entries(this.mcpConfiguration.mcpServers).forEach(([name, server]) => {
      this.servers.push({
        id: name,
        name: name,
        type: 'stdio',
        command: server.command,
        args: server.args,
        enabled: server.enabled,
        timeout: server.timeout,
        description: server.description
      });
    });
  }  addNewServer() {
    this.currentServer = {
      type: 'http',
      enabled: true,
      timeout: 10000
    };
    this.argsText = '';
    this.editingServer = null;
    this.showForm = true;
  }

  editServer(server: McpServer) {
    this.currentServer = { ...server };
    this.argsText = server.args?.join('\n') || '';
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

    if (!serverData.id) {
      serverData.id = `server_${Date.now()}`;
    }

    try {
      const baseUrl = 'http://localhost:3000/api/mcp';
      
      if (serverData.type === 'http') {
        // Salva come HTTP server
        if (this.editingServer && this.editingServer.type === 'http') {
          await this.http.put(`${baseUrl}/http-servers/${this.editingServer.id}`, serverData).toPromise();
        } else {
          await this.http.post(`${baseUrl}/http-servers`, serverData).toPromise();
        }
      } else {
        // Salva come MCP STDIO server
        if (this.editingServer && this.editingServer.type === 'stdio') {
          await this.http.put(`${baseUrl}/stdio-servers/${this.editingServer.id}`, serverData).toPromise();
        } else {
          await this.http.post(`${baseUrl}/stdio-servers`, serverData).toPromise();
        }
      }

      await this.loadConfiguration();
      this.cancelEdit();
    } catch (error) {
      console.error('Errore salvataggio server:', error);
      alert('Errore nel salvataggio del server');
    }
  }
  async toggleServer(server: McpServer) {
    try {
      const baseUrl = 'http://localhost:3000/api/mcp';
      const endpoint = server.type === 'http' ? 'http-servers' : 'stdio-servers';
      await this.http.post(`${baseUrl}/${endpoint}/${server.id}/toggle`, {}).toPromise();
      await this.loadConfiguration();
    } catch (error) {
      console.error('Errore toggle server:', error);
      alert('Errore nel cambio stato del server');
    }
  }
  async deleteServer(serverId: string) {
    if (confirm('Sei sicuro di voler eliminare questo server?')) {
      try {
        const server = this.servers.find(s => s.id === serverId);
        if (!server) return;
        
        const baseUrl = 'http://localhost:3000/api/mcp';
        const endpoint = server.type === 'http' ? 'http-servers' : 'stdio-servers';
        await this.http.delete(`${baseUrl}/${endpoint}/${serverId}`).toPromise();
        await this.loadConfiguration();
      } catch (error) {
        console.error('Errore eliminazione server:', error);
        alert('Errore nell\'eliminazione del server');
      }
    }
  }

  // Gestione modalità server
  toggleModeConfig() {
    this.showModeConfig = !this.showModeConfig;
  }
  async updateServerMode(mode: 'rest' | 'mcp' | 'both') {
    try {
      await this.http.post('http://localhost:3000/api/mcp/server-mode', { mode }).toPromise();
      this.serverMode.serverMode = mode;
      alert(`Modalità server aggiornata a: ${mode}`);
    } catch (error) {
      console.error('Errore aggiornamento modalità:', error);
      alert('Errore nell\'aggiornamento della modalità server');
    }
  }

  async startServers(mode?: string) {
    try {
      const selectedMode = mode || this.serverMode.serverMode;
      await this.http.post('http://localhost:3000/api/mcp/start-servers', { mode: selectedMode }).toPromise();
      alert(`Server avviati in modalità: ${selectedMode}`);
    } catch (error) {
      console.error('Errore avvio server:', error);
      alert('Errore nell\'avvio dei server');
    }
  }

  async stopServers() {
    try {
      await this.http.post('http://localhost:3000/api/mcp/stop-servers', {}).toPromise();
      alert('Server arrestati con successo');
    } catch (error) {      console.error('Errore arresto server:', error);
      alert('Errore nell\'arresto dei server');
    }
  }

  async testAllServers() {
    this.testResults = [];
    
    for (const server of this.servers.filter(s => s.enabled)) {
      try {
        const baseUrl = 'http://localhost:3000/api/mcp';
        const endpoint = server.type === 'http' ? 'http-servers' : 'stdio-servers';
        const result = await this.http.get<any>(`${baseUrl}/${endpoint}/${server.id}/test`).toPromise();
        
        this.testResults.push({
          serverName: server.name,
          serverType: server.type,
          success: result?.success || false,
          error: result?.error,
          responseTime: result?.responseTime,
          protocol: result?.protocol || 'Unknown',
          tools: result?.tools || 0,
          toolsList: result?.toolsList || [],
          message: result?.message || '',
          warning: result?.warning || '',
          note: result?.note || ''
        });
      } catch (error) {
        this.testResults.push({
          serverName: server.name,
          serverType: server.type,
          success: false,
          error: (error as Error).message,
          protocol: 'Error',
          tools: 0
        });
      }
    }
  }

  getServersByType(type: 'http' | 'stdio') {
    return this.servers.filter(server => server.type === type);
  }
}
