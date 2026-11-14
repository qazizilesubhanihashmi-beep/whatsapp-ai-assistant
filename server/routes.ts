import express from 'express';
import type { DBInstance } from './db.ts';
import {
  getDashboardSummary,
  getSettings,
  logActivity,
  mapConversationRow,
  mapMessageRow,
  mapReplyHistoryRow,
  saveSettings,
} from './db.ts';
import {
  analyzeConversationWithGemini,
  GEMINI_MODEL,
  GeminiServiceError,
  generateReplyWithGemini,
  generateScheduledDraftWithGemini,
  getLastGeminiError,
  isGeminiConfigured,
  testGeminiConnection,
} from './gemini.ts';
import { parseWhatsAppInput } from './parser.ts';
import {
  cancelSchedule,
  confirmExecutionManuallySent,
  createSchedule,
  deleteSchedule,
  dismissExecution,
  listActiveNotifications,
  listExecutionHistory,
  mapScheduleRow,
  runSchedulerTick,
  schedulerEvents,
  updateSchedule,
} from './scheduler.ts';
import { DEFAULT_TIMEZONE } from '../shared/timezone.ts';
import type {
  ConversationCategory,
  ImportSourceType,
  Message,
  ReplyTone,
  ScheduleExecution,
  SupportedLanguage,
} from '../shared/types.ts';

