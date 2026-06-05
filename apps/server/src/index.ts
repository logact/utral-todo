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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
