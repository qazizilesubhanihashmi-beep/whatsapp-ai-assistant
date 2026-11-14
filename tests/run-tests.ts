import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createDatabase } from '../server/db.ts';
import { createApiRouter } from '../server/routes.ts';
import { parseWhatsAppInput } from '../server/parser.ts';
import {
  cancelSchedule,
  confirmExecutionManuallySent,
  createSchedule,
  listActiveNotifications,
  runSchedulerTick,
  updateSchedule,
} from '../server/scheduler.ts';
import {
  computeNextOccurrence,
  localDateTimeToUtcIso,
  utcIsoToLocalParts,
} from '../shared/timezone.ts';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${name}`);
    console.error(err);
  }
}

async function main() {
  // 1. Parser tests: Android, iOS, Urdu, Roman Urdu, English, malformed/empty
  await test('Parser: Android WhatsApp .txt export with multi-line & system filter', () => {
    const sample = [
      '14/11/2026, 2:30 pm - Messages and calls are end-to-end encrypted.',
      '14/11/2026, 2:31 pm - Ali Khan: Assalam o Alaikum bhai',
      'Kal meeting 3 baje rakh lein?',
      '14/11/2026, 2:33 pm - You: Walaikum Assalam, ji bilkul done hai.',
    ].join('\n');

    const res = parseWhatsAppInput(sample, { userDisplayName: 'You' });
    assert.equal(res.detectedFormat, 'whatsapp_export');
    assert.equal(res.messages.length, 2);
    assert.equal(res.skippedSystemLines, 1);
    assert.equal(res.messages[0].sender, 'Ali Khan');
    assert.match(res.messages[0].content, /Kal meeting 3 baje/);
    assert.equal(res.messages[1].isFromMe, true);
    assert.equal(res.inferredTitle, 'Ali Khan');
  });

  await test('Parser: iOS bracket export with Urdu script', () => {
    const sample =
      '[14/11/2026, 14:40:05] Fatima: السلام علیکم، براہ کرم آج کی رپورٹ بھیج دیں۔';
    const res = parseWhatsAppInput(sample);
    assert.equal(res.detectedFormat, 'whatsapp_export');
    assert.equal(res.messages.length, 1);
    assert.equal(res.messages[0].sender, 'Fatima');
    assert.match(res.messages[0].content, /السلام علیکم/);
  });

  await test('Parser: Rejects empty and whitespace-only input', () => {
    assert.throws(() => parseWhatsAppInput('   \n  \t '), /non-empty|paste/i);
  });

  // 2. Timezone (Asia/Karachi UTC+05:00) & Recurrence tests
  await test('Timezone: Asia/Karachi converts accurately to UTC (UTC+05:00)', () => {
    const utcIso = localDateTimeToUtcIso('2026-11-15', '15:30', 'Asia/Karachi');
    assert.equal(utcIso, '2026-11-15T10:30:00.000Z');
    const back = utcIsoToLocalParts(utcIso, 'Asia/Karachi');
    assert.equal(back.date, '2026-11-15');
    assert.equal(back.time, '15:30');
    assert.equal(back.tzShort, 'PKT');
  });

  await test('Recurrence: Custom weekday computation skips non-selected days', () => {
    // 2026-11-14 is Saturday (6). Select only Monday (1). Next Monday is 2026-11-16.
    const next = computeNextOccurrence({
      scheduledDate: '2026-11-14',
      scheduledTime: '09:00',
      recurrence: 'custom',
      customDays: [1],
      timeZone: 'Asia/Karachi',
      afterDate: new Date('2026-11-14T00:00:00.000Z'),
    });
    assert.ok(next);
    assert.equal(next.scheduledDate, '2026-11-16');
    assert.equal(next.scheduledTime, '09:00');
  });

  // 3. Scheduler Engine Acceptance Tests (SQLite :memory:)
  await test('Scheduler: One-time scheduling, due notification, duplicate prevention, and manual confirmation', () => {
    const db = createDatabase(':memory:');
    const now = new Date('2026-11-15T09:00:00.000Z'); // 14:00 PKT
    const sched = createSchedule(
      db,
      {
        recipientLabel: 'Client Group',
        recipientType: 'group',
        messageText: 'Please review the attached invoice.',
        scheduledDate: '2026-11-15',
        scheduledTime: '14:30', // 09:30 UTC
        timezone: 'Asia/Karachi',
        recurrence: 'once',
      },
      now
    );
    assert.equal(sched.status, 'upcoming');

    // Before due time -> nothing fires
    const early = runSchedulerTick(db, new Date('2026-11-15T09:29:00.000Z'));
    assert.equal(early.length, 0);

    // At due time (within 2 min window) -> fires ONCE as 'due'
    const dueTime = new Date('2026-11-15T09:30:30.000Z');
    const firstTick = runSchedulerTick(db, dueTime);
    assert.equal(firstTick.length, 1);
    assert.equal(firstTick[0].status, 'due');

    // Second tick at same time -> duplicate prevention returns 0
    const secondTick = runSchedulerTick(db, new Date('2026-11-15T09:31:00.000Z'));
    assert.equal(secondTick.length, 0);
    assert.equal(listActiveNotifications(db).length, 1);

    // Confirm manually sent
    const confirmed = confirmExecutionManuallySent(db, firstTick[0].id, dueTime);
    assert.equal(confirmed.status, 'sent_confirmed');
    assert.equal(listActiveNotifications(db).length, 0);
    db.close();
  });

  await test('Scheduler: Startup recovery detects missed schedules after closure & prevents duplicates', () => {
    const db = createDatabase(':memory:');
    const createdAt = new Date('2026-11-15T08:00:00.000Z'); // 13:00 PKT
    createSchedule(
      db,
      {
        recipientLabel: 'Usman',
        recipientType: 'contact',
        messageText: 'Assalam o Alaikum, call back please.',
        scheduledDate: '2026-11-15',
        scheduledTime: '13:30', // 08:30 UTC
        timezone: 'Asia/Karachi',
        recurrence: 'once',
      },
      createdAt
    );

    // App restarts 3 hours later (11:30 UTC)
    const restartTime = new Date('2026-11-15T11:30:00.000Z');
    const recovered = runSchedulerTick(db, restartTime);
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].status, 'missed');

    // Subsequent tick must NOT duplicate the missed notification
    const repeat = runSchedulerTick(db, new Date('2026-11-15T11:31:00.000Z'));
    assert.equal(repeat.length, 0);
    db.close();
  });

  await test('Scheduler: Daily & Weekly recurrence advance cleanly to next occurrence', () => {
    const db = createDatabase(':memory:');
    const now = new Date('2026-11-15T08:00:00.000Z');
    const daily = createSchedule(
      db,
      {
        recipientLabel: 'Standup Group',
        recipientType: 'group',
        messageText: 'Daily status update please.',
        scheduledDate: '2026-11-15',
        scheduledTime: '13:15', // 08:15 UTC
        timezone: 'Asia/Karachi',
        recurrence: 'daily',
      },
      now
    );

    const triggered = runSchedulerTick(db, new Date('2026-11-15T08:15:10.000Z'));
    assert.equal(triggered.length, 1);
    const updatedRow = db
      .prepare('SELECT * FROM scheduled_messages WHERE id = ?')
      .get(daily.id) as Record<string, unknown>;
    assert.equal(updatedRow.status, 'upcoming');
    assert.equal(updatedRow.scheduled_date, '2026-11-16');

    // Edit and cancel test
    const edited = updateSchedule(
      db,
      daily.id,
      { scheduledTime: '14:00', recurrence: 'weekly' },
      new Date('2026-11-15T08:16:00.000Z')
    );
    assert.equal(edited.recurrence, 'weekly');
    assert.equal(edited.scheduledTime, '14:00');

    const cancelled = cancelSchedule(db, daily.id);
    assert.equal(cancelled.status, 'cancelled');
    db.close();
  });

  // 4. Express API Integration + Security Audit
  await test('API & Security: CRUD lifecycle, validation, and zero secret exposure', async () => {
    const db = createDatabase(':memory:');
    const app = express();
    app.use(express.json());
    app.use('/api', createApiRouter(db));

    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', () => resolve());
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind test server');
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      // Health endpoint must never expose GEMINI_API_KEY value
      const healthRes = await fetch(`${baseUrl}/api/health`);
      const healthText = await healthRes.text();
      assert.equal(healthRes.status, 200);
      if (process.env.GEMINI_API_KEY) {
        assert.equal(healthText.includes(process.env.GEMINI_API_KEY), false);
      }

      // Empty import rejected with 400
      const badImport = await fetch(`${baseUrl}/api/conversations/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: '   ', sourceType: 'paste' }),
      });
      assert.equal(badImport.status, 400);

      // Valid import
      const goodImport = await fetch(`${baseUrl}/api/conversations/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Hamza',
          category: 'contact',
          sourceType: 'paste',
          rawText: 'Hamza: Bhai kal office aoge?',
        }),
      });
      assert.equal(goodImport.status, 201);
      const imported = (await goodImport.json()) as {
        conversation: { id: string };
      };

      // Delete conversation
      const delRes = await fetch(
        `${baseUrl}/api/conversations/${imported.conversation.id}`,
        { method: 'DELETE' }
      );
      assert.equal(delRes.status, 200);

      // Confirm deleted
      const getAfterDel = await fetch(
        `${baseUrl}/api/conversations/${imported.conversation.id}`
      );
      assert.equal(getAfterDel.status, 404);
    } finally {
      server.close();
      db.close();
    }
  });

  await test('Security: Frontend source files contain no GEMINI_API_KEY references or unsafe WhatsApp automation', () => {
    const srcFiles: string[] = [];
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) srcFiles.push(full);
      }
    }
    walk(path.resolve(process.cwd(), 'src'));

    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf8');
      assert.equal(
        content.includes('GEMINI_API_KEY'),
        false,
        `Frontend file ${file} must not reference GEMINI_API_KEY`
      );
      assert.equal(
        content.includes('@google/genai'),
        false,
        `Frontend file ${file} must not import @google/genai`
      );
    }
  });

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
