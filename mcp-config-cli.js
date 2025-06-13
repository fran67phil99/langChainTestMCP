#!/usr/bin/env node

// MCP Configuration CLI - Gestisce la configurazione dei server MCP
const { mcpConfigManager } = require('./src/utils/mcpConfig');
const { Command } = require('commander');

const program = new Command();

program
  .name('mcp-config')
  .description('CLI to manage MCP server configuration')
  .version('1.0.0');

// Lista tutti i server configurati
program
  .command('list')
  .description('List all configured MCP servers')
  .option('-e, --enabled-only', 'Show only enabled servers')
  .action((options) => {
    const config = mcpConfigManager.loadConfig();
    let servers = config.servers;
    
    if (options.enabledOnly) {
      servers = servers.filter(s => s.enabled);
    }

    console.log('\n📋 MCP Servers Configuration:\n');
    
    if (servers.length === 0) {
      console.log('  No servers found');
      return;
    }

    servers.forEach(server => {
      const status = server.enabled ? '✅ Enabled' : '❌ Disabled';
      console.log(`  🔧 ${server.name} (${server.id})`);
      console.log(`     URL: ${server.url}${server.tools_endpoint || '/tools'}`);
      console.log(`     Status: ${status}`);
      console.log(`     Priority: ${server.priority || 1}`);
      console.log(`     Description: ${server.description || 'No description'}`);
      console.log('');
    });
  });

// Aggiunge un nuovo server
program
  .command('add')
  .description('Add a new MCP server')
  .requiredOption('-i, --id <id>', 'Unique server ID')
  .requiredOption('-n, --name <name>', 'Server name')
  .requiredOption('-u, --url <url>', 'Server URL')
  .option('-d, --description <desc>', 'Server description')
  .option('-e, --endpoint <endpoint>', 'Tools endpoint path', '/tools')
  .option('-t, --timeout <ms>', 'Request timeout in milliseconds', '10000')
  .option('-r, --retry <attempts>', 'Retry attempts', '3')
  .option('-p, --priority <num>', 'Server priority (lower = higher priority)', '1')
  .option('--disabled', 'Add server as disabled')
  .action((options) => {
    try {
      const serverConfig = {
        id: options.id,
        name: options.name,
        url: options.url,
        tools_endpoint: options.endpoint,
        description: options.description || `MCP Server: ${options.name}`,
        enabled: !options.disabled,
        timeout: parseInt(options.timeout),
        retry_attempts: parseInt(options.retry),
        priority: parseInt(options.priority)
      };

      mcpConfigManager.addServer(serverConfig);
      console.log(`✅ Successfully added MCP server: ${options.name} (${options.id})`);
    } catch (error) {
      console.error(`❌ Error adding server: ${error.message}`);
      process.exit(1);
    }
  });

// Rimuove un server
program
  .command('remove')
  .description('Remove an MCP server')
  .requiredOption('-i, --id <id>', 'Server ID to remove')
  .action((options) => {
    try {
      mcpConfigManager.removeServer(options.id);
      console.log(`✅ Successfully removed MCP server: ${options.id}`);
    } catch (error) {
      console.error(`❌ Error removing server: ${error.message}`);
      process.exit(1);
    }
  });

// Abilita/disabilita un server
program
  .command('toggle')
  .description('Enable or disable an MCP server')
  .requiredOption('-i, --id <id>', 'Server ID to toggle')
  .action((options) => {
    try {
      const config = mcpConfigManager.loadConfig();
      const server = config.servers.find(s => s.id === options.id);
      
      if (!server) {
        throw new Error(`Server with ID '${options.id}' not found`);
      }

      server.enabled = !server.enabled;
      mcpConfigManager.saveConfig();
      
      const status = server.enabled ? 'enabled' : 'disabled';
      console.log(`✅ Server '${server.name}' (${options.id}) is now ${status}`);
    } catch (error) {
      console.error(`❌ Error toggling server: ${error.message}`);
      process.exit(1);
    }
  });

// Testa la connessione a un server
program
  .command('test')
  .description('Test connection to MCP servers')
  .option('-i, --id <id>', 'Test specific server ID')
  .option('-a, --all', 'Test all enabled servers')
  .action(async (options) => {
    const { getAllMcpTools } = require('./src/utils/mcpUtils.commonjs');
    
    try {
      console.log('🧪 Testing MCP server connections...\n');
      
      if (options.id) {
        // Test specific server
        const config = mcpConfigManager.loadConfig();
        const server = config.servers.find(s => s.id === options.id);
        
        if (!server) {
          throw new Error(`Server with ID '${options.id}' not found`);
        }
        
        await testSingleServer(server);
      } else {
        // Test discovery process
        const tools = await getAllMcpTools();
        console.log(`🎯 Discovery completed: Found ${tools.length} tools total`);
        
        if (tools.length > 0) {
          console.log('\n📋 Available tools:');
          tools.forEach(tool => {
            console.log(`  🔧 ${tool.name} - ${tool.description}`);
          });
        }
      }
    } catch (error) {
      console.error(`❌ Test failed: ${error.message}`);
      process.exit(1);
    }
  });

// Ricarica la configurazione
program
  .command('reload')
  .description('Reload configuration from file')
  .action(() => {
    try {
      mcpConfigManager.reloadConfig();
      console.log('✅ Configuration reloaded successfully');
    } catch (error) {
      console.error(`❌ Error reloading configuration: ${error.message}`);
      process.exit(1);
    }
  });

// Mostra il percorso del file di configurazione
program
  .command('config-path')
  .description('Show configuration file path')
  .action(() => {
    console.log(`📁 Configuration file: ${mcpConfigManager.configPath}`);
  });

async function testSingleServer(server) {
  const axios = require('axios');
  
  console.log(`🔍 Testing: ${server.name} (${server.id})`);
  console.log(`   URL: ${server.url}${server.tools_endpoint || '/tools'}`);
  
  try {
    const startTime = Date.now();
    const response = await axios.get(
      `${server.url}${server.tools_endpoint || '/tools'}`,
      { 
        timeout: server.timeout || 10000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'MCP-Config-Test/1.0'
        }
      }
    );
    
    const duration = Date.now() - startTime;
    
    if (Array.isArray(response.data)) {
      console.log(`   ✅ Success (${duration}ms): Found ${response.data.length} tools`);
      response.data.forEach(tool => {
        console.log(`      🔧 ${tool.name}`);
      });
    } else {
      console.log(`   ⚠️ Warning (${duration}ms): Response is not an array`);
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log(`   ❌ Connection refused: Server not running`);
    } else if (error.code === 'ETIMEDOUT') {
      console.log(`   ❌ Timeout: Server didn't respond within ${server.timeout || 10000}ms`);
    } else {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
  console.log('');
}

program.parse();

// Aggiungi questo al package.json sotto "bin"
// "mcp-config": "./mcp-config-cli.js"
