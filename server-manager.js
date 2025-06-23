#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Command } = require('commander');

class ServerManager {
    constructor() {
        this.configPath = path.join(__dirname, 'server-config.json');
        this.mcpConfigPath = path.join(__dirname, 'mcp_servers_standard.json');
        this.loadConfig();
        this.loadMcpConfig();
        this.runningProcesses = new Map();
    }

    loadConfig() {
        try {
            const configData = fs.readFileSync(this.configPath, 'utf8');
            this.config = JSON.parse(configData);
        } catch (error) {
            console.log('📋 Creazione configurazione predefinita...');
            this.config = {
                serverMode: "both",
                restServer: {
                    enabled: true,
                    port: 8080,
                    description: "Classic HTTP REST API server with /tools endpoint"
                },
                mcpServer: {
                    enabled: true,
                    port: 5009,
                    description: "MCP-compliant JSON-RPC 2.0 server"
                },
                defaultMode: "both",
                allowModeSwitch: true
            };
            this.saveConfig();
        }
    }

    loadMcpConfig() {
        try {
            const mcpConfigData = fs.readFileSync(this.mcpConfigPath, 'utf8');
            this.mcpConfig = JSON.parse(mcpConfigData);
        } catch (error) {
            console.error('❌ Errore nel caricamento della configurazione MCP:', error.message);
            this.mcpConfig = { httpServers: [], mcpServers: {} };
        }
    }

    saveMcpConfig() {
        try {
            fs.writeFileSync(this.mcpConfigPath, JSON.stringify(this.mcpConfig, null, 2));
            console.log('✅ Configurazione MCP salvata con successo');
        } catch (error) {
            console.error('❌ Errore nel salvataggio della configurazione MCP:', error.message);
        }
    }

