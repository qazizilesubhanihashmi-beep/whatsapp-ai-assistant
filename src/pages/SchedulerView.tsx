import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BellRing,
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  ExternalLink,
  Plus,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import type {
  AppSettings,
  Conversation,
  ConversationCategory,
  RecurrenceType,
  ReplyTone,
  ScheduleExecution,
  ScheduledMessage,
  SupportedLanguage,
} from '../../shared/types.ts';
import { DEFAULT_TIMEZONE, getNowInTimeZone } from '../../shared/timezone.ts';
import { api } from '../lib/api.ts';
import { openWhatsAppWeb } from '../lib/notifications.ts';

interface SchedulerViewProps {
  conversations: Conversation[];
  settings: AppSettings;
  schedules: ScheduledMessage[];
  executions: ScheduleExecution[];
  activeNotifications: ScheduleExecution[];
  onRefresh: () => Promise<void>;
  onConfirmExecutionSent: (execId: string) => Promise<void>;
  onDismissExecution: (execId: string) => Promise<void>;
}

const WEEKDAYS = [
  { idx: 0, label: 'Sun' },
  { idx: 1, label: 'Mon' },
  { idx: 2, label: 'Tue' },
  { idx: 3, label: 'Wed' },
  { idx: 4, label: 'Thu' },
  { idx: 5, label: 'Fri' },
  { idx: 6, label: 'Sat' },
];

const LANGUAGES: SupportedLanguage[] = ['English', 'Roman Urdu', 'Urdu'];
const TONES: ReplyTone[] = [
  'Short and direct',
  'Friendly',
  'Professional',
  'Detailed',
  'Custom',
];

function getDefaultScheduleDateTime(tz: string) {
  const future = new Date(Date.now() + 30 * 60 * 1000);
  const parts = getNowInTimeZone(tz, future);
  return { date: parts.date, time: parts.time };
}