export function createApiRouter(db: DBInstance) {
  const router = express.Router();

  // Health & status
  router.get('/health', (_req, res) => {
    let sqliteReady = false;
    try {
      db.prepare('SELECT 1').get();
      sqliteReady = true;
    } catch {
      sqliteReady = false;
    }

    const settings = sqliteReady ? getSettings(db) : null;
    res.json({
      sqliteReady,
      geminiConfigured: isGeminiConfigured(),
      model: GEMINI_MODEL,
      timezone: settings?.timezone || DEFAULT_TIMEZONE,
      lastGeminiError: getLastGeminiError(),
      host: process.env.HOST || '0.0.0.0',
      port: Number(process.env.PORT || 3000),
    });
  });

  router.post('/health/test-gemini', async (_req, res) => {
    try {
      const result = await testGeminiConnection();
      res.json(result);
    } catch (err) {
      if (err instanceof GeminiServiceError) {
        return res.status(err.status).json({ ok: false, error: err.message, code: err.code });
      }
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Unexpected Gemini error',
      });
    }
  });

  // Dashboard
  router.get('/dashboard', (_req, res) => {
    res.json(getDashboardSummary(db));
  });

  // Conversations list
  router.get('/conversations', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT c.*,
                COUNT(m.id) AS message_count,
                SUM(CASE WHEN m.is_important = 1 THEN 1 ELSE 0 END) AS important_count,
                SUM(CASE WHEN m.needs_reply = 1 THEN 1 ELSE 0 END) AS needs_reply_count
         FROM conversations c
         LEFT JOIN messages m ON m.conversation_id = c.id
         GROUP BY c.id
         ORDER BY c.updated_at DESC`
      )
      .all() as Record<string, unknown>[];

    res.json(rows.map(mapConversationRow));
  });

  // Single conversation + messages
  router.get('/conversations/:id', (req, res) => {
    const convRow = db
      .prepare('SELECT * FROM conversations WHERE id = ?')
      .get(req.params.id) as Record<string, unknown> | undefined;

    if (!convRow) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    const msgRows = db
      .prepare(
        `SELECT * FROM messages WHERE conversation_id = ? ORDER BY sort_order ASC, created_at ASC`
      )
      .all(req.params.id) as Record<string, unknown>[];

    res.json({
      conversation: mapConversationRow(convRow),
      messages: msgRows.map(mapMessageRow),
    });
  });

  // Import or paste messages
  router.post('/conversations/import', (req, res) => {
    try {
      const {
        title,
        category = 'contact',
        sourceType = 'paste',
        rawText,
        messages: manualMessages,
        fallbackSender,
      } = req.body as {
        title?: string;
        category?: ConversationCategory;
        sourceType?: ImportSourceType;
        rawText?: string;
        messages?: {
          sender: string;
          content: string;
          sentAt?: string | null;
          isFromMe?: boolean;
        }[];
        fallbackSender?: string;
      };

      const settings = getSettings(db);
      let parsedMessages: {
        sender: string;
        content: string;
        sentAt: string | null;
        isFromMe: boolean;
      }[] = [];
      let inferredTitle = title?.trim() || '';
      let skippedSystemLines = 0;

      if (sourceType === 'manual' && Array.isArray(manualMessages)) {
        const cleaned = manualMessages
          .filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0)
          .map((m) => ({
            sender: (m.sender || fallbackSender || 'Contact').trim(),
            content: m.content.trim(),
            sentAt: m.sentAt?.trim() || null,
            isFromMe: Boolean(m.isFromMe),
          }));

        if (cleaned.length === 0) {
          return res.status(400).json({ error: 'Please add at least one non-empty message.' });
        }
        parsedMessages = cleaned;
        if (!inferredTitle) {
          const other = cleaned.find((m) => !m.isFromMe);
          inferredTitle = other?.sender || 'Manual Conversation';
        }
      } else {
        const parsed = parseWhatsAppInput(rawText || '', {
          fallbackSender: fallbackSender || title || 'Contact',
          userDisplayName: settings.userDisplayName,
        });
        parsedMessages = parsed.messages;
        skippedSystemLines = parsed.skippedSystemLines;
        if (!inferredTitle) {
          inferredTitle = parsed.inferredTitle;
        }
      }

      const convId = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const validCategory: ConversationCategory =
        category === 'group' ? 'group' : 'contact';
      const validSource: ImportSourceType =
        sourceType === 'export' || sourceType === 'manual' ? sourceType : 'paste';

      const insertConv = db.prepare(
        `INSERT INTO conversations (
          id, title, category, source_type, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      );
      const insertMsg = db.prepare(
        `INSERT INTO messages (
          id, conversation_id, sender, content, sent_at, is_from_me, sort_order, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );

      const tx = db.transaction(() => {
        insertConv.run(convId, inferredTitle, validCategory, validSource, nowIso, nowIso);
        parsedMessages.forEach((m, index) => {
          insertMsg.run(
            crypto.randomUUID(),
            convId,
            m.sender,
            m.content,
            m.sentAt,
            m.isFromMe ? 1 : 0,
            index,
            nowIso
          );
        });
        logActivity(
          db,
          'import',
          `Imported ${parsedMessages.length} message${
            parsedMessages.length === 1 ? '' : 's'
          } into "${inferredTitle}" (${validSource})`,
          convId
        );
      });

      tx();

      const convRow = db
        .prepare('SELECT * FROM conversations WHERE id = ?')
        .get(convId) as Record<string, unknown>;
      const msgRows = db
        .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY sort_order ASC')
        .all(convId) as Record<string, unknown>[];

      res.status(201).json({
        conversation: mapConversationRow({
          ...convRow,
          message_count: msgRows.length,
        }),
        messages: msgRows.map(mapMessageRow),
        skippedSystemLines,
      });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to import messages.',
      });
    }
  });

  // Preview parser without saving
  router.post('/conversations/preview-parse', (req, res) => {
    try {
      const { rawText, fallbackSender } = req.body as {
        rawText?: string;
        fallbackSender?: string;
      };
      const settings = getSettings(db);
      const result = parseWhatsAppInput(rawText || '', {
        fallbackSender,
        userDisplayName: settings.userDisplayName,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Could not parse text.',
      });
    }
  });

  // Add message manually into existing conversation
  router.post('/conversations/:id/messages', (req, res) => {
    const convRow = db
      .prepare('SELECT * FROM conversations WHERE id = ?')
      .get(req.params.id) as Record<string, unknown> | undefined;

    if (!convRow) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    const { sender, content, sentAt, isFromMe } = req.body as {
      sender?: string;
      content?: string;
      sentAt?: string;
      isFromMe?: boolean;
    };

    if (!content?.trim()) {
      return res.status(400).json({ error: 'Message text cannot be empty.' });
    }

    const maxOrderRow = db
      .prepare(
        'SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM messages WHERE conversation_id = ?'
      )
      .get(req.params.id) as { max_order: number };

    const msgId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const cleanSender =
      sender?.trim() || (isFromMe ? getSettings(db).userDisplayName : String(convRow.title));

    db.prepare(
      `INSERT INTO messages (
        id, conversation_id, sender, content, sent_at, is_from_me, sort_order, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      msgId,
      req.params.id,
      cleanSender,
      content.trim(),
      sentAt?.trim() || null,
      isFromMe ? 1 : 0,
      maxOrderRow.max_order + 1,
      nowIso
    );

    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(
      nowIso,
      req.params.id
    );

    const inserted = db
      .prepare('SELECT * FROM messages WHERE id = ?')
      .get(msgId) as Record<string, unknown>;
    res.status(201).json(mapMessageRow(inserted));
  });

  // Delete conversation
  router.delete('/conversations/:id', (req, res) => {
    const convRow = db
      .prepare('SELECT title FROM conversations WHERE id = ?')
      .get(req.params.id) as { title: string } | undefined;

    if (!convRow) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    db.prepare('DELETE FROM conversations WHERE id = ?').run(req.params.id);
    logActivity(
      db,
      'data_deleted',
      `Deleted conversation "${convRow.title}"`,
      req.params.id
    );
    res.json({ deleted: true });
  });

  // Analyze conversation with Gemini
  router.post('/conversations/:id/analyze', async (req, res) => {
    try {
      const convRow = db
        .prepare('SELECT * FROM conversations WHERE id = ?')
        .get(req.params.id) as Record<string, unknown> | undefined;

      if (!convRow) {
        return res.status(404).json({ error: 'Conversation not found.' });
      }

      const msgRows = db
        .prepare(
          'SELECT * FROM messages WHERE conversation_id = ? ORDER BY sort_order ASC'
        )
        .all(req.params.id) as Record<string, unknown>[];
      const messages = msgRows.map(mapMessageRow);

      const analysis = await analyzeConversationWithGemini({
        title: String(convRow.title),
        category: String(convRow.category),
        messages,
      });

      const nowIso = new Date().toISOString();
      const pendingQuestions = analysis.questions.map((q) => ({
        ...q,
        answered: false,
      }));

      const updateMsg = db.prepare(
        `UPDATE messages
         SET is_important = ?, importance_reason = ?, needs_reply = ?, detected_language = ?
         WHERE id = ? AND conversation_id = ?`
      );

      const tx = db.transaction(() => {
        db.prepare(
          `UPDATE conversations
           SET detected_language = ?, summary = ?, important_points = ?,
               pending_questions = ?, last_analyzed_at = ?, updated_at = ?
           WHERE id = ?`
        ).run(
          analysis.detectedLanguage,
          analysis.summary,
          JSON.stringify(analysis.importantPoints),
          JSON.stringify(pendingQuestions),
          nowIso,
          nowIso,
          req.params.id
        );

        for (const flag of analysis.messageFlags) {
          updateMsg.run(
            flag.isImportant ? 1 : 0,
            flag.importanceReason || null,
            flag.needsReply ? 1 : 0,
            flag.detectedLanguage || null,
            flag.messageId,
            req.params.id
          );
        }

        logActivity(
          db,
          'analyze',
          `Analyzed "${String(convRow.title)}" (${messages.length} messages, detected ${analysis.detectedLanguage})`,
          req.params.id
        );
      });

      tx();

      const updatedConv = db
        .prepare('SELECT * FROM conversations WHERE id = ?')
        .get(req.params.id) as Record<string, unknown>;
      const updatedMsgs = db
        .prepare(
          'SELECT * FROM messages WHERE conversation_id = ? ORDER BY sort_order ASC'
        )
        .all(req.params.id) as Record<string, unknown>[];

      res.json({
        conversation: mapConversationRow(updatedConv),
        messages: updatedMsgs.map(mapMessageRow),
      });
    } catch (err) {
      if (err instanceof GeminiServiceError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to analyze conversation.',
      });
    }
  });

  // Important messages & questions aggregation
  router.get('/important', (_req, res) => {
    const importantMsgRows = db
      .prepare(
        `SELECT m.*, c.title AS conversation_title, c.category AS conversation_category
         FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         WHERE m.is_important = 1 OR m.needs_reply = 1
         ORDER BY m.created_at DESC`
      )
      .all() as Record<string, unknown>[];

    const convRows = db
      .prepare(
        `SELECT id, title, category, important_points, pending_questions, last_analyzed_at
         FROM conversations
         WHERE last_analyzed_at IS NOT NULL
         ORDER BY last_analyzed_at DESC`
      )
      .all() as Record<string, unknown>[];

    const importantMessages = importantMsgRows.map((r) => ({
      ...mapMessageRow(r),
      conversationTitle: String(r.conversation_title),
      conversationCategory: String(r.conversation_category),
    }));

    const highlights = convRows.map((r) => ({
      conversationId: String(r.id),
      conversationTitle: String(r.title),
      category: String(r.category),
      lastAnalyzedAt: String(r.last_analyzed_at),
      importantPoints: JSON.parse(String(r.important_points || '[]')),
      pendingQuestions: JSON.parse(String(r.pending_questions || '[]')),
    }));

    res.json({ importantMessages, highlights });
  });

  // Generate AI reply
  router.post('/replies/generate', async (req, res) => {
    try {
      const {
        conversationId,
        targetMessageId,
        targetMessageText,
        targetSender,
        conversationTitle,
        language = 'English',
        tone = 'Friendly',
        customInstruction,
      } = req.body as {
        conversationId?: string | null;
        targetMessageId?: string | null;
        targetMessageText?: string;
        targetSender?: string;
        conversationTitle?: string;
        language?: SupportedLanguage;
        tone?: ReplyTone;
        customInstruction?: string;
      };

      let contextMessages: Message[] = [];
      let resolvedTitle = conversationTitle?.trim() || 'Quick Message';
      let resolvedTargetText = targetMessageText?.trim() || '';
      let resolvedTargetSender = targetSender?.trim() || 'Contact';

      if (conversationId) {
        const convRow = db
          .prepare('SELECT * FROM conversations WHERE id = ?')
          .get(conversationId) as Record<string, unknown> | undefined;
        if (convRow) {
          resolvedTitle = String(convRow.title);
          const msgRows = db
            .prepare(
              'SELECT * FROM messages WHERE conversation_id = ? ORDER BY sort_order ASC'
            )
            .all(conversationId) as Record<string, unknown>[];
          contextMessages = msgRows.map(mapMessageRow);

          if (targetMessageId) {
            const found = contextMessages.find((m) => m.id === targetMessageId);
            if (found) {
              resolvedTargetText = found.content;
              resolvedTargetSender = found.sender;
            }
          } else if (!resolvedTargetText && contextMessages.length > 0) {
            const lastIncoming =
              [...contextMessages].reverse().find((m) => !m.isFromMe) ||
              contextMessages[contextMessages.length - 1];
            resolvedTargetText = lastIncoming.content;
            resolvedTargetSender = lastIncoming.sender;
          }
        }
      }

      if (!resolvedTargetText) {
        return res
          .status(400)
          .json({ error: 'Select a message or paste incoming message text first.' });
      }

      const generated = await generateReplyWithGemini({
        conversationTitle: resolvedTitle,
        contextMessages,
        targetMessageText: resolvedTargetText,
        targetSender: resolvedTargetSender,
        language,
        tone,
        customInstruction,
      });

      const id = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      const excerpt =
        resolvedTargetText.length > 140
          ? `${resolvedTargetText.slice(0, 140)}...`
          : resolvedTargetText;

      db.prepare(
        `INSERT INTO reply_history (
          id, conversation_id, conversation_title, target_message_id,
          target_message_excerpt, reply_text, language, tone,
          custom_instruction, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`
      ).run(
        id,
        conversationId || null,
        resolvedTitle,
        targetMessageId || null,
        excerpt,
        generated.replyText,
        language,
        tone,
        customInstruction?.trim() || null,
        nowIso
      );

      logActivity(
        db,
        'reply_generated',
        `Generated ${language} (${tone}) reply for "${resolvedTitle}"`,
        id
      );

      const savedRow = db
        .prepare('SELECT * FROM reply_history WHERE id = ?')
        .get(id) as Record<string, unknown>;

      res.status(201).json({
        reply: mapReplyHistoryRow(savedRow),
        detectedInputLanguage: generated.detectedInputLanguage,
      });
    } catch (err) {
      if (err instanceof GeminiServiceError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to generate reply.',
      });
    }
  });

  // Reply History CRUD
  router.get('/replies', (_req, res) => {
    const rows = db
      .prepare('SELECT * FROM reply_history ORDER BY created_at DESC LIMIT 200')
      .all() as Record<string, unknown>[];
    res.json(rows.map(mapReplyHistoryRow));
  });

  router.patch('/replies/:id', (req, res) => {
    const existing = db
      .prepare('SELECT * FROM reply_history WHERE id = ?')
      .get(req.params.id) as Record<string, unknown> | undefined;

    if (!existing) {
      return res.status(404).json({ error: 'Reply record not found.' });
    }

    const { replyText, status } = req.body as {
      replyText?: string;
      status?: 'draft' | 'copied' | 'sent_confirmed';
    };

    const nextText =
      typeof replyText === 'string' && replyText.trim()
        ? replyText.trim()
        : String(existing.reply_text);

    const validStatuses = new Set(['draft', 'copied', 'sent_confirmed']);
    const nextStatus =
      status && validStatuses.has(status) ? status : String(existing.status);

    const confirmedAt =
      nextStatus === 'sent_confirmed'
        ? existing.confirmed_sent_at || new Date().toISOString()
        : existing.confirmed_sent_at;

    db.prepare(
      `UPDATE reply_history
       SET reply_text = ?, status = ?, confirmed_sent_at = ?
       WHERE id = ?`
    ).run(nextText, nextStatus, confirmedAt, req.params.id);

    if (nextStatus === 'sent_confirmed' && existing.status !== 'sent_confirmed') {
      logActivity(
        db,
        'reply_confirmed',
        `User confirmed manual WhatsApp reply sent to "${String(
          existing.conversation_title
        )}"`,
        req.params.id
      );
    }

    const updated = db
      .prepare('SELECT * FROM reply_history WHERE id = ?')
      .get(req.params.id) as Record<string, unknown>;
    res.json(mapReplyHistoryRow(updated));
  });

  router.delete('/replies/:id', (req, res) => {
    const info = db
      .prepare('DELETE FROM reply_history WHERE id = ?')
      .run(req.params.id);
    if (info.changes === 0) {
      return res.status(404).json({ error: 'Reply record not found.' });
    }
    res.json({ deleted: true });
  });

  router.delete('/replies', (_req, res) => {
    db.prepare('DELETE FROM reply_history').run();
    logActivity(db, 'data_deleted', 'Cleared all reply history');
    res.json({ cleared: true });
  });

  // Message Scheduler endpoints
  router.get('/scheduler', (_req, res) => {
    runSchedulerTick(db);
    const scheduleRows = db
      .prepare('SELECT * FROM scheduled_messages ORDER BY next_run_utc ASC')
      .all() as Record<string, unknown>[];

    res.json({
      schedules: scheduleRows.map(mapScheduleRow),
      executions: listExecutionHistory(db),
      activeNotifications: listActiveNotifications(db),
    });
  });

  router.post('/scheduler', (req, res) => {
    try {
      const created = createSchedule(db, req.body);
      res.status(201).json(created);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Invalid schedule data.',
      });
    }
  });

  router.put('/scheduler/:id', (req, res) => {
    try {
      const updated = updateSchedule(db, req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to update schedule.';
      res.status(message === 'Schedule not found.' ? 404 : 400).json({
        error: message,
      });
    }
  });

  router.post('/scheduler/:id/cancel', (req, res) => {
    try {
      const cancelled = cancelSchedule(db, req.params.id);
      res.json(cancelled);
    } catch (err) {
      res.status(404).json({
        error: err instanceof Error ? err.message : 'Schedule not found.',
      });
    }
  });

  router.delete('/scheduler/:id', (req, res) => {
    const deleted = deleteSchedule(db, req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Schedule not found.' });
    }
    res.json({ deleted: true });
  });

  router.post('/scheduler/draft', async (req, res) => {
    try {
      const {
        conversationId,
        recipientLabel = 'Contact',
        recipientType = 'contact',
        topicOrInstruction,
        language = 'English',
        tone = 'Friendly',
        customInstruction,
        scheduledDate = '',
        scheduledTime = '',
      } = req.body as {
        conversationId?: string | null;
        recipientLabel?: string;
        recipientType?: string;
        topicOrInstruction?: string;
        language?: SupportedLanguage;
        tone?: ReplyTone;
        customInstruction?: string;
        scheduledDate?: string;
        scheduledTime?: string;
      };

      let contextMessages: Message[] = [];
      if (conversationId) {
        const msgRows = db
          .prepare(
            'SELECT * FROM messages WHERE conversation_id = ? ORDER BY sort_order ASC'
          )
          .all(conversationId) as Record<string, unknown>[];
        contextMessages = msgRows.map(mapMessageRow);
      }

      const result = await generateScheduledDraftWithGemini({
        recipientLabel,
        recipientType,
        topicOrInstruction: topicOrInstruction || '',
        language,
        tone,
        customInstruction,
        scheduledDate,
        scheduledTime,
        contextMessages,
      });

      res.json(result);
    } catch (err) {
      if (err instanceof GeminiServiceError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to generate draft.',
      });
    }
  });

  router.post('/scheduler/executions/:execId/confirm', (req, res) => {
    try {
      const updated = confirmExecutionManuallySent(db, req.params.execId);
      res.json(updated);
    } catch (err) {
      res.status(404).json({
        error: err instanceof Error ? err.message : 'Reminder not found.',
      });
    }
  });

  router.post('/scheduler/executions/:execId/dismiss', (req, res) => {
    const ok = dismissExecution(db, req.params.execId);
    if (!ok) {
      return res.status(404).json({ error: 'Reminder not found.' });
    }
    res.json({ dismissed: true });
  });

  // Real-time SSE stream for due & missed scheduled notifications
  router.get('/scheduler/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    runSchedulerTick(db);
    const active = listActiveNotifications(db);
    res.write(`event: snapshot\ndata: ${JSON.stringify(active)}\n\n`);

    const onNotification = (exec: ScheduleExecution) => {
      res.write(`event: notification\ndata: ${JSON.stringify(exec)}\n\n`);
    };

    schedulerEvents.on('notification', onNotification);

    const heartbeat = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 25_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      schedulerEvents.off('notification', onNotification);
    });
  });

  // Settings
  router.get('/settings', (_req, res) => {
    res.json(getSettings(db));
  });

  router.put('/settings', (req, res) => {
    const saved = saveSettings(db, req.body);
    res.json(saved);
  });

  // Privacy wipe
  router.delete('/privacy/clear-all', (_req, res) => {
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM scheduled_executions').run();
      db.prepare('DELETE FROM scheduled_messages').run();
      db.prepare('DELETE FROM reply_history').run();
      db.prepare('DELETE FROM messages').run();
      db.prepare('DELETE FROM conversations').run();
      db.prepare('DELETE FROM activity_log').run();
    });
    tx();
    res.json({ cleared: true });
  });

  return router;
}
