# Mauden MCP System - Start All Services
# Questo script avvia il server API e il frontend Angular

Write-Host "🚀 MAUDEN MCP SYSTEM STARTUP" -ForegroundColor Green
Write-Host "============================" -ForegroundColor Green

# Funzione per controllare se una porta è in uso
function Test-Port {
    param([int]$Port)
    $connection = New-Object System.Net.NetworkInformation.TcpClient
    try {
        $connection.Connect("localhost", $Port)
        $connection.Close()
        return $true
    } catch {
        return $false
    }
}

# Controlla se il server API è già in esecuzione
if (Test-Port 3000) {
    Write-Host "⚠️  Server API già in esecuzione sulla porta 3000" -ForegroundColor Yellow
} else {
    Write-Host "🔧 Avvio Server API MCP..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; npm run api-server"
    Start-Sleep -Seconds 3
}

# Controlla se il frontend Angular è già in esecuzione
if (Test-Port 4200) {
    Write-Host "⚠️  Frontend Angular già in esecuzione sulla porta 4200" -ForegroundColor Yellow
} else {
    Write-Host "🎨 Avvio Frontend Angular..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\langgraph-frontend'; ng serve"
    Start-Sleep -Seconds 5
}

Write-Host ""
Write-Host "✅ SISTEMA AVVIATO!" -ForegroundColor Green
Write-Host "==================" -ForegroundColor Green
Write-Host "📡 Server API MCP: http://localhost:3000" -ForegroundColor White
Write-Host "   • Health Check: http://localhost:3000/health" -ForegroundColor Gray
Write-Host "   • Configurazione: http://localhost:3000/api/mcp/configuration" -ForegroundColor Gray
Write-Host ""
Write-Host "🎨 Frontend Angular: http://localhost:4200" -ForegroundColor White
Write-Host "   • MCP Manager: http://localhost:4200/mcp-manager" -ForegroundColor Gray
Write-Host ""
Write-Host "📋 Per arrestare i servizi, chiudi le finestre PowerShell aperte" -ForegroundColor Yellow
Write-Host ""

# Apri il browser
Write-Host "🌐 Apertura browser..." -ForegroundColor Cyan
Start-Sleep -Seconds 3
Start-Process "http://localhost:4200"

Write-Host "✨ Sistema pronto all'uso!" -ForegroundColor Green
