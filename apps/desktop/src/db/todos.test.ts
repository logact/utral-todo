import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./drizzle-adapter', () => ({
  db: {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue(undefined),
  },
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

import { createTodo } from './todos';
import { db } from './drizzle-adapter';
import { todos } from './schema';

describe('createTodo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should save scheduledDate to database', async () => {
    const scheduledDate = new Date('2025-06-20T10:00:00');
    
    await createTodo('Test task', { scheduledDate });

    expect(db.insert).toHaveBeenCalledWith(todos);
    
    const insertCall = (db.insert(todos).values as ReturnType<typeof vi.fn>).mock.calls[0];
    const insertedRow = insertCall[0];
    
    expect(insertedRow.scheduledDate).toEqual(scheduledDate);
  });

  it('should save scheduledDate as undefined when not provided', async () => {
    await createTodo('Test task without date');

    expect(db.insert).toHaveBeenCalledWith(todos);
    
    const insertCall = (db.insert(todos).values as ReturnType<typeof vi.fn>).mock.calls[0];
    const insertedRow = insertCall[0];
    
    expect(insertedRow.scheduledDate).toBeUndefined();
  });

  it('should preserve scheduledDate through todoToRow conversion', async () => {
    const scheduledDate = new Date('2025-12-25T15:30:00');
    
    await createTodo('Christmas task', { 
      scheduledDate,
      nodeType: 'task',
      priority: 'high',
    });

    const insertCall = (db.insert(todos).values as ReturnType<typeof vi.fn>).mock.calls[0];
    const insertedRow = insertCall[0];
    
    expect(insertedRow.scheduledDate).toEqual(scheduledDate);
    expect(insertedRow.nodeType).toBe('task');
    expect(insertedRow.priority).toBe('high');
  });

  it('should return todo with scheduledDate', async () => {
    const scheduledDate = new Date('2025-07-01T09:00:00');
    
    const result = await createTodo('Meeting', { scheduledDate });

    expect(result.scheduledDate).toEqual(scheduledDate);
    expect(result.title).toBe('Meeting');
  });

  it('should handle scheduledEndDate', async () => {
    const scheduledDate = new Date('2025-06-20T10:00:00');
    const scheduledEndDate = new Date('2025-06-20T11:00:00');
    
    await createTodo('Meeting with end', { scheduledDate, scheduledEndDate });

    const insertCall = (db.insert(todos).values as ReturnType<typeof vi.fn>).mock.calls[0];
    const insertedRow = insertCall[0];
    
    expect(insertedRow.scheduledDate).toEqual(scheduledDate);
    expect(insertedRow.scheduledEndDate).toEqual(scheduledEndDate);
  });

  it('should convert timestamp back to Date when reading', async () => {
    const { rowToTodo } = await import('./schema');
    
    const timestamp = Math.floor(new Date('2025-06-20T10:00:00').getTime() / 1000);
    const mockRow = {
      id: 'test-id',
      nodeType: 'task',
      title: 'Test',
      scheduledDate: timestamp,
      createdAtWall: 1000,
      createdAtCounter: 0,
      createdAtNode: 'test',
      updatedAtWall: 1000,
      updatedAtCounter: 0,
      updatedAtNode: 'test',
    };
    
    const todo = rowToTodo(mockRow);
    
    expect(todo.scheduledDate).toBeInstanceOf(Date);
    expect(todo.scheduledDate?.getTime()).toBe(timestamp * 1000);
  });
});