    saveConfig() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            console.log('✅ Configurazione salvata con successo');
        } catch (error) {
            console.error('❌ Errore nel salvataggio della configurazione:', error.message);
        }
    }    showConfig() {
        console.log('\n🔧 CONFIGURAZIONE ATTUALE:');
        console.log('==========================');
        console.log(`Modalità Server: ${this.config.serverMode}`);
        console.log(`Modalità Predefinita: ${this.config.defaultMode}`);
        console.log(`Cambio Modalità Consentito: ${this.config.allowModeSwitch ? 'Sì' : 'No'}`);
        
        console.log('\n📡 SERVER REST:');
        console.log(`  Abilitato: ${this.config.restServer.enabled ? 'Sì' : 'No'}`);
        console.log(`  Porta: ${this.config.restServer.port}`);
        console.log(`  Descrizione: ${this.config.restServer.description}`);
        
        console.log('\n🔗 SERVER MCP:');
        console.log(`  Abilitato: ${this.config.mcpServer.enabled ? 'Sì' : 'No'}`);
        console.log(`  Porta: ${this.config.mcpServer.port}`);
        console.log(`  Descrizione: ${this.config.mcpServer.description}`);
        
        // Mostra configurazione da mcp_servers_standard.json
        console.log('\n📋 CONFIGURAZIONE MCP SERVERS (da mcp_servers_standard.json):');
        
        // HTTP Servers
        if (this.mcpConfig.httpServers && this.mcpConfig.httpServers.length > 0) {
            console.log('\n🌐 HTTP SERVERS:');
            this.mcpConfig.httpServers.forEach(server => {
                const status = server.enabled ? '🟢 Abilitato' : '🔴 Disabilitato';
                console.log(`  • ${server.name || server.id}: ${status}`);
                console.log(`    URL: ${server.url}`);
                if (server.tools_endpoint) {
                    console.log(`    Tools Endpoint: ${server.tools_endpoint}`);
                }
                console.log(`    Descrizione: ${server.description || 'N/A'}`);
            });
        }
        
        // MCP Servers (STDIO)
        if (this.mcpConfig.mcpServers && Object.keys(this.mcpConfig.mcpServers).length > 0) {
            console.log('\n🔌 MCP SERVERS (STDIO):');
            Object.entries(this.mcpConfig.mcpServers).forEach(([name, server]) => {
                const status = server.enabled ? '🟢 Abilitato' : '🔴 Disabilitato';
                console.log(`  • ${name}: ${status}`);
                console.log(`    Comando: ${server.command} ${server.args.join(' ')}`);
                console.log(`    Descrizione: ${server.description || 'N/A'}`);
            });
        }
        
        console.log('\n📚 DOCUMENTAZIONE:');
        Object.entries(this.config.documentation || {}).forEach(([key, value]) => {
            console.log(`  ${key.toUpperCase()}: ${value}`);
        });
    }    async startRestServer() {
        if (!this.config.restServer.enabled) {
            console.log('⚠️  Server REST disabilitato nella configurazione');
            return;
        }

        // Cerca il server REST nella configurazione MCP
        const restServer = this.mcpConfig.httpServers.find(server => 
            server.url && server.url.includes(':8080')
        );

        if (restServer && !restServer.enabled) {
            console.log('⚠️  Server REST disabilitato in mcp_servers_standard.json');
            console.log('💡 Abilitalo con: node server-manager.js enable-mcp-server mauden_server');
            return;
        }

        console.log('🚀 Avvio del server REST...');
        const pythonProcess = spawn('python', ['main_api.py'], {
            stdio: 'pipe',
            cwd: __dirname
        });

        this.runningProcesses.set('rest', pythonProcess);

        pythonProcess.stdout.on('data', (data) => {
            console.log(`[REST] ${data.toString().trim()}`);
        });

        pythonProcess.stderr.on('data', (data) => {
            console.error(`[REST ERROR] ${data.toString().trim()}`);
        });

        pythonProcess.on('close', (code) => {
            console.log(`🔴 Server REST terminato con codice ${code}`);
            this.runningProcesses.delete('rest');
        });

        console.log(`✅ Server REST avviato sulla porta ${this.config.restServer.port}`);
        
        if (restServer) {
            console.log(`📡 Configurazione MCP:`);
            console.log(`   Nome: ${restServer.name}`);
            console.log(`   URL: ${restServer.url}`);
            console.log(`   Tools Endpoint: ${restServer.tools_endpoint}`);
        }
    }

    async startMcpServer() {
        if (!this.config.mcpServer.enabled) {
            console.log('⚠️  Server MCP disabilitato nella configurazione');
            return;
        }

        // Cerca il server MCP nella configurazione
        const mcpServer = this.mcpConfig.httpServers.find(server => 
            server.url && server.url.includes(':5009')
        );

        if (mcpServer && !mcpServer.enabled) {
            console.log('⚠️  Server MCP disabilitato in mcp_servers_standard.json');
            console.log('� Abilitalo con: node server-manager.js enable-mcp-server mauden_sql_server');
            return;
        }

        console.log('�🚀 Avvio del server MCP (JSON-RPC 2.0)...');
        
        // Verifica se esiste il server MCP specifico
        if (fs.existsSync(path.join(__dirname, 'nuovo-mcp-server'))) {
            const nodeProcess = spawn('node', ['nuovo-mcp-server/src/server.js'], {
                stdio: 'pipe',
                cwd: __dirname
            });

            this.runningProcesses.set('mcp', nodeProcess);

            nodeProcess.stdout.on('data', (data) => {
                console.log(`[MCP] ${data.toString().trim()}`);
            });

            nodeProcess.stderr.on('data', (data) => {
                console.error(`[MCP ERROR] ${data.toString().trim()}`);
            });

            nodeProcess.on('close', (code) => {
                console.log(`🔴 Server MCP terminato con codice ${code}`);
                this.runningProcesses.delete('mcp');
            });
        } else {
            console.log('⚠️  Directory nuovo-mcp-server non trovata');
            console.log('💡 Il server MCP sarà disponibile tramite la configurazione HTTP');
        }

        console.log(`✅ Server MCP configurato sulla porta ${this.config.mcpServer.port}`);
        
        if (mcpServer) {
            console.log(`🔗 Configurazione MCP:`);
            console.log(`   Nome: ${mcpServer.name}`);
            console.log(`   URL: ${mcpServer.url}`);
            console.log(`   Descrizione: ${mcpServer.description}`);
        }
    }

    async startBothServers() {
        console.log('🚀 Avvio di entrambi i server...');
        await Promise.all([
            this.startRestServer(),
            this.startMcpServer()
        ]);
    }

    async startServer(mode = null) {
        const serverMode = mode || this.config.serverMode;
        
        console.log(`\n🎯 Modalità selezionata: ${serverMode.toUpperCase()}`);
        
        switch (serverMode.toLowerCase()) {
            case 'rest':
                await this.startRestServer();
                break;
            case 'mcp':
                await this.startMcpServer();
                break;
            case 'both':
                await this.startBothServers();
                break;
            default:
                console.error(`❌ Modalità '${serverMode}' non valida. Usa: rest, mcp, both`);
                process.exit(1);
        }

        // Gestione graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n🛑 Interruzione richiesta...');
            this.stopAllServers();
        });

        process.on('SIGTERM', () => {
            console.log('\n🛑 Terminazione richiesta...');
            this.stopAllServers();
        });
    }

    stopAllServers() {
        console.log('🔴 Arresto di tutti i server...');
        this.runningProcesses.forEach((process, name) => {
            console.log(`  Arresto ${name}...`);
            process.kill('SIGTERM');
        });
        this.runningProcesses.clear();
        console.log('✅ Tutti i server sono stati arrestati');
        process.exit(0);
    }

    setMode(mode) {
        const validModes = ['rest', 'mcp', 'both'];
        if (!validModes.includes(mode.toLowerCase())) {
            console.error(`❌ Modalità '${mode}' non valida. Modalità disponibili: ${validModes.join(', ')}`);
            return;
        }

        this.config.serverMode = mode.toLowerCase();
        this.saveConfig();
        console.log(`✅ Modalità server impostata su: ${mode.toLowerCase()}`);
    }    toggleServer(serverType, enabled) {
        if (serverType === 'rest') {
            this.config.restServer.enabled = enabled;
        } else if (serverType === 'mcp') {
            this.config.mcpServer.enabled = enabled;
        } else {
            console.error(`❌ Tipo server '${serverType}' non valido. Usa: rest, mcp`);
            return;
        }

        this.saveConfig();
        console.log(`✅ Server ${serverType.toUpperCase()} ${enabled ? 'abilitato' : 'disabilitato'}`);
    }

    enableMcpServer(serverId) {
        // Abilita server HTTP
        const httpServer = this.mcpConfig.httpServers.find(server => server.id === serverId);
        if (httpServer) {
            httpServer.enabled = true;
            this.saveMcpConfig();
            console.log(`✅ HTTP Server '${httpServer.name || serverId}' abilitato`);
            return;
        }

        // Abilita server MCP STDIO
        const mcpServer = this.mcpConfig.mcpServers[serverId];
        if (mcpServer) {
            mcpServer.enabled = true;
            this.saveMcpConfig();
            console.log(`✅ MCP Server '${serverId}' abilitato`);
            return;
        }

        console.error(`❌ Server '${serverId}' non trovato in mcp_servers_standard.json`);
    }

    disableMcpServer(serverId) {
        // Disabilita server HTTP
        const httpServer = this.mcpConfig.httpServers.find(server => server.id === serverId);
        if (httpServer) {
            httpServer.enabled = false;
            this.saveMcpConfig();
            console.log(`🔴 HTTP Server '${httpServer.name || serverId}' disabilitato`);
            return;
        }

        // Disabilita server MCP STDIO
        const mcpServer = this.mcpConfig.mcpServers[serverId];
        if (mcpServer) {
            mcpServer.enabled = false;
            this.saveMcpConfig();
            console.log(`🔴 MCP Server '${serverId}' disabilitato`);
            return;
        }

        console.error(`❌ Server '${serverId}' non trovato in mcp_servers_standard.json`);
    }

    listMcpServers() {
        console.log('\n📋 LISTA MCP SERVERS');
        console.log('=====================');
        
        if (this.mcpConfig.httpServers && this.mcpConfig.httpServers.length > 0) {
            console.log('\n🌐 HTTP SERVERS:');
            this.mcpConfig.httpServers.forEach(server => {
                const status = server.enabled ? '🟢' : '🔴';
                console.log(`  ${status} ${server.id}: ${server.name || 'N/A'}`);
                console.log(`     URL: ${server.url}`);
                console.log(`     Descrizione: ${server.description || 'N/A'}`);
            });
        }

        if (this.mcpConfig.mcpServers && Object.keys(this.mcpConfig.mcpServers).length > 0) {
            console.log('\n🔌 MCP SERVERS (STDIO):');
            Object.entries(this.mcpConfig.mcpServers).forEach(([name, server]) => {
                const status = server.enabled ? '🟢' : '🔴';
                console.log(`  ${status} ${name}`);
                console.log(`     Comando: ${server.command} ${server.args.join(' ')}`);
                console.log(`     Descrizione: ${server.description || 'N/A'}`);
            });
        }
    }    showHelp() {
        console.log(`
🔧 MAUDEN SERVER MANAGER
========================

Gestisci dinamicamente i server REST e MCP-compliant.

COMANDI PRINCIPALI:
  start [modalità]     Avvia i server (modalità: rest, mcp, both)
  config               Mostra la configurazione attuale
  set-mode <modalità>  Imposta la modalità del server
  enable <tipo>        Abilita un server (tipo: rest, mcp)
  disable <tipo>       Disabilita un server (tipo: rest, mcp)
  help                 Mostra questo aiuto

COMANDI MCP:
  list-mcp             Lista tutti i server MCP configurati
  enable-mcp <id>      Abilita un server MCP specifico
  disable-mcp <id>     Disabilita un server MCP specifico

MODALITÀ DISPONIBILI:
  rest                 Solo server HTTP REST (porta ${this.config.restServer.port})
  mcp                  Solo server MCP JSON-RPC 2.0 (porta ${this.config.mcpServer.port})
  both                 Entrambi i server contemporaneamente

ESEMPI:
  node server-manager.js start rest
  node server-manager.js start mcp
  node server-manager.js start both
  node server-manager.js set-mode both
  node server-manager.js enable rest
  node server-manager.js disable mcp
  node server-manager.js list-mcp
  node server-manager.js enable-mcp mauden_server
  node server-manager.js disable-mcp mauden_sql_server

CONFIGURAZIONE:
  • server-config.json - Configurazione modalità server
  • mcp_servers_standard.json - Configurazione server MCP (usata dall'applicativo)
        `);
    }
}

