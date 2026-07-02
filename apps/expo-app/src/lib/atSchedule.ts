// Inline "@" scheduling shorthand for the Quick Add input.
//
// Ported from the desktop app (apps/desktop/src/utils/atScheduleParser.ts,
// scheduleParser.ts, date.ts) and consolidated into one self-contained module.
// Parses tokens like "@tomorrow", "@friday 3pm", "@today 14:30" out of the
// title and returns the remaining title plus a scheduledDate.

// ── Date helpers ─────────────────────────────────────────────────────────────

type TimeOfDay = 'morning' | 'afternoon' | 'evening';

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function setTime(date: Date, hours: number, minutes: number): Date {
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function setTimeOfDay(date: Date, tod: TimeOfDay): Date {
  const result = new Date(date);
  switch (tod) {
    case 'morning':
      result.setHours(9, 0, 0, 0);
      break;
    case 'afternoon':
      result.setHours(14, 0, 0, 0);
      break;
    case 'evening':
      result.setHours(19, 0, 0, 0);
      break;
  }
  return result;
}

// ── Keyword parsing ──────────────────────────────────────────────────────────

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

// ── "@" token extraction ─────────────────────────────────────────────────────

export interface AtScheduleResult {
  title: string;
  scheduledDate?: Date;
}

export function extractAtSchedule(input: string): AtScheduleResult {
  const trimmed = input.trim();
  if (!trimmed) return { title: '' };

  const tokens = trimmed.split(/\s+/);
  if (tokens.length === 0) return { title: trimmed };

  // Find first token starting with @
  const atIndex = tokens.findIndex((t) => t.startsWith('@'));
  if (atIndex === -1) return { title: trimmed };

  // Handle "@token" or "@ token" (space after @)
  const atToken = tokens[atIndex];
  let scheduleTokens: string[];

  if (atToken === '@') {
    // @ is standalone, next token is the schedule start
    if (atIndex + 1 >= tokens.length) return { title: trimmed };
    scheduleTokens = tokens.slice(atIndex + 1);
  } else {
    // @ is prefix: @tomorrow
    scheduleTokens = [atToken.slice(1), ...tokens.slice(atIndex + 1)];
  }

  // Try progressively longer combinations (longest first = most specific)
  const maxTry = Math.min(4, scheduleTokens.length);
  for (let i = maxTry; i >= 1; i--) {
    const candidate = scheduleTokens.slice(0, i).join(' ');
    const parsed = tryParseSchedulePart(candidate);
    if (parsed) {
      const consumed = atToken === '@' ? i + 1 : i;
      const titleTokens = [
        ...tokens.slice(0, atIndex),
        ...tokens.slice(atIndex + consumed),
      ];

      return { title: titleTokens.join(' ').trim(), scheduledDate: parsed };
    }
  }

  // No valid schedule found — return as-is (keep the @ tokens)
  return { title: trimmed };
}

// ── Preview formatting ───────────────────────────────────────────────────────

/** Human-friendly label for a parsed schedule, e.g. "Tomorrow · 2:00 PM". */
export function formatSchedulePreview(date: Date): string {
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const dayDiff = Math.round((target.getTime() - today.getTime()) / 86400000);

  let dayLabel: string;
  if (dayDiff === 0) dayLabel = 'Today';
  else if (dayDiff === 1) dayLabel = 'Tomorrow';
  else if (dayDiff > 1 && dayDiff < 7) {
    dayLabel = date.toLocaleDateString('en-US', { weekday: 'long' });
  } else {
    dayLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  const timeLabel = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${dayLabel} · ${timeLabel}`;
}
