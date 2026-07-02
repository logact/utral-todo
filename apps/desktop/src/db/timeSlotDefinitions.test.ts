import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./drizzle-adapter', () => {
  const selectMock = vi.fn();
  return {
    db: {
      select: selectMock,
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
      from: vi.fn().mockReturnThis(),
      __selectMock: selectMock,
    },
  };
});

vi.mock('../lib/sync/syncEngine', () => ({
  notifyDbOperation: vi.fn().mockResolvedValue(undefined),
  syncLocalChange: vi.fn().mockResolvedValue(undefined),
  getOrCreateDeviceId: vi.fn().mockResolvedValue('test-node'),
}));

vi.mock('@utral/sync-share', () => ({
  newHLC: vi.fn().mockReturnValue({ wall: 1000, counter: 0, node: 'test-node' }),
  mergeHLC: vi.fn().mockReturnValue({ wall: 1000, counter: 1, node: 'test-node' }),
  TABLE_NAME_MAP: {
    todo: 'todo',
    todoLog: 'todoLog',
    timeSlot: 'timeSlot',
  },
}));

import {
  seedDefaultTimeSlots,
  getTimeSlotDefinitions,
  getTimeSlotDefinitionByMilestoneId,
  updateTimeSlotDefinition,
  deleteTimeSlotDefinition,
} from './timeSlotDefinitions';
import { db } from './drizzle-adapter';
import { timeSlots } from './schema';
import { notifyDbOperation } from '../lib/sync/syncEngine';

const mockedDb = db as unknown as {
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  __selectMock: ReturnType<typeof vi.fn>;
};

function buildSelectChain(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(result),
    limit: vi.fn().mockResolvedValue(result),
  };
}

describe('timeSlotDefinitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedDb.__selectMock.mockReturnValue(buildSelectChain([]));
  });

  it('seeds default time slots on first run', async () => {
    await seedDefaultTimeSlots('test-node');

    expect(mockedDb.insert).toHaveBeenCalledWith(timeSlots);
    expect(mockedDb.insert.mock.results[0].value.values).toHaveBeenCalled();

    const insertCall = mockedDb.insert.mock.results[0].value.values.mock.calls[0];
    expect(insertCall[0].id).toBe('slot-morning');
    expect(insertCall[0].startHour).toBe(6);

    expect(notifyDbOperation).toHaveBeenCalledWith('timeSlot', 'create', 'slot-morning');
  });

  it('loads time slot definitions ordered by order', async () => {
    mockedDb.__selectMock.mockReturnValue(
      buildSelectChain([
        {
          id: 'slot-morning',
          milestoneId: 'system:day-startup',
          title: 'Day Startup Plan',
          time: '06:00',
          startHour: 6,
          startMinute: 0,
          endHour: 12,
          endMinute: 0,
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
    );

    const slots = await getTimeSlotDefinitions();

    expect(slots).toHaveLength(1);
    expect(slots[0].id).toBe('slot-morning');
    expect(mockedDb.__selectMock).toHaveBeenCalled();
  });

  it('finds a slot by milestone id', async () => {
    mockedDb.__selectMock.mockReturnValue(
      buildSelectChain([
        {
          id: 'slot-morning',
          milestoneId: 'system:day-startup',
          title: 'Day Startup Plan',
          time: '06:00',
          startHour: 6,
          startMinute: 0,
          endHour: 12,
          endMinute: 0,
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
    );

    const slot = await getTimeSlotDefinitionByMilestoneId('system:day-startup');

    expect(slot).toBeDefined();
    expect(slot?.milestoneId).toBe('system:day-startup');
  });

  it('updates a slot and enqueues sync', async () => {
    mockedDb.__selectMock.mockReturnValue(
      buildSelectChain([
        {
          id: 'slot-morning',
          milestoneId: 'system:day-startup',
          title: 'Day Startup Plan',
          time: '06:00',
          startHour: 6,
          startMinute: 0,
          endHour: 12,
          endMinute: 0,
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
    );

    await updateTimeSlotDefinition('slot-morning', { startHour: 7 });

    expect(mockedDb.update).toHaveBeenCalledWith(timeSlots);
    const setCall = mockedDb.update.mock.results[0].value.set.mock.calls[0];
    expect(setCall[0].startHour).toBe(7);
  });

  it('soft-deletes a slot and enqueues sync', async () => {
    mockedDb.__selectMock.mockReturnValue(
      buildSelectChain([
        {
          id: 'slot-morning',
          milestoneId: 'system:day-startup',
          title: 'Day Startup Plan',
          time: '06:00',
          startHour: 6,
          startMinute: 0,
          endHour: 12,
          endMinute: 0,
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
    );

    await deleteTimeSlotDefinition('slot-morning');

    expect(mockedDb.update).toHaveBeenCalledWith(timeSlots);
    const setCall = mockedDb.update.mock.results[0].value.set.mock.calls[0];
    expect(setCall[0].isDeleted).toBe(true);
  });
});
