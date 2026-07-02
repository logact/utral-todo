import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), override: true });

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { db, schema } from './db/index.js';
import { syncHandler } from './sync/setup.js';

const API_TOKEN = process.env.API_TOKEN;

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (!API_TOKEN) {
    next();
    return;
  }
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${API_TOKEN}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// BigInt → Number for JSON serialization
const jsonReplacer = (_key: string, value: unknown) =>
  typeof value === 'bigint' ? Number(value) : value;
app.use((_req, res, next) => {
  const origJson = res.json.bind(res);
  res.json = (body: unknown) => origJson(JSON.parse(JSON.stringify(body, jsonReplacer)));
  next();
});

app.use('/api', requireAuth);


app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.delete('/api/all-data', async (_req, res) => {
  // Wipe every data table. Child/dependent tables are cleared before their
  // parents to stay safe if Postgres-level foreign keys are added later.
  await db.delete(schema.syncEvent);
  await db.delete(schema.todoRelation);
  await db.delete(schema.todoLog);
  await db.delete(schema.actionEdge);
  await db.delete(schema.plan);
  await db.delete(schema.pluse);
  await db.delete(schema.repeatOccurrence);
  await db.delete(schema.timeSlot);
  await db.delete(schema.todo);
  await db.delete(schema.device);
  res.status(204).send();
});

const PORT = process.env.PORT || 3001;

const server = createServer(app);

// WebSocket server for sync
const wss = new WebSocketServer({ server, path: '/ws/sync' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const deviceId = url.searchParams.get('deviceId') || 'unknown';
  const userId = url.searchParams.get('userId') || deviceId;
  const channel = url.searchParams.get('channel') || 'default';

  // Verify token if required
  if (API_TOKEN) {
    const token = url.searchParams.get('token');
    if (!token || token !== API_TOKEN) {
      ws.close(1008, 'Unauthorized');
      return;
    }
  }

  console.log(`[ws] Client connected: ${deviceId}`);

  // Register the connection with sync handler
  syncHandler.connect(deviceId, {
    id: deviceId,
    send: (data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    },
    onClose: (cb: () => void) => {
      ws.on('close', cb);
    },
  });

  // Subscribe to channel
  syncHandler.subscribe(deviceId, userId, channel);

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      JSON.parse(data.toString());
      syncHandler.handleMessage(deviceId, data.toString());
    } catch (err) {
      console.error('[ws] Failed to parse message:', err);
    }
  });

  ws.on('close', () => {
    console.log(`[ws] Client disconnected: ${deviceId}`);
    syncHandler.disconnect(deviceId);
  });

  ws.on('error', (err) => {
    console.error(`[ws] Error for ${deviceId}:`, err);
  });
});

// Start server
async function start(): Promise<void> {
  try {
    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`WebSocket server running on ws://localhost:${PORT}/ws/sync`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
