import { EventEmitter } from 'node:events';
import type { DBInstance } from './db.ts';
import { logActivity } from './db.ts';
import {
  computeNextOccurrence,
  DEFAULT_TIMEZONE,
  isValidDateStr,
  isValidTimeStr,
  localDateTimeToUtcIso,
} from '../shared/timezone.ts';
import type {
  ConversationCategory,
  RecurrenceType,
  ReplyTone,
  ScheduleExecution,
  ScheduleStatus,
  ScheduledMessage,
  SupportedLanguage,
} from '../shared/types.ts';

export const schedulerEvents = new EventEmitter();

// Schedules that become due more than 2 minutes before current check (e.g. while app was closed)
// are flagged as 'missed' so the user receives a missed-schedule alert upon launch.
const MISSED_THRESHOLD_MS = 2 * 60 * 1000;

function safeParseDays(raw: unknown): number[] {
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((n) => typeof n === 'number' && n >= 0 && n <= 6)
      : [];
  } catch {
    return [];
  }
}

export function mapScheduleRow(row: Record<string, unknown>): ScheduledMessage {
  return {
    id: String(row.id),
    conversationId: row.conversation_id ? String(row.conversation_id) : null,
    recipientLabel: String(row.recipient_label),
    recipientType: (row.recipient_type as ConversationCategory) || 'contact',
    messageText: String(row.message_text),
    language: (row.language as SupportedLanguage) || 'English',
    tone: (row.tone as ReplyTone) || 'Friendly',
    customInstruction: row.custom_instruction
      ? String(row.custom_instruction)
      : null,
    scheduledDate: String(row.scheduled_date),
    scheduledTime: String(row.scheduled_time),
    timezone: String(row.timezone || DEFAULT_TIMEZONE),
    nextRunUtc: String(row.next_run_utc),
    recurrence: (row.recurrence as RecurrenceType) || 'once',
    customDays: safeParseDays(row.custom_days),
    status: (row.status as ScheduleStatus) || 'upcoming',
    lastNotifiedForRunUtc: row.last_notified_for_run_utc
      ? String(row.last_notified_for_run_utc)
      : null,
    notifiedAt: row.notified_at ? String(row.notified_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapExecutionRow(row: Record<string, unknown>): ScheduleExecution {
  return {
    id: String(row.id),
    scheduleId: String(row.schedule_id),
    recipientLabel: String(row.recipient_label),
    recipientType: (row.recipient_type as ConversationCategory) || 'contact',
    messageText: String(row.message_text),
    scheduledDate: String(row.scheduled_date),
    scheduledTime: String(row.scheduled_time),
    timezone: String(row.timezone || DEFAULT_TIMEZONE),
    recurrence: (row.recurrence as RecurrenceType) || 'once',
    scheduledRunUtc: String(row.scheduled_run_utc),
    status: row.status as ScheduleExecution['status'],
    notifiedAt: row.notified_at ? String(row.notified_at) : null,
    confirmedSentAt: row.confirmed_sent_at ? String(row.confirmed_sent_at) : null,
  };
}

export interface CreateScheduleInput {
  conversationId?: string | null;
  recipientLabel: string;
  recipientType?: ConversationCategory;
  messageText: string;
  language?: SupportedLanguage;
  tone?: ReplyTone;
  customInstruction?: string | null;
  scheduledDate: string;
  scheduledTime: string;
  timezone?: string;
  recurrence?: RecurrenceType;
  customDays?: number[];
}

export function validateScheduleInput(
  input: CreateScheduleInput,
  now: Date = new Date()
): {
  timezone: string;
  recurrence: RecurrenceType;
  customDays: number[];
  nextRunUtc: string;
  effectiveDate: string;
  effectiveTime: string;
} {
  if (!input.recipientLabel?.trim()) {
    throw new Error('Contact or group label is required.');
  }
  if (!input.messageText?.trim()) {
    throw new Error('Scheduled message text cannot be empty.');
  }
  if (!isValidDateStr(input.scheduledDate)) {
    throw new Error('Please choose a valid schedule date (YYYY-MM-DD).');
  }
  if (!isValidTimeStr(input.scheduledTime)) {
    throw new Error('Please choose a valid schedule time (HH:mm).');
  }

  const timezone = input.timezone?.trim() || DEFAULT_TIMEZONE;
  const recurrence: RecurrenceType = input.recurrence || 'once';
  const customDays = Array.isArray(input.customDays)
    ? Array.from(
        new Set(input.customDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))
      ).sort((a, b) => a - b)
    : [];

  if (recurrence === 'custom' && customDays.length === 0) {
    throw new Error('Select at least one day of the week for a custom recurring schedule.');
  }

  if (recurrence === 'once') {
    const nextRunUtc = localDateTimeToUtcIso(
      input.scheduledDate,
      input.scheduledTime,
      timezone
    );
    if (new Date(nextRunUtc).getTime() <= now.getTime() - 60_000) {
      throw new Error(
        `Scheduled date & time must be in the future (${timezone}).`
      );
    }
    return {
      timezone,
      recurrence,
      customDays,
      nextRunUtc,
      effectiveDate: input.scheduledDate,
      effectiveTime: input.scheduledTime,
    };
  }

  const next = computeNextOccurrence({
    scheduledDate: input.scheduledDate,
    scheduledTime: input.scheduledTime,
    recurrence,
    customDays,
    timeZone: timezone,
    afterDate: new Date(now.getTime() - 60_000),
  });

  if (!next) {
    throw new Error('Could not compute next occurrence for this recurrence rule.');
  }

  return {
    timezone,
    recurrence,
    customDays,
    nextRunUtc: next.nextRunUtc,
    effectiveDate: next.scheduledDate,
    effectiveTime: next.scheduledTime,
  };
}

export function createSchedule(
  db: DBInstance,
  input: CreateScheduleInput,
  now: Date = new Date()
): ScheduledMessage {
  const validated = validateScheduleInput(input, now);
  const id = crypto.randomUUID();
  const nowIso = now.toISOString();

  db.prepare(
    `INSERT INTO scheduled_messages (
      id, conversation_id, recipient_label, recipient_type, message_text,
      language, tone, custom_instruction, scheduled_date, scheduled_time,
      timezone, next_run_utc, recurrence, custom_days, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', ?, ?)`
  ).run(
    id,
    input.conversationId || null,
    input.recipientLabel.trim(),
    input.recipientType || 'contact',
    input.messageText.trim(),
    input.language || 'English',
    input.tone || 'Friendly',
    input.customInstruction?.trim() || null,
    validated.effectiveDate,
    validated.effectiveTime,
    validated.timezone,
    validated.nextRunUtc,
    validated.recurrence,
    JSON.stringify(validated.customDays),
    nowIso,
    nowIso
  );

  logActivity(
    db,
    'schedule_created',
    `Scheduled ${validated.recurrence} reminder for ${input.recipientLabel.trim()} (${validated.effectiveDate} ${validated.effectiveTime} ${validated.timezone})`,
    id
  );

  const row = db
    .prepare('SELECT * FROM scheduled_messages WHERE id = ?')
    .get(id) as Record<string, unknown>;
  return mapScheduleRow(row);
}

export function updateSchedule(
  db: DBInstance,
  id: string,
  input: Partial<CreateScheduleInput>,
  now: Date = new Date()
): ScheduledMessage {
  const existingRow = db
    .prepare('SELECT * FROM scheduled_messages WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;

  if (!existingRow) {
    throw new Error('Schedule not found.');
  }

  const existing = mapScheduleRow(existingRow);
  const merged: CreateScheduleInput = {
    conversationId:
      input.conversationId !== undefined
        ? input.conversationId
        : existing.conversationId,
    recipientLabel: input.recipientLabel ?? existing.recipientLabel,
    recipientType: input.recipientType ?? existing.recipientType,
    messageText: input.messageText ?? existing.messageText,
    language: input.language ?? existing.language,
    tone: input.tone ?? existing.tone,
    customInstruction:
      input.customInstruction !== undefined
        ? input.customInstruction
        : existing.customInstruction,
    scheduledDate: input.scheduledDate ?? existing.scheduledDate,
    scheduledTime: input.scheduledTime ?? existing.scheduledTime,
    timezone: input.timezone ?? existing.timezone,
    recurrence: input.recurrence ?? existing.recurrence,
    customDays: input.customDays ?? existing.customDays,
  };

  const validated = validateScheduleInput(merged, now);
  const nowIso = now.toISOString();

  db.prepare(
    `UPDATE scheduled_messages
     SET conversation_id = ?, recipient_label = ?, recipient_type = ?,
         message_text = ?, language = ?, tone = ?, custom_instruction = ?,
         scheduled_date = ?, scheduled_time = ?, timezone = ?, next_run_utc = ?,
         recurrence = ?, custom_days = ?, status = 'upcoming',
         completed_at = NULL, updated_at = ?
     WHERE id = ?`
  ).run(
    merged.conversationId || null,
    merged.recipientLabel.trim(),
    merged.recipientType || 'contact',
    merged.messageText.trim(),
    merged.language || 'English',
    merged.tone || 'Friendly',
    merged.customInstruction?.trim() || null,
    validated.effectiveDate,
    validated.effectiveTime,
    validated.timezone,
    validated.nextRunUtc,
    validated.recurrence,
    JSON.stringify(validated.customDays),
    nowIso,
    id
  );

  logActivity(
    db,
    'schedule_updated',
    `Updated schedule for ${merged.recipientLabel.trim()} (${validated.effectiveDate} ${validated.effectiveTime})`,
    id
  );

  const updated = db
    .prepare('SELECT * FROM scheduled_messages WHERE id = ?')
    .get(id) as Record<string, unknown>;
  return mapScheduleRow(updated);
}

export function cancelSchedule(db: DBInstance, id: string): ScheduledMessage {
  const existingRow = db
    .prepare('SELECT * FROM scheduled_messages WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;
  if (!existingRow) {
    throw new Error('Schedule not found.');
  }
  const nowIso = new Date().toISOString();
  db.prepare(
    `UPDATE scheduled_messages SET status = 'cancelled', updated_at = ? WHERE id = ?`
  ).run(nowIso, id);
  db.prepare(
    `UPDATE scheduled_executions SET status = 'cancelled'
     WHERE schedule_id = ? AND status IN ('due', 'missed')`
  ).run(id);

  logActivity(
    db,
    'schedule_cancelled',
    `Cancelled schedule for ${String(existingRow.recipient_label)}`,
    id
  );

  const updated = db
    .prepare('SELECT * FROM scheduled_messages WHERE id = ?')
    .get(id) as Record<string, unknown>;
  return mapScheduleRow(updated);
}

export function deleteSchedule(db: DBInstance, id: string): boolean {
  const existingRow = db
    .prepare('SELECT * FROM scheduled_messages WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;
  if (!existingRow) return false;
  db.prepare('DELETE FROM scheduled_messages WHERE id = ?').run(id);
  logActivity(
    db,
    'data_deleted',
    `Deleted schedule for ${String(existingRow.recipient_label)}`,
    id
  );
  return true;
}

/**
 * Evaluates all upcoming schedules against `now`.
 * - Prevents duplicate notifications/executions via SQLite UNIQUE(schedule_id, scheduled_run_utc)
 *   AND `last_notified_for_run_utc`.
 * - Detects missed schedules (e.g. after Windows restart or app closure).
 * - Advances recurring schedules to their next future occurrence.
 */
export function runSchedulerTick(
  db: DBInstance,
  now: Date = new Date()
): ScheduleExecution[] {
  const nowIso = now.toISOString();
  const nowMs = now.getTime();

  const dueRows = db
    .prepare(
      `SELECT * FROM scheduled_messages
       WHERE status = 'upcoming' AND next_run_utc <= ?
       ORDER BY next_run_utc ASC`
    )
    .all(nowIso) as Record<string, unknown>[];

  if (dueRows.length === 0) return [];

  const newlyTriggered: ScheduleExecution[] = [];

  const insertExecution = db.prepare(
    `INSERT OR IGNORE INTO scheduled_executions (
      id, schedule_id, scheduled_run_utc, status, notified_at
    ) VALUES (?, ?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    for (const row of dueRows) {
      const sched = mapScheduleRow(row);

      // Guard against duplicate processing for the exact same scheduled run timestamp
      if (sched.lastNotifiedForRunUtc === sched.nextRunUtc) {
        continue;
      }

      const runMs = new Date(sched.nextRunUtc).getTime();
      const isMissed = nowMs - runMs > MISSED_THRESHOLD_MS;
      const execStatus: 'due' | 'missed' = isMissed ? 'missed' : 'due';
      const execId = crypto.randomUUID();

      const info = insertExecution.run(
        execId,
        sched.id,
        sched.nextRunUtc,
        execStatus,
        nowIso
      );

      if (info.changes > 0) {
        logActivity(
          db,
          isMissed ? 'schedule_missed' : 'schedule_due',
          isMissed
            ? `Missed scheduled message for ${sched.recipientLabel} (${sched.scheduledDate} ${sched.scheduledTime} ${sched.timezone})`
            : `Scheduled message is due for ${sched.recipientLabel} (${sched.scheduledTime} ${sched.timezone})`,
          sched.id
        );

        const joined = db
          .prepare(
            `SELECT e.*, s.recipient_label, s.recipient_type, s.message_text,
                    s.scheduled_date, s.scheduled_time, s.timezone, s.recurrence
             FROM scheduled_executions e
             JOIN scheduled_messages s ON s.id = e.schedule_id
             WHERE e.id = ?`
          )
          .get(execId) as Record<string, unknown> | undefined;

        if (joined) {
          newlyTriggered.push(mapExecutionRow(joined));
        }
      }

      if (sched.recurrence === 'once') {
        db.prepare(
          `UPDATE scheduled_messages
           SET status = ?, last_notified_for_run_utc = ?, notified_at = ?, updated_at = ?
           WHERE id = ?`
        ).run(execStatus, sched.nextRunUtc, nowIso, nowIso, sched.id);
      } else {
        // Recurring schedule: compute the next strictly-future occurrence after `now`
        const nextOcc = computeNextOccurrence({
          scheduledDate: sched.scheduledDate,
          scheduledTime: sched.scheduledTime,
          recurrence: sched.recurrence,
          customDays: sched.customDays,
          timeZone: sched.timezone,
          afterDate: now,
        });

        if (nextOcc) {
          db.prepare(
            `UPDATE scheduled_messages
             SET scheduled_date = ?, scheduled_time = ?, next_run_utc = ?,
                 last_notified_for_run_utc = ?, notified_at = ?, updated_at = ?
             WHERE id = ?`
          ).run(
            nextOcc.scheduledDate,
            nextOcc.scheduledTime,
            nextOcc.nextRunUtc,
            sched.nextRunUtc,
            nowIso,
            nowIso,
            sched.id
          );
        } else {
          db.prepare(
            `UPDATE scheduled_messages
             SET status = ?, last_notified_for_run_utc = ?, notified_at = ?, updated_at = ?
             WHERE id = ?`
          ).run(execStatus, sched.nextRunUtc, nowIso, nowIso, sched.id);
        }
      }
    }
  });

  tx();

  for (const exec of newlyTriggered) {
    schedulerEvents.emit('notification', exec);
  }

  return newlyTriggered;
}

export function confirmExecutionManuallySent(
  db: DBInstance,
  executionId: string,
  now: Date = new Date()
): ScheduleExecution {
  const nowIso = now.toISOString();
  const execRow = db
    .prepare('SELECT * FROM scheduled_executions WHERE id = ?')
    .get(executionId) as Record<string, unknown> | undefined;

  if (!execRow) {
    throw new Error('Scheduled reminder alert not found.');
  }

  const scheduleId = String(execRow.schedule_id);
  const schedRow = db
    .prepare('SELECT * FROM scheduled_messages WHERE id = ?')
    .get(scheduleId) as Record<string, unknown> | undefined;

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE scheduled_executions
       SET status = 'sent_confirmed', confirmed_sent_at = ?
       WHERE id = ?`
    ).run(nowIso, executionId);

    if (schedRow && schedRow.recurrence === 'once') {
      db.prepare(
        `UPDATE scheduled_messages
         SET status = 'sent_confirmed', completed_at = ?, updated_at = ?
         WHERE id = ?`
      ).run(nowIso, nowIso, scheduleId);
    }

    logActivity(
      db,
      'schedule_confirmed',
      `User confirmed manual WhatsApp send to ${String(
        schedRow?.recipient_label || 'recipient'
      )}`,
      scheduleId
    );
  });

  tx();

  const updated = db
    .prepare(
      `SELECT e.*, s.recipient_label, s.recipient_type, s.message_text,
              s.scheduled_date, s.scheduled_time, s.timezone, s.recurrence
       FROM scheduled_executions e
       JOIN scheduled_messages s ON s.id = e.schedule_id
       WHERE e.id = ?`
    )
    .get(executionId) as Record<string, unknown>;
  return mapExecutionRow(updated);
}

export function dismissExecution(db: DBInstance, executionId: string): boolean {
  const execRow = db
    .prepare('SELECT * FROM scheduled_executions WHERE id = ?')
    .get(executionId) as Record<string, unknown> | undefined;
  if (!execRow) return false;

  const scheduleId = String(execRow.schedule_id);
  const schedRow = db
    .prepare('SELECT * FROM scheduled_messages WHERE id = ?')
    .get(scheduleId) as Record<string, unknown> | undefined;

  db.prepare(
    `UPDATE scheduled_executions SET status = 'skipped' WHERE id = ?`
  ).run(executionId);

  if (schedRow && schedRow.recurrence === 'once' && (schedRow.status === 'due' || schedRow.status === 'missed')) {
    db.prepare(
      `UPDATE scheduled_messages SET status = 'cancelled', updated_at = ? WHERE id = ?`
    ).run(new Date().toISOString(), scheduleId);
  }
  return true;
}

export function listActiveNotifications(db: DBInstance): ScheduleExecution[] {
  const rows = db
    .prepare(
      `SELECT e.*, s.recipient_label, s.recipient_type, s.message_text,
              s.scheduled_date, s.scheduled_time, s.timezone, s.recurrence
       FROM scheduled_executions e
       JOIN scheduled_messages s ON s.id = e.schedule_id
       WHERE e.status IN ('due', 'missed')
       ORDER BY e.scheduled_run_utc DESC`
    )
    .all() as Record<string, unknown>[];
  return rows.map(mapExecutionRow);
}

export function listExecutionHistory(db: DBInstance): ScheduleExecution[] {
  const rows = db
    .prepare(
      `SELECT e.*, s.recipient_label, s.recipient_type, s.message_text,
              s.scheduled_date, s.scheduled_time, s.timezone, s.recurrence
       FROM scheduled_executions e
       JOIN scheduled_messages s ON s.id = e.schedule_id
       ORDER BY e.scheduled_run_utc DESC
       LIMIT 100`
    )
    .all() as Record<string, unknown>[];
  return rows.map(mapExecutionRow);
}