// Setup CLI
const program = new Command();
const manager = new ServerManager();

program
    .name('server-manager')
    .description('Gestore dinamico per server REST e MCP-compliant')
    .version('1.0.0');

program
    .command('start')
    .description('Avvia i server')
    .argument('[mode]', 'Modalità del server (rest, mcp, both)')
    .action((mode) => {
        manager.startServer(mode);
    });

program
    .command('config')
    .description('Mostra la configurazione attuale')
    .action(() => {
        manager.showConfig();
    });

program
    .command('set-mode')
    .description('Imposta la modalità del server')
    .argument('<mode>', 'Modalità (rest, mcp, both)')
    .action((mode) => {
        manager.setMode(mode);
    });

program
    .command('enable')
    .description('Abilita un server')
    .argument('<type>', 'Tipo di server (rest, mcp)')
    .action((type) => {
        manager.toggleServer(type, true);
    });

program
    .command('disable')
    .description('Disabilita un server')
    .argument('<type>', 'Tipo di server (rest, mcp)')
    .action((type) => {
        manager.toggleServer(type, false);
    });

program
    .command('list-mcp')
    .description('Lista tutti i server MCP configurati')
    .action(() => {
        manager.listMcpServers();
    });

program
    .command('enable-mcp')
    .description('Abilita un server MCP specifico')
    .argument('<id>', 'ID del server MCP')
    .action((id) => {
        manager.enableMcpServer(id);
    });

program
    .command('disable-mcp')
    .description('Disabilita un server MCP specifico')
    .argument('<id>', 'ID del server MCP')
    .action((id) => {
        manager.disableMcpServer(id);
    });

program
    .command('help')
    .description('Mostra aiuto dettagliato')
    .action(() => {
        manager.showHelp();
    });

// Se non ci sono argomenti, mostra l'aiuto
if (process.argv.length <= 2) {
    manager.showHelp();
} else {
    program.parse();
}
