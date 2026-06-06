import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.local'), override: true });

import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import projectsRouter from './routes/projects.js';
import todosRouter from './routes/todos.js';
import relationsRouter from './routes/relations.js';
import todoLogsRouter from './routes/todoLogs.js';
import roadmapsRouter from './routes/roadmaps.js';
import actionEdgesRouter from './routes/actionEdges.js';
import plusesRouter from './routes/pluses.js';
import timerSessionsRouter from './routes/timerSessions.js';
import syncRouter from './routes/sync.js';
import devicesRouter from './routes/devices.js';
import mobileRouter from './routes/mobile.js';
import watchRouter from './routes/watch.js';

export const prisma = new PrismaClient();

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
app.use(express.json());

app.use('/api', requireAuth);

app.use('/api/projects', projectsRouter);
app.use('/api/todos', todosRouter);
app.use('/api/relations', relationsRouter);
app.use('/api/todo-logs', todoLogsRouter);
app.use('/api/roadmaps', roadmapsRouter);
app.use('/api/action-edges', actionEdgesRouter);
app.use('/api/pluses', plusesRouter);
app.use('/api/timer-sessions', timerSessionsRouter);
app.use('/api/sync', syncRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/mobile', mobileRouter);
app.use('/api/watch', watchRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.delete('/api/all-data', async (_req, res) => {
  await prisma.timerSession.deleteMany();
  await prisma.todoLog.deleteMany();
  await prisma.todoRelation.deleteMany();
  await prisma.actionEdge.deleteMany();
  await prisma.roadmap.deleteMany();
  await prisma.pluse.deleteMany();
  await prisma.todo.deleteMany();
  await prisma.project.deleteMany();
  res.status(204).send();
});

/* ---------- Data migrations ---------- */

async function runDataMigrations(): Promise<void> {
  const markerPath = path.resolve(__dirname, '../.migration-v1-pluse-seconds');
  if (fs.existsSync(markerPath)) return;

  // Migrate pluse intervals from minutes to seconds
  const pluses = await prisma.pluse.findMany();
  for (const pluse of pluses) {
    const intervals = Array.isArray(pluse.intervals) ? (pluse.intervals as number[]) : [];
    if (intervals.length > 0) {
      const newIntervals = intervals.map((d: number) => d * 60);
      await prisma.pluse.update({
        where: { id: pluse.id },
        data: { intervals: newIntervals },
      });
    }
  }

  fs.writeFileSync(markerPath, new Date().toISOString());
  console.log(`Migrated ${pluses.length} pluses to seconds`);
}

/* ---------- Start ---------- */

const PORT = process.env.PORT || 3001;

runDataMigrations().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
