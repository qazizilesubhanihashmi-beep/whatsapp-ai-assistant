import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ActivityLogItem,
  AppSettings,
  Conversation,
  ConversationCategory,
  DashboardSummary,
  ImportantPoint,
  ImportSourceType,
  Message,
  PendingQuestion,
  ReplyHistoryItem,
  ReplyTone,
  SupportedLanguage,
} from '../shared/types.ts';
import { DEFAULT_TIMEZONE } from '../shared/timezone.ts';

export type DBInstance = Database.Database;

const DEFAULT_SETTINGS: AppSettings = {
  defaultLanguage: 'English',
  defaultTone: 'Friendly',
  userDisplayName: 'You',
  timezone: DEFAULT_TIMEZONE,
  desktopNotificationsEnabled: true,
  soundAlertsEnabled: true,
};

export function createDatabase(dbPath?: string): DBInstance {
  const resolvedPath =
    dbPath || path.resolve(process.cwd(), 'data', 'whatsapp-assistant.db');

  if (resolvedPath !== ':memory:') {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'contact',
      source_type TEXT NOT NULL DEFAULT 'paste',
      detected_language TEXT,
      summary TEXT,
      important_points TEXT NOT NULL DEFAULT '[]',
      pending_questions TEXT NOT NULL DEFAULT '[]',
      last_analyzed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      content TEXT NOT NULL,
      sent_at TEXT,
      is_from_me INTEGER NOT NULL DEFAULT 0,
      is_important INTEGER NOT NULL DEFAULT 0,
      importance_reason TEXT,
      needs_reply INTEGER NOT NULL DEFAULT 0,
      detected_language TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(conversation_id, sort_order);

    CREATE TABLE IF NOT EXISTS reply_history (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      conversation_title TEXT NOT NULL,
      target_message_id TEXT,
      target_message_excerpt TEXT,
      reply_text TEXT NOT NULL,
      language TEXT NOT NULL,
      tone TEXT NOT NULL,
      custom_instruction TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      confirmed_sent_at TEXT,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS scheduled_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      recipient_label TEXT NOT NULL,
      recipient_type TEXT NOT NULL DEFAULT 'contact',
      message_text TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'English',
      tone TEXT NOT NULL DEFAULT 'Friendly',
      custom_instruction TEXT,
      scheduled_date TEXT NOT NULL,
      scheduled_time TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'Asia/Karachi',
      next_run_utc TEXT NOT NULL,
      recurrence TEXT NOT NULL DEFAULT 'once',
      custom_days TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'upcoming',
      last_notified_for_run_utc TEXT,
      notified_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_scheduled_status_run
      ON scheduled_messages(status, next_run_utc);

    CREATE TABLE IF NOT EXISTS scheduled_executions (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL,
      scheduled_run_utc TEXT NOT NULL,
      status TEXT NOT NULL,
      notified_at TEXT,
      confirmed_sent_at TEXT,
      FOREIGN KEY (schedule_id) REFERENCES scheduled_messages(id) ON DELETE CASCADE,
      UNIQUE(schedule_id, scheduled_run_utc)
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      action_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      entity_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  return db;
}

let sharedDb: DBInstance | null = null;

export function getDb(): DBInstance {
  if (!sharedDb) {
    sharedDb = createDatabase();
  }
  return sharedDb;
}

export function setDbForTesting(db: DBInstance | null) {
  sharedDb = db;
}

export function logActivity(
  db: DBInstance,
  actionType: string,
  summary: string,
  entityId: string | null = null
) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO activity_log (id, action_type, summary, entity_id, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, actionType, summary, entityId, createdAt);
}

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function mapConversationRow(row: Record<string, unknown>): Conversation {
  return {
    id: String(row.id),
    title: String(row.title),
    category: (row.category as ConversationCategory) || 'contact',
    sourceType: (row.source_type as ImportSourceType) || 'paste',
    detectedLanguage: row.detected_language ? String(row.detected_language) : null,
    summary: row.summary ? String(row.summary) : null,
    importantPoints: safeParseJson<ImportantPoint[]>(
      row.important_points as string,
      []
    ),
    pendingQuestions: safeParseJson<PendingQuestion[]>(
      row.pending_questions as string,
      []
    ),
    lastAnalyzedAt: row.last_analyzed_at ? String(row.last_analyzed_at) : null,
    messageCount:
      typeof row.message_count === 'number' ? row.message_count : undefined,
    importantCount:
      typeof row.important_count === 'number' ? row.important_count : undefined,
    needsReplyCount:
      typeof row.needs_reply_count === 'number'
        ? row.needs_reply_count
        : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapMessageRow(row: Record<string, unknown>): Message {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    sender: String(row.sender),
    content: String(row.content),
    sentAt: row.sent_at ? String(row.sent_at) : null,
    isFromMe: Boolean(row.is_from_me),
    isImportant: Boolean(row.is_important),
    importanceReason: row.importance_reason
      ? String(row.importance_reason)
      : null,
    needsReply: Boolean(row.needs_reply),
    detectedLanguage: row.detected_language
      ? String(row.detected_language)
      : null,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at),
  };
}

export function mapReplyHistoryRow(
  row: Record<string, unknown>
): ReplyHistoryItem {
  return {
    id: String(row.id),
    conversationId: row.conversation_id ? String(row.conversation_id) : null,
    conversationTitle: String(row.conversation_title),
    targetMessageId: row.target_message_id
      ? String(row.target_message_id)
      : null,
    targetMessageExcerpt: row.target_message_excerpt
      ? String(row.target_message_excerpt)
      : null,
    replyText: String(row.reply_text),
    language: row.language as SupportedLanguage,
    tone: row.tone as ReplyTone,
    customInstruction: row.custom_instruction
      ? String(row.custom_instruction)
      : null,
    status: row.status as 'draft' | 'copied' | 'sent_confirmed',
    createdAt: String(row.created_at),
    confirmedSentAt: row.confirmed_sent_at
      ? String(row.confirmed_sent_at)
      : null,
  };
}

export function getSettings(db: DBInstance): AppSettings {
  const rows = db.prepare('SELECT key, value FROM app_settings').all() as {
    key: string;
    value: string;
  }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    defaultLanguage:
      (map.get('defaultLanguage') as SupportedLanguage) ||
      DEFAULT_SETTINGS.defaultLanguage,
    defaultTone:
      (map.get('defaultTone') as ReplyTone) || DEFAULT_SETTINGS.defaultTone,
    userDisplayName:
      map.get('userDisplayName') || DEFAULT_SETTINGS.userDisplayName,
    timezone: map.get('timezone') || DEFAULT_SETTINGS.timezone,
    desktopNotificationsEnabled:
      map.has('desktopNotificationsEnabled')
        ? map.get('desktopNotificationsEnabled') === 'true'
        : DEFAULT_SETTINGS.desktopNotificationsEnabled,
    soundAlertsEnabled:
      map.has('soundAlertsEnabled')
        ? map.get('soundAlertsEnabled') === 'true'
        : DEFAULT_SETTINGS.soundAlertsEnabled,
  };
}

export function saveSettings(
  db: DBInstance,
  partial: Partial<AppSettings>
): AppSettings {
  const current = getSettings(db);
  const next: AppSettings = { ...current, ...partial };
  const upsert = db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  const tx = db.transaction(() => {
    upsert.run('defaultLanguage', next.defaultLanguage);
    upsert.run('defaultTone', next.defaultTone);
    upsert.run('userDisplayName', next.userDisplayName);
    upsert.run('timezone', next.timezone);
    upsert.run(
      'desktopNotificationsEnabled',
      String(next.desktopNotificationsEnabled)
    );
    upsert.run('soundAlertsEnabled', String(next.soundAlertsEnabled));
  });
  tx();
  return next;
}

export function getDashboardSummary(db: DBInstance): DashboardSummary {
  const totalConversations = (
    db.prepare('SELECT COUNT(*) AS count FROM conversations').get() as {
      count: number;
    }
  ).count;

  const totalMessages = (
    db.prepare('SELECT COUNT(*) AS count FROM messages').get() as {
      count: number;
    }
  ).count;

  const totalAnalyzedMessages = (
    db
      .prepare(
        `SELECT COUNT(m.id) AS count
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE c.last_analyzed_at IS NOT NULL`
      )
      .get() as { count: number }
  ).count;

  const repliesGenerated = (
    db.prepare('SELECT COUNT(*) AS count FROM reply_history').get() as {
      count: number;
    }
  ).count;

  const repliesConfirmedSent = (
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM reply_history WHERE status = 'sent_confirmed'`
      )
      .get() as { count: number }
  ).count;

  const upcomingSchedules = (
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM scheduled_messages WHERE status = 'upcoming'`
      )
      .get() as { count: number }
  ).count;

  const dueOrMissedCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM scheduled_executions WHERE status IN ('due', 'missed')`
      )
      .get() as { count: number }
  ).count;

  const recentRows = db
    .prepare(
      `SELECT id, action_type, summary, entity_id, created_at
       FROM activity_log
       ORDER BY created_at DESC
       LIMIT 12`
    )
    .all() as Record<string, unknown>[];

  const recentActivity: ActivityLogItem[] = recentRows.map((r) => ({
    id: String(r.id),
    actionType: String(r.action_type),
    summary: String(r.summary),
    entityId: r.entity_id ? String(r.entity_id) : null,
    createdAt: String(r.created_at),
  }));

  return {
    totalConversations,
    totalAnalyzedMessages,
    totalMessages,
    repliesGenerated,
    repliesConfirmedSent,
    upcomingSchedules,
    dueOrMissedCount,
    recentActivity,
  };
}
