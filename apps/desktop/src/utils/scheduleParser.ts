import { startOfDay, addDays, setTime, setTimeOfDay } from './date';

export interface ScheduleParseResult {
  title: string;
  scheduledDate?: Date;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function nextWeekday(targetDay: number): Date {
  const now = new Date();
  const today = now.getDay();
  const daysUntil = (targetDay - today + 7) % 7;
  return addDays(startOfDay(now), daysUntil);
}

function parseDateHint(text: string): Date | undefined {
  const lower = text.toLowerCase().trim();
  const now = new Date();

  switch (lower) {
    case 'today':
      return startOfDay(now);
    case 'tomorrow':
      return addDays(startOfDay(now), 1);
    case 'yesterday':
      return undefined;
    case 'next week':
      return addDays(startOfDay(now), 7);
  }

  const dayIndex = WEEKDAYS.indexOf(lower);
  if (dayIndex >= 0) {
    return nextWeekday(dayIndex);
  }

  const inDays = lower.match(/^in (\d+) days?$/);
  if (inDays) {
    return addDays(startOfDay(now), parseInt(inDays[1], 10));
  }

  return undefined;
}

function parseTimeHint(text: string): { hours: number; minutes: number } | undefined {
  const lower = text.toLowerCase().trim();

  switch (lower) {
    case 'morning':
      return { hours: 9, minutes: 0 };
    case 'afternoon':
      return { hours: 14, minutes: 0 };
    case 'evening':
      return { hours: 19, minutes: 0 };
  }

  const h24 = lower.match(/^(\d{1,2}):(\d{2})$/);
  if (h24) {
    const h = parseInt(h24[1], 10);
    const m = parseInt(h24[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return { hours: h, minutes: m };
    }
  }

  const h12 = lower.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (h12) {
    let h = parseInt(h12[1], 10);
    const m = parseInt(h12[2] || '0', 10);
    const ampm = h12[3];
    if (h === 12 && ampm === 'am') h = 0;
    else if (h < 12 && ampm === 'pm') h += 12;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return { hours: h, minutes: m };
    }
  }

  return undefined;
}

export function tryParseSchedulePart(text: string): Date | undefined {
  const words = text.toLowerCase().trim().split(/\s+/);

  // Try compound: date + time (e.g. "tomorrow afternoon", "friday 3pm")
  for (let split = 1; split < words.length; split++) {
    const dateStr = words.slice(0, split).join(' ');
    const timeStr = words.slice(split).join(' ');

    const baseDate = parseDateHint(dateStr);
    const time = parseTimeHint(timeStr);
    if (baseDate && time) {
      return setTime(baseDate, time.hours, time.minutes);
    }
  }

  // Try as date only (defaults to morning)
  const dateOnly = parseDateHint(text);
  if (dateOnly) {
    return setTimeOfDay(dateOnly, 'morning');
  }

  // Try as time only (defaults to today)
  const timeOnly = parseTimeHint(text);
  if (timeOnly) {
    return setTime(startOfDay(new Date()), timeOnly.hours, timeOnly.minutes);
  }

  return undefined;
}

function cleanTitle(title: string): string {
  return title.replace(/\s+(at|on)\s*$/i, '').trim();
}

export function extractScheduleFromTitle(input: string): ScheduleParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { title: '' };

  const tokens = trimmed.split(/\s+/);
  if (tokens.length < 2) return { title: trimmed };

  // Try progressively larger suffixes (more tokens first = more specific)
  const maxTokens = Math.min(4, tokens.length - 1);
  for (let i = maxTokens; i >= 1; i--) {
    const titlePart = tokens.slice(0, -i).join(' ');
    const schedulePart = tokens.slice(-i).join(' ');

    const parsed = tryParseSchedulePart(schedulePart);
    if (parsed) {
      return { title: cleanTitle(titlePart.trim()), scheduledDate: parsed };
    }
  }

  return { title: trimmed };
}

export function thisWeekend(): Date {
  const now = new Date();
  const day = now.getDay();
  if (day === 6 || day === 0) return startOfDay(now);
  const daysUntilSat = (6 - day + 7) % 7;
  return addDays(startOfDay(now), daysUntilSat);
}

export function nextWeekMonday(): Date {
  const now = new Date();
  const day = now.getDay();
  const daysUntilMon = (1 - day + 7) % 7;
  const offset = daysUntilMon === 0 ? 7 : daysUntilMon;
  return addDays(startOfDay(now), offset);
}