export const SchedulerView: React.FC<SchedulerViewProps> = ({
  conversations,
  settings,
  schedules,
  executions,
  activeNotifications,
  onRefresh,
  onConfirmExecutionSent,
  onDismissExecution,
}) => {
  const timezone = settings.timezone || DEFAULT_TIMEZONE;
  const [pktClock, setPktClock] = useState(() => getNowInTimeZone(timezone));

  useEffect(() => {
    const t = setInterval(() => {
      setPktClock(getNowInTimeZone(timezone));
    }, 1000);
    return () => clearInterval(t);
  }, [timezone]);

  const [statusFilter, setStatusFilter] = useState<
    'all' | 'upcoming' | 'attention' | 'sent_confirmed' | 'cancelled'
  >('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modal / Drawer form state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string>('');
  const [recipientLabel, setRecipientLabel] = useState('');
  const [recipientType, setRecipientType] =
    useState<ConversationCategory>('contact');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [recurrence, setRecurrence] = useState<RecurrenceType>('once');
  const [customDays, setCustomDays] = useState<number[]>([1, 3, 5]);
  const [language, setLanguage] = useState<SupportedLanguage>(
    settings.defaultLanguage
  );
  const [tone, setTone] = useState<ReplyTone>(settings.defaultTone);
  const [customInstruction, setCustomInstruction] = useState('');
  const [aiTopic, setAiTopic] = useState('');
  const [messageText, setMessageText] = useState('');
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const openNewModal = () => {
    const def = getDefaultScheduleDateTime(timezone);
    setEditingId(null);
    setConversationId('');
    setRecipientLabel('');
    setRecipientType('contact');
    setScheduledDate(def.date);
    setScheduledTime(def.time);
    setRecurrence('once');
    setCustomDays([1, 3, 5]);
    setLanguage(settings.defaultLanguage);
    setTone(settings.defaultTone);
    setCustomInstruction('');
    setAiTopic('');
    setMessageText('');
    setFormError(null);
    setEditorOpen(true);
  };

  const openEditModal = (sched: ScheduledMessage) => {
    setEditingId(sched.id);
    setConversationId(sched.conversationId || '');
    setRecipientLabel(sched.recipientLabel);
    setRecipientType(sched.recipientType);
    setScheduledDate(sched.scheduledDate);
    setScheduledTime(sched.scheduledTime);
    setRecurrence(sched.recurrence);
    setCustomDays(sched.customDays.length > 0 ? sched.customDays : [1, 3, 5]);
    setLanguage(sched.language);
    setTone(sched.tone);
    setCustomInstruction(sched.customInstruction || '');
    setAiTopic('');
    setMessageText(sched.messageText);
    setFormError(null);
    setEditorOpen(true);
  };

  const handleSelectConversation = (convId: string) => {
    setConversationId(convId);
    const conv = conversations.find((c) => c.id === convId);
    if (conv) {
      setRecipientLabel(conv.title);
      setRecipientType(conv.category);
    }
  };

  const toggleCustomDay = (dayIdx: number) => {
    setCustomDays((prev) =>
      prev.includes(dayIdx)
        ? prev.filter((d) => d !== dayIdx)
        : [...prev, dayIdx].sort((a, b) => a - b)
    );
  };

  const handleGenerateDraft = async () => {
    if (!aiTopic.trim()) {
      setFormError('Describe what the scheduled message should say first.');
      return;
    }
    setFormError(null);
    setGeneratingDraft(true);
    try {
      const res = await api.generateScheduleDraft({
        conversationId: conversationId || null,
        recipientLabel: recipientLabel.trim() || 'Contact',
        recipientType,
        topicOrInstruction: aiTopic.trim(),
        language,
        tone,
        customInstruction: customInstruction.trim() || undefined,
        scheduledDate,
        scheduledTime,
      });
      setMessageText(res.draftText);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to generate AI draft.'
      );
    } finally {
      setGeneratingDraft(false);
    }
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const payload = {
        conversationId: conversationId || null,
        recipientLabel: recipientLabel.trim(),
        recipientType,
        messageText: messageText.trim(),
        language,
        tone,
        customInstruction: customInstruction.trim() || undefined,
        scheduledDate,
        scheduledTime,
        timezone,
        recurrence,
        customDays: recurrence === 'custom' ? customDays : [],
      };
      if (editingId) {
        await api.updateSchedule(editingId, payload);
      } else {
        await api.createSchedule(payload);
      }
      setEditorOpen(false);
      await onRefresh();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to save schedule.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((p) => (p === id ? null : p)), 2500);
    } catch {
      setError('Clipboard copy failed.');
    }
  };

  const filteredSchedules = schedules.filter((s) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'attention') {
      return s.status === 'due' || s.status === 'missed';
    }
    return s.status === statusFilter;
  });

  const formatRecurrenceLabel = (sched: ScheduledMessage) => {
    if (sched.recurrence === 'once') return 'One-time';
    if (sched.recurrence === 'daily') return 'Daily';
    if (sched.recurrence === 'weekly') return 'Weekly';
    const dayNames = sched.customDays
      .map((d) => WEEKDAYS.find((w) => w.idx === d)?.label)
      .filter(Boolean)
      .join(', ');
    return `Custom (${dayNames})`;
  };

  const renderStatusText = (status: ScheduledMessage['status']) => {
    switch (status) {
      case 'upcoming':
        return (
          <span className="text-emerald-700 font-medium">Upcoming</span>
        );
      case 'due':
        return (
          <span className="inline-flex items-center gap-1 text-amber-800 font-medium">
            <BellRing className="w-3.5 h-3.5" />
            Due now
          </span>
        );
      case 'missed':
        return (
          <span className="inline-flex items-center gap-1 text-red-700 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            Missed
          </span>
        );
      case 'sent_confirmed':
        return (
          <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Manually sent
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 text-slate-500 font-medium">
            <XCircle className="w-3.5 h-3.5" />
            Cancelled
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            WhatsApp Reminder & Message Scheduler
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 font-mono tabular-nums">
            Pakistan Standard Time ({timezone}): {pktClock.display} {pktClock.tzShort}
          </p>
        </div>

        <button
          type="button"
          onClick={openNewModal}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 cursor-pointer whitespace-nowrap self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          New Schedule
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-2 text-sm text-red-800">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Active Due / Missed Executions needing user confirmation */}
      {activeNotifications.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-white overflow-hidden">
          <div className="px-6 py-4 bg-amber-50/70 border-b border-amber-200 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <BellRing className="w-4 h-4 text-amber-700" />
              <span>
                Ready to Send Manually ({activeNotifications.length})
              </span>
            </div>
            <span className="text-xs text-amber-800">
              Copy text, open WhatsApp Web, send manually, then confirm
            </span>
          </div>
          <ul className="divide-y divide-slate-100">
            {activeNotifications.map((exec) => (
              <li
                key={exec.id}
                className="px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="min-w-0 space-y-1.5 flex-1">
                  <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                    <span
                      className={`font-semibold ${
                        exec.status === 'missed'
                          ? 'text-red-700'
                          : 'text-amber-800'
                      }`}
                    >
                      {exec.status === 'missed' ? 'Missed alert' : 'Due now'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-slate-900">
                      {exec.recipientLabel}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {exec.scheduledDate} {exec.scheduledTime} ({exec.timezone})
                    </span>
                  </div>
                  <p
                    dir="auto"
                    className="text-sm text-slate-800 whitespace-pre-wrap"
                  >
                    {exec.messageText}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopy(exec.id, exec.messageText)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                  >
                    {copiedId === exec.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Message
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={openWhatsAppWeb}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-700" />
                    Open WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => onConfirmExecutionSent(exec.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 cursor-pointer whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mark Manually Sent
                  </button>
                  <button
                    type="button"
                    onClick={() => onDismissExecution(exec.id)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 hover:bg-slate-50 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Schedules Table / List */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-900">
            Scheduled Messages
          </h3>
          <div className="inline-flex p-1 bg-slate-100 rounded-lg self-start flex-wrap">
            {(
              [
                ['all', 'All'],
                ['upcoming', 'Upcoming'],
                ['attention', 'Due & Missed'],
                ['sent_confirmed', 'Completed'],
                ['cancelled', 'Cancelled'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  statusFilter === key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filteredSchedules.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <CalendarClock className="w-9 h-9 text-slate-300 mx-auto" />
            <h4 className="mt-3 text-sm font-semibold text-slate-900">
              No scheduled messages in this view
            </h4>
            <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
              Schedule one-time or recurring WhatsApp message reminders in Pakistan Standard Time. At the due time, you will receive a desktop notification with Copy & Open WhatsApp actions.
            </p>
            <button
              type="button"
              onClick={openNewModal}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Create First Schedule
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filteredSchedules.map((sched) => (
              <li
                key={sched.id}
                className="px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="min-w-0 space-y-1.5 flex-1">
                  <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                    {renderStatusText(sched.status)}
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-slate-900">
                      {sched.recipientLabel}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">{sched.recipientType}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {sched.scheduledDate} {sched.scheduledTime} ({sched.timezone})
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{formatRecurrenceLabel(sched)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{sched.language}</span>
                  </div>
                  <p
                    dir="auto"
                    className="text-sm text-slate-800 whitespace-pre-wrap"
                  >
                    {sched.messageText}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopy(sched.id, sched.messageText)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                  >
                    {copiedId === sched.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(sched)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  {sched.status === 'upcoming' && (
                    <button
                      type="button"
                      onClick={async () => {
                        await api.cancelSchedule(sched.id);
                        await onRefresh();
                      }}
                      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50 cursor-pointer whitespace-nowrap"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      await api.deleteSchedule(sched.id);
                      await onRefresh();
                    }}
                    aria-label="Delete schedule"
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Trigger & Confirmation History */}
      {executions.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-base font-semibold text-slate-900">
              Reminder Execution & Confirmation Log
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 font-medium">Recipient</th>
                  <th className="px-6 py-3 font-medium">Scheduled (PKT)</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Message</th>
                  <th className="px-6 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {executions.map((exec) => (
                  <tr key={exec.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-3 font-medium text-slate-900 whitespace-nowrap">
                      {exec.recipientLabel}
                    </td>
                    <td className="px-6 py-3 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                      {exec.scheduledDate} {exec.scheduledTime}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      {exec.status === 'sent_confirmed' && (
                        <span className="text-emerald-700 font-medium">
                          Manually Sent
                        </span>
                      )}
                      {exec.status === 'due' && (
                        <span className="text-amber-800 font-medium">Due</span>
                      )}
                      {exec.status === 'missed' && (
                        <span className="text-red-700 font-medium">
                          Missed
                        </span>
                      )}
                      {exec.status === 'cancelled' && (
                        <span className="text-slate-500">Cancelled</span>
                      )}
                      {exec.status === 'skipped' && (
                        <span className="text-slate-500">Dismissed</span>
                      )}
                    </td>
                    <td
                      dir="auto"
                      className="px-6 py-3 text-slate-700 max-w-xs truncate"
                    >
                      {exec.messageText}
                    </td>
                    <td className="px-6 py-3 text-right whitespace-nowrap">
                      {(exec.status === 'due' || exec.status === 'missed') && (
                        <button
                          type="button"
                          onClick={() => onConfirmExecutionSent(exec.id)}
                          className="text-emerald-700 font-medium hover:underline cursor-pointer"
                        >
                          Confirm Sent
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Create / Edit Modal */}
      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                {editingId ? 'Edit Scheduled Message' : 'New Scheduled Message'}
              </h3>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                aria-label="Close modal"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
              {conversations.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Link Imported Conversation (optional context for AI draft)
                  </label>
                  <select
                    value={conversationId}
                    onChange={(e) => handleSelectConversation(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                  >
                    <option value="">-- Custom contact or group --</option>
                    {conversations.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} ({c.category})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Contact or Group Label
                  </label>
                  <input
                    type="text"
                    required
                    value={recipientLabel}
                    onChange={(e) => setRecipientLabel(e.target.value)}
                    placeholder="e.g., Client Team Group or Sara"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Recipient Type
                  </label>
                  <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                    {(['contact', 'group'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setRecipientType(t)}
                        className={`py-1.5 text-xs font-medium rounded-md capitalize cursor-pointer ${
                          recipientType === t
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Date, Time & Recurrence */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Date ({timezone})
                  </label>
                  <input
                    type="date"
                    required
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Time ({timezone})
                  </label>
                  <input
                    type="time"
                    required
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Recurrence
                  </label>
                  <select
                    value={recurrence}
                    onChange={(e) =>
                      setRecurrence(e.target.value as RecurrenceType)
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                  >
                    <option value="once">One-time</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="custom">Custom selected days</option>
                  </select>
                </div>
              </div>

              {recurrence === 'custom' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Select Days of Week
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((day) => {
                      const active = customDays.includes(day.idx);
                      return (
                        <button
                          key={day.idx}
                          type="button"
                          onClick={() => toggleCustomDay(day.idx)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
                            active
                              ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* AI Draft Assistant */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                    Draft Scheduled Message with Gemini
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    value={language}
                    onChange={(e) =>
                      setLanguage(e.target.value as SupportedLanguage)
                    }
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l} value={l}>
                        Language: {l}
                      </option>
                    ))}
                  </select>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value as ReplyTone)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900"
                  >
                    {TONES.map((t) => (
                      <option key={t} value={t}>
                        Tone: {t}
                      </option>
                    ))}
                  </select>
                </div>

                {tone === 'Custom' && (
                  <input
                    type="text"
                    value={customInstruction}
                    onChange={(e) => setCustomInstruction(e.target.value)}
                    placeholder="Custom tone instruction..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900"
                  />
                )}

                <div className="flex items-center gap-2">
                  <input
                    dir="auto"
                    type="text"
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    placeholder="What should this message say? (e.g., Weekly invoice reminder)"
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={generatingDraft}
                    onClick={handleGenerateDraft}
                    className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                  >
                    {generatingDraft ? 'Drafting...' : 'Generate Draft'}
                  </button>
                </div>
              </div>

              {/* Final Message Editor */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Final Message (review & edit before scheduling)
                </label>
                <textarea
                  dir="auto"
                  required
                  rows={4}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Write or refine the exact message you want to send manually when reminded..."
                  className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              {formError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-4">
                <p className="text-xs text-slate-500">
                  Notifies you at the due time. Never auto-sends on WhatsApp.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditorOpen(false)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
                  >
                    {saving
                      ? 'Saving...'
                      : editingId
                      ? 'Update Schedule'
                      : 'Approve & Schedule'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
