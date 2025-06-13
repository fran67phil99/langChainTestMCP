# Script PowerShell per avviare tutti i server del progetto
Write-Host "🚀 Avvio di tutti i server del progetto LangGraph..." -ForegroundColor Green

# Verifica che le dipendenze siano installate
Write-Host "📦 Verificando dipendenze..." -ForegroundColor Yellow

# Controlla se Node.js è installato
if (!(Get-Command "node" -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js non trovato. Installa Node.js prima di continuare." -ForegroundColor Red
    exit 1
}

# Controlla se Python è installato
if (!(Get-Command "python" -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Python non trovato. Installa Python prima di continuare." -ForegroundColor Red
    exit 1
}

# Installa dipendenze Node.js se necessario
if (!(Test-Path "node_modules")) {
    Write-Host "📦 Installando dipendenze Node.js..." -ForegroundColor Yellow
    npm install
}

# Installa dipendenze Angular se necessario
if (!(Test-Path "langgraph-frontend/node_modules")) {
    Write-Host "📦 Installando dipendenze Angular..." -ForegroundColor Yellow
    Set-Location "langgraph-frontend"
    npm install
    Set-Location ".."
}

# Compila TypeScript
Write-Host "🔨 Compilando TypeScript..." -ForegroundColor Yellow
npm run build

# Avvia i server in parallelo
Write-Host "🚀 Avviando i server..." -ForegroundColor Green

# Avvia il server MCP Python (porta 8080)
Write-Host "📡 Avviando server MCP Python su porta 8080..." -ForegroundColor Blue
Start-Process -FilePath "python" -ArgumentList "main_api.py" -WindowStyle Normal

# Attendi 2 secondi per permettere al server MCP di avviarsi
Start-Sleep -Seconds 2

# Avvia il server Node.js (porta 8001)
Write-Host "🌐 Avviando server Node.js su porta 8001..." -ForegroundColor Blue
Start-Process -FilePath "node" -ArgumentList "dist/server.js" -WindowStyle Normal

# Attendi 2 secondi per permettere al server Node.js di avviarsi
Start-Sleep -Seconds 2

# Avvia il frontend Angular (porta 4200)
Write-Host "🎨 Avviando frontend Angular su porta 4200..." -ForegroundColor Blue
Set-Location "langgraph-frontend"
Start-Process -FilePath "cmd" -ArgumentList "/c", "ng serve --open" -WindowStyle Normal
Set-Location ".."

Write-Host ""
Write-Host "✅ Tutti i server sono stati avviati!" -ForegroundColor Green
Write-Host ""
Write-Host "📌 URL disponibili:" -ForegroundColor Cyan
Write-Host "   🐍 Server MCP Python:  http://localhost:8080" -ForegroundColor White
Write-Host "   🌐 Server Node.js:      http://localhost:8001" -ForegroundColor White
Write-Host "   🎨 Frontend Angular:    http://localhost:4200" -ForegroundColor White
Write-Host ""
Write-Host "🔗 Il frontend Angular si aprirà automaticamente nel browser." -ForegroundColor Yellow
Write-Host "💡 Usa Ctrl+C in ogni finestra per fermare i server." -ForegroundColor Yellow
