#!/usr/bin/env pwsh

# Mauden MCP Server - Start All Services (PowerShell)
# Modernized version with dynamic server mode selection

param(
    [Parameter(Position=0)]
    [ValidateSet("rest", "mcp", "both", "help")]
    [string]$Mode = "",
    
    [switch]$Config,
    [switch]$Help
)

Write-Host "🚀 MAUDEN MCP SERVER LAUNCHER" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Function to show help
function Show-Help {
    Write-Host ""
    Write-Host "UTILIZZO:" -ForegroundColor Yellow
    Write-Host "  .\start-all.ps1 [modalità]" -ForegroundColor White
    Write-Host ""
    Write-Host "MODALITÀ DISPONIBILI:" -ForegroundColor Yellow
    Write-Host "  rest     - Solo server HTTP REST (porta 8080)" -ForegroundColor Green
    Write-Host "  mcp      - Solo server MCP JSON-RPC 2.0 (porta 5009)" -ForegroundColor Green
    Write-Host "  both     - Entrambi i server simultaneamente" -ForegroundColor Green
    Write-Host "  help     - Mostra questo aiuto" -ForegroundColor Green
    Write-Host ""
    Write-Host "OPZIONI:" -ForegroundColor Yellow
    Write-Host "  -Config  - Mostra la configurazione attuale" -ForegroundColor Green
    Write-Host "  -Help    - Mostra questo aiuto" -ForegroundColor Green
    Write-Host ""
    Write-Host "ESEMPI:" -ForegroundColor Yellow
    Write-Host "  .\start-all.ps1 rest" -ForegroundColor White
    Write-Host "  .\start-all.ps1 mcp" -ForegroundColor White
    Write-Host "  .\start-all.ps1 both" -ForegroundColor White
    Write-Host "  .\start-all.ps1 -Config" -ForegroundColor White
    Write-Host ""
    Write-Host "GESTIONE AVANZATA:" -ForegroundColor Yellow
    Write-Host "  npm run config           - Mostra configurazione" -ForegroundColor White
    Write-Host "  npm run start:rest       - Avvia solo REST" -ForegroundColor White  
    Write-Host "  npm run start:mcp        - Avvia solo MCP" -ForegroundColor White
    Write-Host "  npm run start:both       - Avvia entrambi" -ForegroundColor White
    Write-Host ""
}

# Show help if requested
if ($Help -or $Mode -eq "help") {
    Show-Help
    exit 0
}

# Show config if requested
if ($Config) {
    Write-Host "📊 Mostra configurazione server..." -ForegroundColor Blue
    if (Test-Path "server-config.json") {
        node server-manager.js config
    } else {
        Write-Host "❌ File server-config.json non trovato!" -ForegroundColor Red
        Write-Host "Esegui prima: npm start" -ForegroundColor Yellow
    }
    exit 0
}

# Check if Node.js is installed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js non trovato! Installa Node.js prima di continuare." -ForegroundColor Red
    Write-Host "Scarica da: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Check if Python is installed
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Python non trovato! Installa Python prima di continuare." -ForegroundColor Red
    Write-Host "Scarica da: https://python.org/" -ForegroundColor Yellow
    exit 1
}

# Check if npm dependencies are installed
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installazione dipendenze Node.js..." -ForegroundColor Blue
    try {
        npm install
        if ($LASTEXITCODE -ne 0) {
            throw "npm install fallito"
        }
        Write-Host "✅ Dipendenze Node.js installate con successo" -ForegroundColor Green
    }
    catch {
        Write-Host "❌ Errore nell'installazione delle dipendenze Node.js: $_" -ForegroundColor Red
        exit 1
    }
}

# Check if Python dependencies are installed
if (Test-Path "requirements.txt") {
    Write-Host "🐍 Verifica dipendenze Python..." -ForegroundColor Blue
    try {
        pip install -r requirements.txt --quiet
        Write-Host "✅ Dipendenze Python verificate" -ForegroundColor Green
    }
    catch {
        Write-Host "⚠️  Alcune dipendenze Python potrebbero non essere installate correttamente" -ForegroundColor Yellow
    }
}

# Create server-config.json if it doesn't exist
if (-not (Test-Path "server-config.json")) {
    Write-Host "⚙️  Creazione configurazione server predefinita..." -ForegroundColor Blue
    @"
{
  "serverMode": "both",
  "restServer": {
    "enabled": true,
    "port": 8080,
    "description": "Classic HTTP REST API server with /tools endpoint"
  },
  "mcpServer": {
    "enabled": true,
    "port": 5009,
    "description": "MCP-compliant JSON-RPC 2.0 server"
  },
  "defaultMode": "both",
  "allowModeSwitch": true
}
"@ | Out-File -FilePath "server-config.json" -Encoding UTF8
    Write-Host "✅ Configurazione server creata" -ForegroundColor Green
}

# Determine mode to use
$selectedMode = $Mode
if ([string]::IsNullOrEmpty($selectedMode)) {
    # Try to read from config
    if (Test-Path "server-config.json") {
        try {
            $config = Get-Content "server-config.json" | ConvertFrom-Json
            $selectedMode = $config.serverMode
            Write-Host "📋 Modalità dalla configurazione: $selectedMode" -ForegroundColor Blue
        }
        catch {
            $selectedMode = "both"
            Write-Host "⚠️  Errore nel leggere la configurazione, uso modalità: $selectedMode" -ForegroundColor Yellow
        }
    } else {
        $selectedMode = "both"
        Write-Host "📋 Uso modalità predefinita: $selectedMode" -ForegroundColor Blue
    }
}

Write-Host ""
Write-Host "🎯 Modalità selezionata: $($selectedMode.ToUpper())" -ForegroundColor Magenta

# Start servers based on selected mode
try {
    switch ($selectedMode.ToLower()) {
        "rest" {
            Write-Host "🌐 Avvio server REST..." -ForegroundColor Green
            node server-manager.js start rest
        }
        "mcp" {
            Write-Host "🔗 Avvio server MCP..." -ForegroundColor Green
            node server-manager.js start mcp
        }
        "both" {
            Write-Host "🚀 Avvio entrambi i server..." -ForegroundColor Green
            node server-manager.js start both
        }
        default {
            Write-Host "❌ Modalità '$selectedMode' non valida!" -ForegroundColor Red
            Write-Host ""
            Show-Help
            exit 1
        }
    }
}
catch {
    Write-Host "❌ Errore nell'avvio dei server: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "🔧 SUGGERIMENTI:" -ForegroundColor Yellow
    Write-Host "1. Verifica che le dipendenze siano installate: npm install" -ForegroundColor White
    Write-Host "2. Controlla che le porte non siano già in uso" -ForegroundColor White
    Write-Host "3. Verifica i log in: logs/server.log" -ForegroundColor White
    Write-Host "4. Prova: npm run config" -ForegroundColor White
    exit 1
}

Write-Host ""
Write-Host "🎉 Script completato!" -ForegroundColor Green
