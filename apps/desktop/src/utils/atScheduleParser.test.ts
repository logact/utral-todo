import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractAtSchedule } from './atScheduleParser';

const MOCK_NOW = new Date('2025-06-15T10:00:00'); // Sunday

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(MOCK_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('extractAtSchedule', () => {
  describe('empty / no @ token', () => {
    it('returns empty title for empty string', () => {
      expect(extractAtSchedule('')).toEqual({ title: '' });
    });

    it('returns empty title for whitespace-only', () => {
      expect(extractAtSchedule('   ')).toEqual({ title: '' });
    });

    it('returns full title when no @ present', () => {
      expect(extractAtSchedule('buy groceries')).toEqual({ title: 'buy groceries' });
    });
  });

  describe('standalone @ with no valid schedule', () => {
    it('returns title unchanged when @ is at end', () => {
      expect(extractAtSchedule('task @')).toEqual({ title: 'task @' });
    });

    it('returns title unchanged when @ is followed by invalid text', () => {
      expect(extractAtSchedule('task @xyz')).toEqual({ title: 'task @xyz' });
    });
  });

  describe('@ with date tokens', () => {
    it('parses @  ', () => {
      const result = extractAtSchedule('buy milk @tomorrow');
      expect(result.title).toBe('buy milk');
      expect(result.scheduledDate).toBeDefined();
      expect(result.scheduledDate!.getDate()).toBe(16); // June 16
    });

    it('parses @ today (standalone @)', () => {
      const result = extractAtSchedule('buy milk @ today');
      expect(result.title).toBe('buy milk');
      expect(result.scheduledDate).toBeDefined();
      expect(result.scheduledDate!.getDate()).toBe(15);
    });

    it('parses @monday', () => {
      const result = extractAtSchedule('call mom @monday');
      expect(result.title).toBe('call mom');
      expect(result.scheduledDate).toBeDefined();
      // Monday after Sunday June 15 = June 16
      expect(result.scheduledDate!.getDate()).toBe(16);
    });

    it('parses @friday', () => {
      const result = extractAtSchedule('meeting @friday');
      expect(result.title).toBe('meeting');
      expect(result.scheduledDate).toBeDefined();
      // Friday after Sunday June 15 = June 20
      expect(result.scheduledDate!.getDate()).toBe(20);
    });
  });

  describe('@ with time tokens', () => {
    it('parses @14:30', () => {
      const result = extractAtSchedule('dentist @14:30');
      expect(result.title).toBe('dentist');
      expect(result.scheduledDate).toBeDefined();
      expect(result.scheduledDate!.getHours()).toBe(14);
      expect(result.scheduledDate!.getMinutes()).toBe(30);
    });

    it('parses @3pm', () => {
      const result = extractAtSchedule('lunch @3pm');
      expect(result.title).toBe('lunch');
      expect(result.scheduledDate).toBeDefined();
      expect(result.scheduledDate!.getHours()).toBe(15);
      expect(result.scheduledDate!.getMinutes()).toBe(0);
    });

    it('parses @9:00am', () => {
      const result = extractAtSchedule('standup @9:00am');
      expect(result.title).toBe('standup');
      expect(result.scheduledDate).toBeDefined();
      expect(result.scheduledDate!.getHours()).toBe(9);
      expect(result.scheduledDate!.getMinutes()).toBe(0);
    });
  });

  describe('@ with date + time combos', () => {
    it('parses @tomorrow afternoon', () => {
      const result = extractAtSchedule('review @tomorrow afternoon');
      expect(result.title).toBe('review');
      expect(result.scheduledDate).toBeDefined();
      expect(result.scheduledDate!.getDate()).toBe(16);
      expect(result.scheduledDate!.getHours()).toBe(14);
    });

    it('parses @friday 3pm', () => {
      const result = extractAtSchedule('meeting @friday 3pm');
      expect(result.title).toBe('meeting');
      expect(result.scheduledDate).toBeDefined();
      expect(result.scheduledDate!.getDate()).toBe(20);
      expect(result.scheduledDate!.getHours()).toBe(15);
    });
  });

  describe('@ at start of input', () => {
    it('parses schedule at start with remaining title', () => {
      const result = extractAtSchedule('@tomorrow buy milk');
      expect(result.title).toBe('buy milk');
      expect(result.scheduledDate).toBeDefined();
      expect(result.scheduledDate!.getDate()).toBe(16);
    });
  });

  describe('multiple @ tokens', () => {
    it('uses the first @ token', () => {
      const result = extractAtSchedule('task @tomorrow extra @friday');
      expect(result.title).toBe('task extra @friday');
      expect(result.scheduledDate).toBeDefined();
      expect(result.scheduledDate!.getDate()).toBe(16);
    });
  });

  describe('relative date expressions', () => {
    it('parses @in 3 days', () => {
      const result = extractAtSchedule('deadline @in 3 days');
      expect(result.title).toBe('deadline');
      expect(result.scheduledDate).toBeDefined();
      expect(result.scheduledDate!.getDate()).toBe(18);
    });
  });
});
