import { tryParseSchedulePart } from './scheduleParser';

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
