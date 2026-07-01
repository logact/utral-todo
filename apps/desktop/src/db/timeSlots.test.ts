import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./drizzle-adapter', () => {
  const selectMock = vi.fn();
  return {
    db: {
      select: selectMock,
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
      from: vi.fn().mockReturnThis(),
      __selectMock: selectMock,
    },
  };
});

vi.mock('../lib/sync/syncEngine', () => ({
  syncLocalChange: vi.fn().mockResolvedValue(undefined),
  getOrCreateDeviceId: vi.fn().mockResolvedValue('test-node'),
}));

vi.mock('@utral/sync-share', () => ({
  newHLC: vi.fn().mockReturnValue({ wall: 1000, counter: 0, node: 'test-node' }),
  mergeHLC: vi.fn().mockReturnValue({ wall: 1000, counter: 1, node: 'test-node' }),
}));

vi.mock('./timeSlotDefinitions', () => ({
  getTimeSlotDefinitions: vi.fn().mockResolvedValue([]),
}));

import { ensureTimeSlotTodo, migrateLegacySlotTodos } from './timeSlots';
import { db } from './drizzle-adapter';
import { todos, todoLogs } from './schema';
import { getTimeSlotStartMilestoneId, getTimeSlotEndMilestoneId } from '../types';

const mockedDb = db as unknown as {
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  __selectMock: ReturnType<typeof vi.fn>;
};

function buildSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  };
}

/** A stored `timeSlot` boundary row (title == id), as returned from the DB. */
function boundaryRow(
  id: string,
  scheduledSeconds: number,
  overrides: Record<string, unknown> = {}
) {
  return {
    id,
    nodeType: 'task',
    pattern: 'timeSlot',
    title: id,
    description: '',
    status: 'done',
    scheduledDate: scheduledSeconds,
    isSystemTask: true,
    tags: '[]',
    order: 0,
    createdAtWall: 100,
    createdAtCounter: 0,
    createdAtNode: 'other',
    updatedAtWall: 100,
    updatedAtCounter: 0,
    updatedAtNode: 'other',
    isDeleted: false,
    ...overrides,
  };
}

const MORNING_SLOT = {
  id: 'slot-morning',
  milestoneId: 'system:day-startup',
  title: 'Day Startup Plan',
  time: '06:00',
  startHour: 6,
  startMinute: 0,
  endHour: 12,
  endMinute: 0,
};

const START_SECONDS = new Date('2026-07-01T06:00:00').getTime() / 1000;
const END_SECONDS = new Date('2026-07-01T12:00:00').getTime() / 1000;

describe('ensureTimeSlotTodo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDb.__selectMock.mockReturnValue(buildSelectChain([]));
  });

  it('creates start + end boundary todos with time-derived ids and titles', async () => {
    const today = new Date('2026-07-01T12:00:00');
    const todoId = await ensureTimeSlotTodo(MORNING_SLOT, today);

    const startId = getTimeSlotStartMilestoneId(MORNING_SLOT);
    const endId = getTimeSlotEndMilestoneId(MORNING_SLOT);
    expect(startId).toBe('timeslot:0600');
    expect(endId).toBe('timeslot:1200');

    // Returns the start boundary id; ensures both boundaries.
    expect(todoId).toBe(startId);
    expect(mockedDb.insert).toHaveBeenCalledWith(todos);
    expect(mockedDb.insert).toHaveBeenCalledTimes(2);

    const startRow = mockedDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(startRow.id).toBe(startId);
    expect(startRow.title).toBe(startId);
    expect(startRow.pattern).toBe('timeSlot');
    expect(startRow.isSystemTask).toBe(true);
    expect(startRow.status).toBe('done');
    expect(startRow.scheduledDate).toEqual(new Date('2026-07-01T06:00:00'));

    const endRow = mockedDb.insert.mock.results[0].value.values.mock.calls[1][0];
    expect(endRow.id).toBe(endId);
    expect(endRow.scheduledDate).toEqual(new Date('2026-07-01T12:00:00'));
  });

  it('does not insert or update when both boundary todos already exist', async () => {
    const startId = getTimeSlotStartMilestoneId(MORNING_SLOT);
    const endId = getTimeSlotEndMilestoneId(MORNING_SLOT);

    mockedDb.__selectMock
      .mockReturnValueOnce(buildSelectChain([boundaryRow(startId, START_SECONDS)]))
      .mockReturnValueOnce(buildSelectChain([boundaryRow(endId, END_SECONDS)]));

    const today = new Date('2026-07-01T12:00:00');
    const todoId = await ensureTimeSlotTodo(MORNING_SLOT, today);

    expect(todoId).toBe(startId);
    expect(mockedDb.insert).not.toHaveBeenCalled();
    expect(mockedDb.update).not.toHaveBeenCalled();
  });

  it('updates an existing boundary todo when its pattern is wrong', async () => {
    const startId = getTimeSlotStartMilestoneId(MORNING_SLOT);
    const endId = getTimeSlotEndMilestoneId(MORNING_SLOT);

    mockedDb.__selectMock
      .mockReturnValueOnce(
        buildSelectChain([boundaryRow(startId, START_SECONDS, { pattern: 'task' })])
      )
      .mockReturnValueOnce(buildSelectChain([boundaryRow(endId, END_SECONDS)]));

    const today = new Date('2026-07-01T12:00:00');
    const todoId = await ensureTimeSlotTodo(MORNING_SLOT, today);

    expect(todoId).toBe(startId);
    expect(mockedDb.insert).not.toHaveBeenCalled();
    expect(mockedDb.update).toHaveBeenCalledWith(todos);
  });
});

describe('migrateLegacySlotTodos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('moves logs from a legacy slot todo to the start-boundary milestone todo', async () => {
    const legacyId = 'legacy-random-id';

    mockedDb.__selectMock
      .mockReturnValueOnce(buildSelectChain([{
        id: legacyId,
        nodeType: 'task',
        pattern: 'task',
        title: MORNING_SLOT.title,
        description: '',
        status: 'done',
        scheduledDate: new Date('2026-07-01T00:00:00').getTime() / 1000,
        isSystemTask: true,
        tags: '[]',
        order: 0,
        createdAtWall: 100,
        createdAtCounter: 0,
        createdAtNode: 'other',
        updatedAtWall: 100,
        updatedAtCounter: 0,
        updatedAtNode: 'other',
        isDeleted: false,
      }]))
      .mockReturnValueOnce(buildSelectChain([{
        id: 'log-1',
        todoId: legacyId,
        type: 'thought',
        content: 'legacy note',
        createdAtWall: 100,
        createdAtCounter: 0,
        createdAtNode: 'other',
        updatedAtWall: 100,
        updatedAtCounter: 0,
        updatedAtNode: 'other',
        isDeleted: false,
      }]));

    await migrateLegacySlotTodos();

    expect(mockedDb.update).toHaveBeenCalledWith(todoLogs);
  });
});
