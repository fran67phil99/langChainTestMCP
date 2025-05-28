"""
MCP Utils - Connessione ai server MCP usando FastMCP
Implementazione basata su fastmcp per connessioni SSE stabili
"""

import asyncio
import os
import json
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
from langchain_core.tools import Tool

# Importazioni FastMCP
from fastmcp.client import Client as FastMCPClient

load_dotenv()

MCP_ENABLE_DISCOVERY = os.getenv("MCP_ENABLE_DISCOVERY", "true").lower() == "true"

def should_enable_mcp_discovery():
    """Controlla se il discovery MCP dovrebbe essere abilitato"""
    return MCP_ENABLE_DISCOVERY

class MCPToolsManager:
    """Gestisce la connessione e l'utilizzo degli strumenti MCP"""
    
    def __init__(self):
        self.server_url: str = "http://localhost:8080/sse"
        self.tools_cache: List[Tool] = []
        self.connected = False
        
    async def connect_and_test(self, server_url: str = "http://localhost:8080/sse") -> bool:
        """Testa la connessione al server MCP usando FastMCP context manager"""
        try:
            print(f"🔌 Test connessione al server MCP: {server_url}")
            self.server_url = server_url
            
            # Usa FastMCP Client come context manager
            async with FastMCPClient(server_url) as client:
                # Testa la connessione listando gli strumenti
                tools = await client.list_tools()
                print(f"✅ Connesso con successo! Trovati {len(tools)} strumenti")
                self.connected = True
                return True
                
        except Exception as e:
            print(f"❌ Errore durante la connessione al server MCP: {e}")
            self.connected = False
            return False
      
    async def load_mcp_servers_config(self) -> List[Dict[str, Any]]:
        """Carica la configurazione dei server MCP da file JSON"""
        config_path = os.path.join(os.path.dirname(__file__), "mcp_servers.json")
        
        if not os.path.exists(config_path):
            print(f"⚠️ File di configurazione MCP non trovato: {config_path}")
            return []
        
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
                servers = config.get('servers', [])
                print(f"📋 Caricati {len(servers)} server dalla configurazione")
                return servers
        except Exception as e:
            print(f"❌ Errore durante il caricamento della configurazione MCP: {e}")
            return []
    
    async def discover_tools_from_server(self) -> List[Tool]:
        """Recupera la lista degli strumenti dal server MCP usando context manager"""
        try:
            print(f"🔍 Recupero lista strumenti dal server MCP: {self.server_url}")
            
            # Usa FastMCP Client come context manager per ogni operazione
            async with FastMCPClient(self.server_url) as client:
                # Ottieni la lista degli strumenti
                mcp_tools = await client.list_tools()
                
                if not mcp_tools:
                    print("⚠️ Nessuno strumento trovato sul server MCP")
                    return []
                
                langchain_tools = []
                print(f"📦 Trovati {len(mcp_tools)} strumenti MCP")
                
                for tool_info in mcp_tools:
                    tool_name = tool_info.name
                    tool_description = tool_info.description or f'Strumento MCP: {tool_name}'
                    
                    print(f"  🔧 {tool_name}: {tool_description}")
                    
                    # Crea funzione wrapper per lo strumento MCP
                    def create_mcp_tool_function(name: str):
                        async def mcp_tool_wrapper(**kwargs) -> str:
                            try:
                                print(f"🔧 Esecuzione strumento MCP: {name} con args: {kwargs}")
                                
                                # Usa context manager per ogni chiamata allo strumento
                                async with FastMCPClient(self.server_url) as inner_client:
                                    # Chiama lo strumento con gli argomenti
                                    result = await inner_client.call_tool(name, kwargs)
                                    
                                    # Estrai il contenuto testuale dal risultato
                                    if result and len(result) > 0:
                                        if hasattr(result[0], 'text'):
                                            return result[0].text
                                        else:
                                            return str(result[0])
                                    else:
                                        return f"Strumento {name} eseguito con successo (nessun output)"
                                        
                            except Exception as e:
                                error_msg = f"Errore durante l'esecuzione dello strumento {name}: {str(e)}"
                                print(f"❌ {error_msg}")
                                return error_msg
                        
                        return mcp_tool_wrapper
                    
                    # Crea wrapper sincrono per LangChain
                    def create_sync_wrapper(async_func):
                        def sync_wrapper(**kwargs) -> str:
                            loop = asyncio.new_event_loop()
                            asyncio.set_event_loop(loop)
                            try:
                                return loop.run_until_complete(async_func(**kwargs))
                            finally:
                                loop.close()
                        return sync_wrapper
                    
                    # Crea il tool LangChain
                    mcp_tool_func = create_mcp_tool_function(tool_name)
                    sync_tool_func = create_sync_wrapper(mcp_tool_func)
                    
                    langchain_tool = Tool(
                        name=tool_name,
                        description=tool_description,
                        func=sync_tool_func
                    )
                    
                    langchain_tools.append(langchain_tool)
                
                self.tools_cache = langchain_tools
                print(f"✅ Creati {len(langchain_tools)} strumenti LangChain")
                return langchain_tools
                
        except Exception as e:
            print(f"❌ Errore durante il discovery degli strumenti MCP: {e}")
            return []# Istanza globale del manager
