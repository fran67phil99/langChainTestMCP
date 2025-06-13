@echo off
echo 🚀 Avvio di tutti i server del progetto LangGraph...
echo.

:: Verifica che Node.js sia installato
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js non trovato. Installa Node.js prima di continuare.
    pause
    exit /b 1
)

:: Verifica che Python sia installato
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Python non trovato. Installa Python prima di continuare.
    pause
    exit /b 1
)

:: Installa dipendenze Node.js se necessario
if not exist "node_modules" (
    echo 📦 Installando dipendenze Node.js...
    call npm install
)

:: Installa dipendenze Angular se necessario
if not exist "langgraph-frontend\node_modules" (
    echo 📦 Installando dipendenze Angular...
    cd langgraph-frontend
    call npm install
    cd ..
)

:: Compila TypeScript
echo 🔨 Compilando TypeScript...
call npm run build

echo 🚀 Avviando i server...
echo.

:: Avvia il server MCP Python (porta 8080)
echo 📡 Avviando server MCP Python su porta 8080...
start "MCP Server" cmd /k "python main_api.py"

:: Attendi 3 secondi
timeout /t 3 /nobreak >nul

:: Avvia il server Node.js (porta 8001)
echo 🌐 Avviando server Node.js su porta 8001...
start "Node.js Server" cmd /k "node dist/server.js"

:: Attendi 3 secondi
timeout /t 3 /nobreak >nul

:: Avvia il frontend Angular (porta 4200)
echo 🎨 Avviando frontend Angular su porta 4200...
cd langgraph-frontend
start "Angular Frontend" cmd /k "ng serve --open"
cd ..

echo.
echo ✅ Tutti i server sono stati avviati!
echo.
echo 📌 URL disponibili:
echo    🐍 Server MCP Python:  http://localhost:8080
echo    🌐 Server Node.js:      http://localhost:8001
echo    🎨 Frontend Angular:    http://localhost:4200
echo.
echo 🔗 Il frontend Angular si aprirà automaticamente nel browser.
echo 💡 Chiudi le finestre dei server per fermarli.
echo.
pause
