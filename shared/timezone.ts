import type { RecurrenceType } from './types.ts';

export const DEFAULT_TIMEZONE = 'Asia/Karachi';

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour === '24' ? '0' : map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: WEEKDAY_MAP[map.weekday] ?? 0,
  };
}

export function isValidDateStr(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function isValidTimeStr(timeStr: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(timeStr)) return false;
  const [h, m] = timeStr.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/**
 * Converts a wall-clock YYYY-MM-DD and HH:mm in `timeZone` (defaults to Asia/Karachi)
 * into a canonical UTC ISO timestamp string.
 */
export function localDateTimeToUtcIso(
  dateStr: string,
  timeStr: string,
  timeZone: string = DEFAULT_TIMEZONE
): string {
  if (!isValidDateStr(dateStr)) {
    throw new Error(`Invalid date format: "${dateStr}". Expected YYYY-MM-DD.`);
  }
  if (!isValidTimeStr(timeStr)) {
    throw new Error(`Invalid time format: "${timeStr}". Expected HH:mm.`);
  }

  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);

  // Fast exact path for Pakistan Standard Time (fixed UTC+05:00, no DST)
  if (timeZone === 'Asia/Karachi') {
    const utcMs = Date.UTC(year, month - 1, day, hour - 5, minute, 0, 0);
    return new Date(utcMs).toISOString();
  }

  // General IANA timezone two-pass offset resolution
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = targetAsUtc;
  for (let i = 0; i < 2; i++) {
    const parts = getZonedParts(new Date(guess), timeZone);
    const zonedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      0
    );
    const diff = zonedAsUtc - targetAsUtc;
    guess -= diff;
  }
  return new Date(guess).toISOString();
}

export function utcIsoToLocalParts(
  utcIso: string,
  timeZone: string = DEFAULT_TIMEZONE
): {
  date: string;
  time: string;
  displayDate: string;
  displayTime: string;
  weekday: number;
  tzShort: string;
} {
  const dt = new Date(utcIso);
  if (Number.isNaN(dt.getTime())) {
    return {
      date: '',
      time: '',
      displayDate: 'Invalid date',
      displayTime: '',
      weekday: 0,
      tzShort: timeZone === 'Asia/Karachi' ? 'PKT' : timeZone,
    };
  }
  const p = getZonedParts(dt, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  const time = `${pad(p.hour)}:${pad(p.minute)}`;

  const displayDate = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(dt);

  const displayTime = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(dt);

  return {
    date,
    time,
    displayDate,
    displayTime,
    weekday: p.weekday,
    tzShort: timeZone === 'Asia/Karachi' ? 'PKT' : timeZone,
  };
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function getWeekdayOfDateStr(
  dateStr: string,
  timeStr: string = '12:00',
  timeZone: string = DEFAULT_TIMEZONE
): number {
  const utcIso = localDateTimeToUtcIso(dateStr, timeStr, timeZone);
  return getZonedParts(new Date(utcIso), timeZone).weekday;
}

/**
 * Computes the next scheduled occurrence strictly after `afterDate` (or null for one-time past schedules).
 */
export function computeNextOccurrence(params: {
  scheduledDate: string;
  scheduledTime: string;
  recurrence: RecurrenceType;
  customDays?: number[];
  timeZone?: string;
  afterDate?: Date;
}): { scheduledDate: string; scheduledTime: string; nextRunUtc: string } | null {
  const tz = params.timeZone || DEFAULT_TIMEZONE;
  const afterMs = (params.afterDate ?? new Date()).getTime();

  if (params.recurrence === 'once') {
    const runUtc = localDateTimeToUtcIso(params.scheduledDate, params.scheduledTime, tz);
    if (new Date(runUtc).getTime() > afterMs) {
      return {
        scheduledDate: params.scheduledDate,
        scheduledTime: params.scheduledTime,
        nextRunUtc: runUtc,
      };
    }
    return null;
  }

  let candidateDate = params.scheduledDate;
  if (params.recurrence === 'daily') {
    for (let i = 0; i < 400; i++) {
      const runUtc = localDateTimeToUtcIso(candidateDate, params.scheduledTime, tz);
      if (new Date(runUtc).getTime() > afterMs) {
        return {
          scheduledDate: candidateDate,
          scheduledTime: params.scheduledTime,
          nextRunUtc: runUtc,
        };
      }
      candidateDate = addDaysToDateStr(candidateDate, 1);
    }
    return null;
  }

  if (params.recurrence === 'weekly') {
    for (let i = 0; i < 104; i++) {
      const runUtc = localDateTimeToUtcIso(candidateDate, params.scheduledTime, tz);
      if (new Date(runUtc).getTime() > afterMs) {
        return {
          scheduledDate: candidateDate,
          scheduledTime: params.scheduledTime,
          nextRunUtc: runUtc,
        };
      }
      candidateDate = addDaysToDateStr(candidateDate, 7);
    }
    return null;
  }

  // Custom selected weekdays [0..6]
  const allowedDays = Array.isArray(params.customDays) ? params.customDays : [];
  if (allowedDays.length === 0) return null;

  for (let i = 0; i < 400; i++) {
    const weekday = getWeekdayOfDateStr(candidateDate, params.scheduledTime, tz);
    if (allowedDays.includes(weekday)) {
      const runUtc = localDateTimeToUtcIso(candidateDate, params.scheduledTime, tz);
      if (new Date(runUtc).getTime() > afterMs) {
        return {
          scheduledDate: candidateDate,
          scheduledTime: params.scheduledTime,
          nextRunUtc: runUtc,
        };
      }
    }
    candidateDate = addDaysToDateStr(candidateDate, 1);
  }
  return null;
}

export function getNowInTimeZone(
  timeZone: string = DEFAULT_TIMEZONE,
  now: Date = new Date()
): {
  date: string;
  time: string;
  display: string;
  tzShort: string;
} {
  const parts = utcIsoToLocalParts(now.toISOString(), timeZone);
  return {
    date: parts.date,
    time: parts.time,
    display: `${parts.displayDate} · ${parts.displayTime}`,
    tzShort: parts.tzShort,
  };
}
