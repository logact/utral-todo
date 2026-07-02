import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared, hoisted mock plumbing for the query builders ensureRootGoal uses.
// The shared bootstrap runs statements directly on `db`, so we mock
// db.select / db.insert / db.update chains here and assert on their calls.
const H = vi.hoisted(() => {
  const selectRows = { current: [] as any[] };
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values: insertValues }));
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const selectWhere = vi.fn(() => Promise.resolve(selectRows.current));
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: selectWhere })),
    })),
  }));
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

vi.mock('@utral/sync-share', () => ({
  newHLC: vi.fn().mockReturnValue({ wall: 1000, counter: 0, node: 'test-node' }),
  mergeHLC: vi.fn().mockReturnValue({ wall: 1000, counter: 1, node: 'test-node' }),
}));

import { ensureRootGoal, ROOT_GOAL_ID, ROOT_PLAN_ID } from '@utral/db-schema/bootstrap';
import { todos, plans as plansTable } from './schema';

describe('ensureRootGoal', () => {
  const trackChange = vi.fn();
  const store = {
    db: { select: H.select, insert: H.insert, update: H.update },
    getDeviceId: vi.fn().mockResolvedValue('test-node'),
    trackChange,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    H.selectRows.current = [];
  });

  describe('when no root goal exists', () => {
    it('inserts a root goal with isRootGoal and goal nodeType', async () => {
      await ensureRootGoal(store);

      // First insert is the root goal into the todos table.
      expect(H.insert).toHaveBeenNthCalledWith(1, todos);
      const goalRow = H.insertValues.mock.calls[0][0];
      expect(goalRow.id).toBe(ROOT_GOAL_ID);
      expect(goalRow.nodeType).toBe('goal');
      expect(goalRow.isRootGoal).toBe(true);
      expect(goalRow.goalStatus).toBe('active');
      expect(trackChange).toHaveBeenCalledWith('todo', 'create', ROOT_GOAL_ID);
    });

    it('inserts a system plan linked to the root goal', async () => {
      await ensureRootGoal(store);

      // Second insert is the plan into the plans table.
      expect(H.insert).toHaveBeenNthCalledWith(2, plansTable);
      const planRow = H.insertValues.mock.calls[1][0];
      expect(planRow.goalTodoId).toBe(ROOT_GOAL_ID);
      expect(planRow.isSystemPlan).toBe(true);
      expect(planRow.id).toBe(ROOT_PLAN_ID);
      expect(trackChange).toHaveBeenCalledWith('plan', 'create', ROOT_PLAN_ID);
    });

    it('sets the created plan as the root goal activePlanId', async () => {
      await ensureRootGoal(store);

      const planRow = H.insertValues.mock.calls[1][0];
      expect(H.update).toHaveBeenCalledWith(todos);
      expect(H.updateSet).toHaveBeenCalledWith(
        expect.objectContaining({ activePlanId: planRow.id }),
      );
      expect(trackChange).toHaveBeenCalledWith('todo', 'update', ROOT_GOAL_ID);
    });
  });

  describe('when a root goal already exists', () => {
    it('returns without inserting', async () => {
      H.selectRows.current = [{ id: ROOT_GOAL_ID }];

      await ensureRootGoal(store);

      expect(H.insert).not.toHaveBeenCalled();
      expect(H.update).not.toHaveBeenCalled();
      expect(trackChange).not.toHaveBeenCalled();
    });
  });
});
