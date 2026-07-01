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
import type { Todo } from '../types';

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

describe('ensureTimeSlotTodo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDb.__selectMock.mockReturnValue(buildSelectChain([]));
  });

  it('creates a time-slot todo with deterministic id and slot start time', async () => {
    const slot = {
      id: 'slot-morning',
      milestoneId: 'system:day-startup',
      title: 'Day Startup Plan',
      time: '06:00',
      startHour: 6,
      startMinute: 0,
      endHour: 12,
      endMinute: 0,
    };

    const today = new Date('2026-07-01T12:00:00');
    const todoId = await ensureTimeSlotTodo(slot, today);

    expect(todoId).toBe(slot.milestoneId);
    expect(mockedDb.insert).toHaveBeenCalledWith(todos);

    const insertCall = mockedDb.insert.mock.results[0].value.values.mock.calls[0];
    const insertedRow = insertCall[0];

    expect(insertedRow.id).toBe(slot.milestoneId);
    expect(insertedRow.pattern).toBe('timeSlot');
    expect(insertedRow.isSystemTask).toBe(true);
    expect(insertedRow.status).toBe('done');
    expect(insertedRow.title).toBe(slot.title);
    expect(insertedRow.scheduledDate).toEqual(new Date('2026-07-01T06:00:00'));
  });

  it('does not insert when a matching time-slot todo already exists', async () => {
    const slot = {
      id: 'slot-morning',
      milestoneId: 'system:day-startup',
      title: 'Day Startup Plan',
      time: '06:00',
      startHour: 6,
      startMinute: 0,
      endHour: 12,
      endMinute: 0,
    };

    const today = new Date('2026-07-01T12:00:00');
    const existing: Todo = {
      id: slot.milestoneId,
      nodeType: 'task',
      pattern: 'timeSlot',
      title: slot.title,
      description: '',
      status: 'done',
      scheduledDate: new Date('2026-07-01T06:00:00'),
      isSystemTask: true,
      tags: [],
      order: 0,
      createdAt: { wall: 100, counter: 0, node: 'other' },
      updatedAt: { wall: 100, counter: 0, node: 'other' },
      isDeleted: false,
    };

    mockedDb.__selectMock.mockReturnValue(buildSelectChain([{
      ...existing,
      scheduledDate: existing.scheduledDate!.getTime() / 1000,
    }]));

    const todoId = await ensureTimeSlotTodo(slot, today);

    expect(todoId).toBe(slot.milestoneId);
    expect(mockedDb.insert).not.toHaveBeenCalled();
    expect(mockedDb.update).not.toHaveBeenCalled();
  });

  it('updates an existing todo when its pattern or system-task flag is wrong', async () => {
    const slot = {
      id: 'slot-morning',
      milestoneId: 'system:day-startup',
      title: 'Day Startup Plan',
      time: '06:00',
      startHour: 6,
      startMinute: 0,
      endHour: 12,
      endMinute: 0,
    };

    const today = new Date('2026-07-01T12:00:00');
    const existing: Todo = {
      id: slot.milestoneId,
      nodeType: 'task',
      pattern: 'task',
      title: slot.title,
      description: '',
      status: 'done',
      scheduledDate: new Date('2026-07-01T06:00:00'),
      tags: [],
      order: 0,
      createdAt: { wall: 100, counter: 0, node: 'other' },
      updatedAt: { wall: 100, counter: 0, node: 'other' },
      isDeleted: false,
    };

    mockedDb.__selectMock.mockReturnValue(buildSelectChain([{
      ...existing,
      scheduledDate: existing.scheduledDate!.getTime() / 1000,
    }]));

    const todoId = await ensureTimeSlotTodo(slot, today);

    expect(todoId).toBe(slot.milestoneId);
    expect(mockedDb.insert).not.toHaveBeenCalled();
    expect(mockedDb.update).toHaveBeenCalledWith(todos);
  });

  it('migrates a legacy slot todo found by scheduled time to the canonical id', async () => {
    const slot = {
      id: 'slot-morning',
      milestoneId: 'system:day-startup',
      title: 'Day Startup Plan',
      time: '06:00',
      startHour: 6,
      startMinute: 0,
      endHour: 12,
      endMinute: 0,
    };

    const legacyId = 'legacy-random-id';
    const scheduledSeconds = new Date('2026-07-01T06:00:00').getTime() / 1000;

    mockedDb.__selectMock
      .mockReturnValueOnce(buildSelectChain([]))
      .mockReturnValueOnce(
        buildSelectChain([
          {
            id: legacyId,
            nodeType: 'task',
            pattern: 'timeSlot',
            title: slot.title,
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
          },
        ])
      )
      .mockReturnValueOnce(
        buildSelectChain([
          {
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
          },
        ])
      );

    const today = new Date('2026-07-01T12:00:00');
    const todoId = await ensureTimeSlotTodo(slot, today);

    expect(todoId).toBe(slot.milestoneId);
    expect(mockedDb.update).toHaveBeenCalledWith(todoLogs);
    expect(mockedDb.update).toHaveBeenCalledWith(todos);
    expect(mockedDb.insert).toHaveBeenCalledWith(todos);

    const insertCall = mockedDb.insert.mock.results[0].value.values.mock.calls[0];
    expect(insertCall[0].id).toBe(slot.milestoneId);
  });
});

describe('migrateLegacySlotTodos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('moves logs from legacy duplicate todos to the canonical time-slot todo', async () => {
    const slot = {
      id: 'slot-morning',
      milestoneId: 'system:day-startup',
      title: 'Day Startup Plan',
      time: '06:00',
      startHour: 6,
      startMinute: 0,
      endHour: 12,
      endMinute: 0,
    };

    const legacyId = 'legacy-random-id';

    mockedDb.__selectMock
      .mockReturnValueOnce(buildSelectChain([{
        id: legacyId,
        nodeType: 'task',
        pattern: 'task',
        title: slot.title,
        description: '',
        status: 'done',
        scheduledDate: new Date().setHours(0, 0, 0, 0),
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
      .mockReturnValueOnce(buildSelectChain([]))
      .mockReturnValueOnce(buildSelectChain([]))
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
