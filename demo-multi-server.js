#!/usr/bin/env node

// Esempio pratico: Come aggiungere un nuovo server MCP
// Questo script mostra come configurare dinamicamente un nuovo server

const { mcpConfigManager } = require('./src/utils/mcpConfig');
const { getAllMcpTools } = require('./src/utils/mcpUtils.commonjs');

async function demoAddNewServer() {
  console.log('🚀 Demo: Aggiunta dinamica di un nuovo server MCP\n');

  // 1. Mostra configurazione attuale
  console.log('📋 Configurazione attuale:');
  const currentConfig = mcpConfigManager.loadConfig();
  currentConfig.servers.forEach(server => {
    const status = server.enabled ? '✅' : '❌';
    console.log(`  ${status} ${server.name} (${server.id}) - ${server.url}`);
  });
  console.log('');

  // 2. Aggiungi un nuovo server (esempio: Analytics Server)
  console.log('➕ Aggiungendo nuovo server Analytics...');
  try {
    const newServer = {
      id: 'analytics_server',
      name: 'Analytics MCP Server',
      url: 'http://localhost:8083',
      tools_endpoint: '/analytics/tools',
      description: 'Server per analytics e reportistica aziendale',
      priority: 3,
      timeout: 15000,
      retry_attempts: 2
    };

    mcpConfigManager.addServer(newServer);
    console.log('✅ Server aggiunto con successo!');
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('ℹ️ Server già esistente, continuo...');
    } else {
      console.error('❌ Errore durante aggiunta:', error.message);
      return;
    }
  }

  // 3. Mostra nuova configurazione
  console.log('\n📋 Nuova configurazione:');
  const newConfig = mcpConfigManager.reloadConfig();
  newConfig.servers.forEach(server => {
    const status = server.enabled ? '✅' : '❌';
    console.log(`  ${status} ${server.name} (${server.id}) - ${server.url}${server.tools_endpoint}`);
  });

  // 4. Testa il discovery con i nuovi server
  console.log('\n🔍 Testando discovery con tutti i server configurati...');
  try {
    const tools = await getAllMcpTools();
    console.log(`🎯 Discovery completato: trovati ${tools.length} tools totali`);
    
    // Raggruppa tools per server
    const toolsByServer = {};
    tools.forEach(tool => {
      const serverName = tool.serverName || 'Unknown';
      if (!toolsByServer[serverName]) {
        toolsByServer[serverName] = [];
      }
      toolsByServer[serverName].push(tool.name);
    });

    console.log('\n📊 Tools per server:');
    Object.keys(toolsByServer).forEach(serverName => {
      console.log(`  🏢 ${serverName}:`);
      toolsByServer[serverName].forEach(toolName => {
        console.log(`    🔧 ${toolName}`);
      });
    });

  } catch (error) {
    console.error('❌ Errore durante discovery:', error.message);
  }

  // 5. Esempio di come disabilitare un server
  console.log('\n🔧 Esempio: Disabilitazione server analytics (per demo)...');
  try {
    const config = mcpConfigManager.loadConfig();
    const analyticsServer = config.servers.find(s => s.id === 'analytics_server');
    if (analyticsServer) {
      analyticsServer.enabled = false;
      mcpConfigManager.saveConfig();
      console.log('✅ Server analytics disabilitato');
    }
  } catch (error) {
    console.error('❌ Errore durante disabilitazione:', error.message);
  }

  console.log('\n🎉 Demo completata! Il sistema supporta ora configurazione dinamica multi-server.');
  console.log('\n💡 Comandi utili:');
  console.log('  - node mcp-config-cli.js list                    # Lista server');
  console.log('  - node mcp-config-cli.js add --help              # Aggiungi server');
  console.log('  - node mcp-config-cli.js test --all              # Testa tutti i server');
  console.log('  - node mcp-config-cli.js toggle --id server_id   # Abilita/disabilita');
}

// Esegui la demo se il file è chiamato direttamente
if (require.main === module) {
  demoAddNewServer().catch(console.error);
}

module.exports = { demoAddNewServer };
