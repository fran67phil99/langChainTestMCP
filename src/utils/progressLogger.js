const { Server } = require("socket.io");

let io = null;

/**
 * Inizializza il progress logger con un'istanza di Socket.IO.
 * @param {object} socketIoInstance - L'istanza del server Socket.IO.
 */
function init(socketIoInstance) {
    if (!socketIoInstance) {
        console.error("progressLogger: L'istanza di Socket.IO è richiesta per l'inizializzazione.");
        return;
    }
    io = socketIoInstance;
    console.log("progressLogger inizializzato con successo.");
}

/**
 * Registra un aggiornamento di avanzamento e lo emette al client tramite Socket.IO.
 * @param {object} data - I dati di log.
 * @param {string} data.source - La fonte del log (es. "OrchestratorAgent").
 * @param {string} data.status - Lo stato dell'evento (es. "start", "info", "success").
 * @param {string} data.message - Il messaggio descrittivo.
 * @param {any} [data.details] - Dettagli o payload opzionali.
 */
function logProgress(data) {
    const { source, status, message, details } = data;

    if (!source || !status || !message) {
        console.error("progressLogger: 'source', 'status' e 'message' sono obbligatori.", data);
        return;
    }

    const logEntry = {
        source,
        status,
        message,
        details: details || null,
        timestamp: new Date().toISOString(),
    };

    // Log sulla console per il debug del backend
    console.log(`[${logEntry.timestamp}] [${logEntry.source}] [${logEntry.status.toUpperCase()}] - ${logEntry.message}`);
    if (details) {
        // Usa console.dir per un output più ricco degli oggetti
        console.dir(details, { depth: null });
    }

    // Emetti al frontend se io è inizializzato
    if (io) {
        io.emit('progress_update', logEntry);
    } else {
        console.warn("progressLogger: Socket.IO non inizializzato. Log non inviato al client.");
    }
}

module.exports = {
    init,
    logProgress,
};
