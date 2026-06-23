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
import todosRouter from './routes/todos.js';
import relationsRouter from './routes/relations.js';
import todoLogsRouter from './routes/todoLogs.js';
import actionEdgesRouter from './routes/actionEdges.js';
import plansRouter from './routes/plans.js';
import plusesRouter from './routes/pluses.js';
import timerSessionsRouter from './routes/timerSessions.js';
import syncRouter from './routes/sync.js';
import devicesRouter from './routes/devices.js';
import watchRouter from './routes/watch.js';
import labelsRouter from './routes/labels.js';

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
app.use(express.json({ limit: '10mb' }));

app.use('/api', requireAuth);

app.use('/api/todos', todosRouter);
app.use('/api/relations', relationsRouter);
app.use('/api/todo-logs', todoLogsRouter);
app.use('/api/action-edges', actionEdgesRouter);
app.use('/api/plans', plansRouter);
app.use('/api/pluses', plusesRouter);
app.use('/api/timer-sessions', timerSessionsRouter);
app.use('/api/sync', syncRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/watch', watchRouter);
app.use('/api/labels', labelsRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.delete('/api/all-data', async (_req, res) => {
  await prisma.timerSession.deleteMany();
  await prisma.todoLog.deleteMany();
  await prisma.todoRelation.deleteMany();
  await prisma.actionEdge.deleteMany();
  await prisma.pluse.deleteMany();
  await prisma.repeatOccurrence.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.syncEvent.deleteMany();
  await prisma.todo.deleteMany();
  res.status(204).send();
});

/* ---------- Data migrations ---------- */

async function runPlanMigration(): Promise<void> {
  const markerPath = path.resolve(__dirname, '../.migration-v37-plan-subgraph');
  if (fs.existsSync(markerPath)) return;

  const plans = await prisma.plan.findMany();
  const edges = await prisma.actionEdge.findMany();
  let migrated = 0;
  for (const plan of plans) {
    const existingEdgeIds = Array.isArray(plan.edgeIds)
      ? (plan.edgeIds as string[])
      : (typeof plan.edgeIds === 'string' ? JSON.parse(plan.edgeIds) : []);
    if (existingEdgeIds.length > 0) continue;

    const oldTodoIds = Array.isArray(plan.nodeIds)
      ? (plan.nodeIds as string[])
      : (typeof plan.nodeIds === 'string' ? JSON.parse(plan.nodeIds) : []);
    const nodeIds = Array.isArray(oldTodoIds) ? [...oldTodoIds] : [];
    const nodeIdSet = new Set(nodeIds);
    const edgeIds = edges
      .filter((e) => nodeIdSet.has(e.fromTodoId) && nodeIdSet.has(e.toTodoId))
      .map((e) => e.id);

    await prisma.plan.update({
      where: { id: plan.id },
      data: {
        nodeIds: JSON.stringify(nodeIds),
        edgeIds: JSON.stringify(edgeIds),
      },
    });
    migrated++;
  }

  fs.writeFileSync(markerPath, new Date().toISOString());
  console.log(`[migrate] Migrated ${migrated} plans to subgraph shape`);
}

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

/* ---------- System task seeding ---------- */

const SYSTEM_TASKS = [
  { id: 'system:day-startup', title: 'Day Startup Plan', description: 'Plan your day and set priorities', scheduledTime: '06:00' },
  { id: 'system:morning-summary', title: 'Morning Summary', description: 'Review morning progress and adjust plans', scheduledTime: '12:00' },
  { id: 'system:afternoon-startup', title: 'Afternoon Startup Plan', description: 'Plan afternoon tasks and refocus', scheduledTime: '13:00' },
  { id: 'system:afternoon-summary', title: 'Afternoon Summary', description: 'Review afternoon progress and plan evening', scheduledTime: '17:00' },
  { id: 'system:evening-startup', title: 'Evening Startup', description: 'Review day and plan evening tasks', scheduledTime: '19:00' },
  { id: 'system:evening-summary', title: 'Evening Summary', description: 'Reflect on the day and prepare for tomorrow', scheduledTime: '21:30' },
];

async function seedSystemTasks(): Promise<void> {
  const existing = await prisma.todo.findMany({
    where: { isSystemTask: true },
  });
  const existingIds = new Set(existing.map((t) => t.id));

  const now = new Date();
  const scheduledDate = new Date();
  scheduledDate.setHours(0, 0, 0, 0);

  for (const task of SYSTEM_TASKS) {
    if (existingIds.has(task.id)) continue;

    await prisma.todo.create({
      data: {
        id: task.id,
        nodeType: 'task',
        pattern: 'task',
        title: task.title,
        description: task.description,
        status: 'pending',
        priority: 'medium',
        estimatedMinutes: 15,
        tags: [],
        createdAt: now,
        updatedAt: now,
        scheduledDate,
        repeatRule: { type: 'daily' },
        order: 0,
        isSystemTask: true,
      },
    });
  }
}

/* ---------- Start ---------- */

const PORT = process.env.PORT || 3001;

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
