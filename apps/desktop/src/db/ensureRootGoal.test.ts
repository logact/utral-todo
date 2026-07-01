import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared, hoisted mock plumbing for the query builders ensureRootGoal uses.
// ensureRootGoal runs statements directly on `db` (no transaction, because the
// Tauri SQL plugin can't span one across pooled connections), so we mock
// db.select / db.insert / db.update chains here and assert on their calls.
const H = vi.hoisted(() => {
  const selectRows = { current: [] as any[] };
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values: insertValues }));
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const selectWhere = vi.fn(() => Promise.resolve(selectRows.current));
  const select = vi.fn(() => ({ from: vi.fn(() => ({ where: selectWhere })) }));
  return {
    selectRows,
    insertValues,
    insert,
    updateWhere,
    updateSet,
    update,
    selectWhere,
    select,
  };
});

vi.mock('./drizzle-adapter', () => ({
  db: { select: H.select, insert: H.insert, update: H.update },
}));

vi.mock('../lib/sync/syncEngine', () => ({
  syncLocalChange: vi.fn().mockResolvedValue(undefined),
  getOrCreateDeviceId: vi.fn().mockResolvedValue('test-node'),
}));

vi.mock('../types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../types')>();
  return {
    ...actual,
    newHLC: vi.fn().mockReturnValue({ wall: 1000, counter: 0, node: 'test-node' }),
    mergeHLC: vi.fn().mockReturnValue({ wall: 1000, counter: 1, node: 'test-node' }),
  };
});

import { ensureRootGoal, ROOT_GOAL_ID } from './todos';
import { todos, plans as plansTable, todoToRow } from './schema';
import type { Todo } from '../types';

describe('ensureRootGoal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.selectRows.current = [];
  });

  describe('when no root goal exists', () => {
    it('inserts a root goal with isRootGoal and goal nodeType', async () => {
      await ensureRootGoal();

      // First insert is the root goal into the todos table.
      expect(H.insert).toHaveBeenNthCalledWith(1, todos);
      const goalRow = H.insertValues.mock.calls[0][0];
      expect(goalRow.id).toBe(ROOT_GOAL_ID);
      expect(goalRow.nodeType).toBe('goal');
      expect(goalRow.isRootGoal).toBe(true);
      expect(goalRow.goalStatus).toBe('active');
    });

    it('inserts a system plan linked to the root goal', async () => {
      await ensureRootGoal();

      // Second insert is the plan into the plans table.
      expect(H.insert).toHaveBeenNthCalledWith(2, plansTable);
      const planRow = H.insertValues.mock.calls[1][0];
      expect(planRow.goalTodoId).toBe(ROOT_GOAL_ID);
      expect(planRow.isSystemPlan).toBe(true);
      expect(planRow.id).toBeTruthy();
    });

    it('sets the created plan as the root goal activePlanId', async () => {
      const result = await ensureRootGoal();

      const planRow = H.insertValues.mock.calls[1][0];
      expect(H.update).toHaveBeenCalledWith(todos);
      expect(H.updateSet).toHaveBeenCalledWith(
        expect.objectContaining({ activePlanId: planRow.id }),
      );
      expect(result.activePlanId).toBe(planRow.id);
      expect(result.id).toBe(ROOT_GOAL_ID);
      expect(result.isRootGoal).toBe(true);
    });
  });

  describe('when a root goal already exists', () => {
    it('returns the existing goal without inserting', async () => {
      const existing: Todo = {
        id: ROOT_GOAL_ID,
        nodeType: 'goal',
        title: 'Root Goal',
        description: '',
        isRootGoal: true,
        goalStatus: 'active',
        tags: [],
        order: 0,
        activePlanId: 'existing-plan',
        createdAt: { wall: 5, counter: 0, node: 'n' },
        updatedAt: { wall: 5, counter: 0, node: 'n' },
        isDeleted: false,
      };
      H.selectRows.current = [todoToRow(existing)];

      const result = await ensureRootGoal();

      expect(result.id).toBe(ROOT_GOAL_ID);
      expect(result.isRootGoal).toBe(true);
      expect(result.activePlanId).toBe('existing-plan');
      expect(H.insert).not.toHaveBeenCalled();
      expect(H.update).not.toHaveBeenCalled();
    });
  });
});
