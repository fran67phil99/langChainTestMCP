# Usa un'immagine Python ufficiale come base
FROM python:3.11-slim

# Imposta la directory di lavoro nel container
WORKDIR /app

# Copia il file delle dipendenze
COPY requirements.txt .

# Installa le dipendenze
# --no-cache-dir riduce la dimensione dell'immagine
# --trusted-host pypi.python.org è una buona pratica in alcuni ambienti di rete
RUN pip install --no-cache-dir --trusted-host pypi.python.org -r requirements.txt

# Copia il resto dell'applicazione nella directory di lavoro
# Assicurati che tutti i file e le cartelle necessarie siano copiate
COPY . .
# Se hai file specifici che devono essere in posizioni particolari,
# puoi usare comandi COPY aggiuntivi.
# Ad esempio, se mcp_servers.json fosse in una cartella config:
# COPY config/mcp_servers.json ./config/

# Esponi la porta su cui l'applicazione FastAPI è in esecuzione
EXPOSE 8001

# Definisci il comando per eseguire l'applicazione quando il container si avvia
# Assicurati che main_api.py sia eseguibile e che Uvicorn sia configurato per ascoltare su 0.0.0.0
# Questo permette connessioni dall'esterno del container.
CMD ["uvicorn", "main_api:app", "--host", "0.0.0.0", "--port", "8001"]