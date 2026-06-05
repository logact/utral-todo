export function formatDate(date: Date | undefined): string {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateShort(date: Date | undefined): string {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function isToday(date: Date | undefined): boolean {
  if (!date) return false;
  const d = new Date(date);
  const today = new Date();
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function isSameDay(a: Date, b: Date): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getDate() === db.getDate() &&
    da.getMonth() === db.getMonth() &&
    da.getFullYear() === db.getFullYear()
  );
}

export function addWeeks(date: Date, weeks: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + weeks * 7);
  return result;
}

export function startOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setDate(1);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function endOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 1);
  result.setDate(0);
  result.setHours(23, 59, 59, 999);
  return result;
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function nextWeekday(targetDay: number): Date {
  const now = new Date();
  const today = now.getDay();
  const daysUntil = (targetDay - today + 7) % 7;
  return addDays(startOfDay(now), daysUntil);
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function getMonthGrid(date: Date): Date[] {
  const start = startOfMonth(date);
  const dayOfWeek = start.getDay();
  // Monday-based: Mon=0, Sun=6
  const paddingStart = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const firstGridDay = addDays(start, -paddingStart);
  return Array.from({ length: 42 }, (_, i) => addDays(firstGridDay, i));
}

export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatElapsedTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatTime(date: Date | undefined): string {
  if (!date) return '';
  return new Date(date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export function getTimeOfDay(date: Date | undefined): TimeOfDay {
  if (!date) return 'morning';
  const hour = new Date(date).getHours();
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17) return 'evening';
  return 'morning';
}

export function setTimeOfDay(date: Date, tod: TimeOfDay): Date {
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

export function timeOfDayLabel(tod: TimeOfDay): string {
  switch (tod) {
    case 'morning':
      return 'Morning';
    case 'afternoon':
      return 'Afternoon';
    case 'evening':
      return 'Evening';
  }
}

export function setTime(date: Date, hours: number, minutes: number): Date {
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

export function addMinutes(date: Date, minutes: number): Date {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() + minutes);
  return result;
}

export function getHoursMinutes(date: Date): { hours: number; minutes: number } {
  const d = new Date(date);
  return { hours: d.getHours(), minutes: d.getMinutes() };
}

export function toTimeInputValue(date: Date | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function parseTimeInput(timeStr: string, baseDate: Date): Date | undefined {
  if (!timeStr) return undefined;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return undefined;
  return setTime(baseDate, hours, minutes);
}
