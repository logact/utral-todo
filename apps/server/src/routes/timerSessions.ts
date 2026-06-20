import { Router } from 'express';
import { prisma } from '../index.js';
import { logChange } from '../sync/log.js';
import { sendLiveActivityPush, sendLiveActivityEnd } from '../apns/liveActivity.js';

const router = Router();

router.get('/', async (req, res) => {
  const { status, type } = req.query;
  const sessions = await prisma.timerSession.findMany({
    where: {
      ...(status ? { status: String(status) } : {}),
      ...(type ? { type: String(type) } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(sessions);
});

router.get('/:id', async (req, res) => {
  const session = await prisma.timerSession.findUnique({
    where: { id: req.params.id },
  });
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json(session);
});

router.post('/', async (req, res) => {
  const {
    type,
    name,
    pluseId,
    todoId,
    intervals,
    repeatCount,
    startedAt,
    status,
    currentIndex,
    elapsedSeconds,
  } = req.body;

  const session = await prisma.timerSession.create({
    data: {
      type,
      name: name ?? 'Timer Session',
      pluseId: pluseId ?? null,
      todoId: todoId ?? null,
      intervals: intervals ?? null,
      repeatCount: repeatCount ?? 1,
      startedAt: startedAt ? new Date(startedAt) : new Date(),
      status: status ?? 'running',
      currentIndex: currentIndex ?? 0,
      elapsedSeconds: elapsedSeconds ?? 0,
    },
  });
  await logChange(req, 'timerSession', 'create', session.id, session);

  if (status === 'running' && intervals) {
    const deviceId = req.headers['x-device-id'] as string | undefined;
    sendLiveActivityPush({
      sessionId: session.id,
      contentState: {
        timerName: name ?? 'Timer',
        currentIndex: currentIndex ?? 0,
        totalIntervals: (intervals as number[]).length * (repeatCount ?? 1),
        elapsedSeconds: elapsedSeconds ?? 0,
        intervalDuration: (intervals as number[])[currentIndex ?? 0] ?? 60,
        isRunning: true,
        isCompleted: false,
      },
    }, deviceId).catch(() => {});
  }

  res.status(201).json(session);
});

router.patch('/:id', async (req, res) => {
  const {
    name,
    pluseId,
    todoId,
    intervals,
    repeatCount,
    startedAt,
    pausedAt,
    completedAt,
    currentIndex,
    elapsedSeconds,
    status,
  } = req.body;

  const session = await prisma.timerSession.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(pluseId !== undefined ? { pluseId } : {}),
      ...(todoId !== undefined ? { todoId } : {}),
      ...(intervals !== undefined ? { intervals } : {}),
      ...(repeatCount !== undefined ? { repeatCount } : {}),
      ...(startedAt !== undefined ? { startedAt: new Date(startedAt) } : {}),
      ...(pausedAt !== undefined ? { pausedAt: pausedAt ? new Date(pausedAt) : null } : {}),
      ...(completedAt !== undefined ? { completedAt: completedAt ? new Date(completedAt) : null } : {}),
      ...(currentIndex !== undefined ? { currentIndex } : {}),
      ...(elapsedSeconds !== undefined ? { elapsedSeconds } : {}),
      ...(status !== undefined ? { status } : {}),
    },
  });
  await logChange(req, 'timerSession', 'update', session.id, session);

  const deviceId = req.headers['x-device-id'] as string | undefined;
  const sessionIntervals = (session.intervals as number[]) ?? [];
  const sessionRepeatCount = session.repeatCount ?? 1;
  const totalIntervals = sessionIntervals.length * sessionRepeatCount;
  const currentDuration = (session.currentIndex ?? 0) < sessionIntervals.length
    ? sessionIntervals[session.currentIndex ?? 0]
    : 0;

  if (status === 'completed') {
    sendLiveActivityEnd(session.id, true, deviceId).catch(() => {});
  } else if (status === 'running') {
    sendLiveActivityPush({
      sessionId: session.id,
      contentState: {
        timerName: name ?? session.name ?? 'Timer',
        currentIndex: session.currentIndex ?? 0,
        totalIntervals,
        elapsedSeconds: session.elapsedSeconds ?? 0,
        intervalDuration: currentDuration,
        isRunning: true,
        isCompleted: false,
      },
    }, deviceId).catch(() => {});
  } else if (status === 'paused') {
    sendLiveActivityPush({
      sessionId: session.id,
      contentState: {
        timerName: name ?? session.name ?? 'Timer',
        currentIndex: session.currentIndex ?? 0,
        totalIntervals,
        elapsedSeconds: session.elapsedSeconds ?? 0,
        intervalDuration: currentDuration,
        isRunning: false,
        isCompleted: false,
      },
    }, deviceId).catch(() => {});
  }

  res.json(session);
});

router.patch('/:id/timer-state', async (req, res) => {
  const { elapsedSeconds, currentIndex, status, startedAt } = req.body;

  const session = await prisma.timerSession.update({
    where: { id: req.params.id },
    data: {
      ...(elapsedSeconds !== undefined ? { elapsedSeconds } : {}),
      ...(currentIndex !== undefined ? { currentIndex } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(startedAt !== undefined ? { startedAt: new Date(startedAt) } : {}),
    },
  });
  await logChange(req, 'timerSession', 'update', session.id, session);

  res.json(session);
});

router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  await prisma.timerSession.delete({ where: { id } });
  await logChange(req, 'timerSession', 'delete', id);
  res.status(204).send();
});

export default router;