_mcp_manager = MCPToolsManager()

async def get_all_mcp_tools() -> List[Tool]:
    """
    Funzione principale per scoprire e caricare tutti gli strumenti MCP disponibili.
    Utilizza FastMCP per connessioni stabili e robuste.
    Restituisce una lista di oggetti Tool di Langchain.
    """
    if not should_enable_mcp_discovery():
        print("MCP discovery disabilitato tramite variabile d'ambiente MCP_ENABLE_DISCOVERY")
        return []
    
    print("🔍 Avvio discovery degli strumenti MCP con FastMCP...")
    
    try:
        # Prima testa la connessione
        success = await _mcp_manager.connect_and_test("http://localhost:8080/sse")
        if not success:
            print("❌ Impossibile connettersi al server MCP")
            return []
        
        # Poi recupera gli strumenti
        tools = await _mcp_manager.discover_tools_from_server()
        
        print(f"🎯 Totale strumenti MCP scoperti: {len(tools)}")
        for tool in tools:
            print(f"  🔧 {tool.name}: {tool.description}")
        
        return tools
        
    except Exception as e:
        print(f"❌ Errore durante il discovery MCP: {e}")
        return []

def get_mcp_tools_sync() -> List[Tool]:
    """Versione sincrona per compatibilità con codice non-async"""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(get_all_mcp_tools())
    finally:
        loop.close()

# Funzioni di utilità per compatibilità
def is_mcp_enabled() -> bool:
    """Verifica se MCP è abilitato"""
    return should_enable_mcp_discovery()

async def cleanup_mcp_connections():
    """Cleanup delle connessioni MCP"""
    # Non è necessario cleanup con FastMCP context manager
    pass

# Funzioni di compatibilità per mantenere l'interfaccia esistente
async def discover_mcp_servers():
    """Funzione di compatibilità - deprecata, usa get_all_mcp_tools()"""
    print("⚠️ discover_mcp_servers() è deprecata, usa get_all_mcp_tools()")
    servers_config = await _mcp_manager.load_mcp_servers_config()
    return [s.get('url', s.get('endpoint', '')) for s in servers_config if s.get('url') or s.get('endpoint')]

if __name__ == '__main__':
    # Esempio di utilizzo
    async def main():
        try:
            print("🚀 Test connessione MCP con FastMCP...")
            tools = await get_all_mcp_tools()
            
            if tools:
                print(f"\n✅ Successo! Trovati {len(tools)} strumenti MCP:")
                for i, tool in enumerate(tools, 1):
                    print(f"  {i}. {tool.name}: {tool.description}")
                
                # Test chiamata del primo strumento se disponibile
                if tools and len(tools) > 0:
                    first_tool = tools[0]
                    print(f"\n🧪 Test chiamata strumento: {first_tool.name}")
                    try:
                        # Prova a chiamare la funzione del tool
                        result = first_tool.func()
                        print(f"📋 Risultato: {result}")
                    except Exception as e:
                        print(f"❌ Errore durante test chiamata: {e}")
            else:
                print("❌ Nessuno strumento MCP trovato")
        
        finally:
            # Cleanup
            await cleanup_mcp_connections()
            print("🔌 Test completato")

    asyncio.run(main())
