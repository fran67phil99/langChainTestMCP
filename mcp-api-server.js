#!/usr/bin/env node

const express = require('express');
const cors = require('cors');
const path = require('path');
const mcpRoutes = require('./src/routes/mcpRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ['http://localhost:4200', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/mcp', mcpRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Mauden MCP Manager API',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Mauden MCP Manager API Server',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      mcp: '/api/mcp/*'
    },
    documentation: 'https://github.com/mauden/mcp-manager'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    availableRoutes: ['/health', '/api/mcp/*']
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Ricevuto SIGINT. Arresto graceful del server...');
  server.close(() => {
    console.log('✅ Server arrestato con successo');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Ricevuto SIGTERM. Arresto graceful del server...');
  server.close(() => {
    console.log('✅ Server arrestato con successo');
    process.exit(0);
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log('\n🚀 MAUDEN MCP MANAGER API SERVER');
  console.log('================================');
  console.log(`📡 Server avviato su http://localhost:${PORT}`);
  console.log(`🔧 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log('📋 Endpoint disponibili:');
  console.log(`   • Health Check: http://localhost:${PORT}/health`);
  console.log(`   • MCP API: http://localhost:${PORT}/api/mcp/*`);
  console.log(`   • Configurazione: http://localhost:${PORT}/api/mcp/configuration`);
  console.log(`   • HTTP Servers: http://localhost:${PORT}/api/mcp/http-servers`);
  console.log(`   • STDIO Servers: http://localhost:${PORT}/api/mcp/stdio-servers`);
  console.log('\n💡 Usa Ctrl+C per arrestare il server');
});

module.exports = app;
