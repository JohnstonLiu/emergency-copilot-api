import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import { PORT } from './config/env';
import { requestLogger } from './middleware/logger';

// Services
import { sseManager } from './services/sse';
import { snapshotBuffer } from './services/snapshotBuffer';
import { processBatch } from './services/timelineAgent';
import { snapshotWsManager } from './services/snapshotWebSocket';

// Routes
import videosRouter from './routes/videos';
import snapshotsRouter from './routes/snapshots';
import incidentsRouter, { fetchIncidentCurrentState } from './routes/incidents';

const app = express();
const server = createServer(app);
const port = PORT;

// Initialize services
function initializeServices() {
  // Set up snapshot buffer to call timeline agent when batch is ready
  snapshotBuffer.setBatchCallback(processBatch);
  console.log('Snapshot buffer initialized with timeline agent callback');

  // Set up SSE manager to fetch current state for late-joining clients
  sseManager.setFetchCurrentStateCallback(fetchIncidentCurrentState);
  console.log('SSE manager initialized with current state callback');

  // Initialize WebSocket server for snapshot ingestion
  snapshotWsManager.initialize(server);
  console.log('WebSocket server initialized for snapshot ingestion');
}

// Middleware (must be before routes)
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    activeSSEClients: sseManager.getClientCount(),
    activeWebSocketSessions: snapshotWsManager.getSessionCount(),
  });
});

// Mount routes
app.use('/videos', videosRouter);
app.use('/snapshots', snapshotsRouter);
app.use('/incidents', incidentsRouter);

// Global SSE endpoint for all events (backwards compatibility)
app.get('/stream', (req, res) => {
  const clientId = (req.query.clientId as string) ||
    `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`New global SSE connection: ${clientId}`);
  sseManager.addClient(clientId, res);
});

// Global error handler (must be after routes)
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize services and start server
initializeServices();

server.listen(port, () => {
  console.log(`
╔════════════════════════════════════════════════════╗
║         Emergency Copilot API Server               ║
╠════════════════════════════════════════════════════╣
║  Port: ${port.toString().padEnd(43)}               ║
║  Health: http://localhost:${port}/health           ║
╠════════════════════════════════════════════════════╣
║  Endpoints:                                        ║
║  • WS     /ws/snapshots          - Snapshot stream ║
║  • POST   /snapshots             - Submit snapshot ║
║  • GET    /videos                - List videos     ║
║  • GET    /incidents             - List incidents  ║
║  • GET    /incidents/:id         - Get incident    ║
║  • GET    /incidents/:id/timeline - Get timeline   ║
║  • GET    /incidents/:id/stream  - SSE stream      ║
║  • GET    /stream                - Global SSE      ║
╚════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await snapshotBuffer.flushAll();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await snapshotBuffer.flushAll();
  process.exit(0);
});