import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Plus,
  Shield,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  Conversation,
  ConversationCategory,
  ImportSourceType,
} from '../../shared/types.ts';
import { api } from '../lib/api.ts';

interface ImportMessagesViewProps {
  onImported: (conv: Conversation) => void;
}

interface ManualDraftMessage {
  id: string;
  sender: string;
  content: string;
  sentAt: string;
  isFromMe: boolean;
}

export const ImportMessagesView: React.FC<ImportMessagesViewProps> = ({
  onImported,
}) => {
  const [mode, setMode] = useState<ImportSourceType>('paste');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ConversationCategory>('contact');
  const [fallbackSender, setFallbackSender] = useState('');
  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);

  const [manualMessages, setManualMessages] = useState<ManualDraftMessage[]>([
    {
      id: crypto.randomUUID(),
      sender: '',
      content: '',
      sentAt: '',
      isFromMe: false,
    },
  ]);

  const [preview, setPreview] = useState<{
    messages: {
      sender: string;
      content: string;
      sentAt: string | null;
      isFromMe: boolean;
    }[];
    inferredTitle: string;
    detectedFormat: string;
    skippedSystemLines: number;
  } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleFileUpload = async (file: File) => {
    setError(null);
    setSuccessMsg(null);
    if (!file.name.toLowerCase().endsWith('.txt')) {
      setError('Please select a WhatsApp .txt chat export file.');
      return;
    }
    if (file.size > 2_500_000) {
      setError('File exceeds 2.5 MB. Export chat "Without Media" or trim older lines.');
      return;
    }
    const text = await file.text();
    setFileName(file.name);
    setRawText(text);
    if (!title.trim()) {
      const cleanedName = file.name
        .replace(/^WhatsApp Chat with /i, '')
        .replace(/\.txt$/i, '')
        .trim();
      setTitle(cleanedName);
    }
    try {
      const parsed = await api.previewParse(text, fallbackSender || undefined);
      setPreview(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file.');
    }
  };

  const handlePreview = async () => {
    setError(null);
    setSuccessMsg(null);
    try {
      const parsed = await api.previewParse(
        rawText,
        fallbackSender || title || undefined
      );
      setPreview(parsed);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : 'Could not parse input.');
    }
  };

  const handleSaveImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      if (mode === 'manual') {
        const cleaned = manualMessages
          .filter((m) => m.content.trim().length > 0)
          .map((m) => ({
            sender: m.isFromMe
              ? 'You'
              : m.sender.trim() || title.trim() || 'Contact',
            content: m.content.trim(),
            sentAt: m.sentAt.trim() || null,
            isFromMe: m.isFromMe,
          }));

        if (cleaned.length === 0) {
          throw new Error('Add at least one message with text before saving.');
        }

        const res = await api.importConversation({
          title: title.trim() || undefined,
          category,
          sourceType: 'manual',
          messages: cleaned,
          fallbackSender: fallbackSender.trim() || undefined,
        });
        setSuccessMsg(
          `Saved "${res.conversation.title}" with ${res.messages.length} message(s).`
        );
        onImported(res.conversation);
      } else {
        const res = await api.importConversation({
          title: title.trim() || undefined,
          category,
          sourceType: mode,
          rawText,
          fallbackSender: fallbackSender.trim() || undefined,
        });
        setSuccessMsg(
          `Imported ${res.messages.length} message(s) into "${res.conversation.title}".`
        );
        onImported(res.conversation);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save conversation.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Authorized Message Input
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Import only selected conversations or messages you choose to share.
            </p>
          </div>

          <div
            className="inline-flex items-center p-1 bg-slate-100 rounded-lg self-start"
            role="tablist"
          >
            <button
              type="button"
              onClick={() => {
                setMode('paste');
                setError(null);
                setPreview(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'paste'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Paste Messages
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('export');
                setError(null);
                setPreview(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'export'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Upload .txt Export
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('manual');
                setError(null);
                setPreview(null);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'manual'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Manual Builder
            </button>
          </div>
        </div>

        <form onSubmit={handleSaveImport} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Contact or Group Name
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Ahmed Raza or Family Group"
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Chat Type
              </label>
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setCategory('contact')}
                  className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    category === 'contact'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Contact
                </button>
                <button
                  type="button"
                  onClick={() => setCategory('group')}
                  className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    category === 'group'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Group
                </button>
              </div>
            </div>
          </div>

          {mode === 'export' && (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-700">
                WhatsApp Chat Export File (.txt)
              </label>
              <label className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-8 text-center hover:border-emerald-600 hover:bg-emerald-50/30 transition-colors cursor-pointer">
                <Upload className="w-6 h-6 text-slate-400 mb-2" />
                <span className="text-sm font-medium text-slate-800">
                  {fileName
                    ? `Selected: ${fileName}`
                    : 'Choose a WhatsApp .txt export file'}
                </span>
                <span className="mt-1 text-xs text-slate-500">
                  In WhatsApp: Open chat → More → Export chat → Without Media
                </span>
                <input
                  type="file"
                  accept=".txt,text/plain"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                />
              </label>
            </div>
          )}

          {(mode === 'paste' || (mode === 'export' && rawText)) && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4">
                <label className="block text-xs font-medium text-slate-700">
                  {mode === 'export'
                    ? 'Export File Contents (editable)'
                    : 'Paste Selected WhatsApp Messages'}
                </label>
                <input
                  type="text"
                  value={fallbackSender}
                  onChange={(e) => setFallbackSender(e.target.value)}
                  placeholder="Default sender name (optional)"
                  className="w-56 rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <textarea
                dir="auto"
                rows={9}
                value={rawText}
                onChange={(e) => {
                  setRawText(e.target.value);
                  setPreview(null);
                }}
                placeholder={`Paste either exported lines:\n14/11/2026, 2:30 pm - Ali: Assalam o Alaikum, kal meeting 11 baje rakh lein?\n14/11/2026, 2:32 pm - You: Ji bilkul, location confirm kar dein.\n\nOr simply paste a single incoming message in English, Roman Urdu, or اردو.`}
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-sm font-mono text-slate-800 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              />

              <div className="flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={!rawText.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Preview Parsed Messages
                </button>
                <span className="text-xs text-slate-500">
                  Supports Android, iOS, Urdu script, Roman Urdu & English
                </span>
              </div>
            </div>
          )}

          {mode === 'manual' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-700">
                  Messages in Conversation
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setManualMessages((prev) => [
                      ...prev,
                      {
                        id: crypto.randomUUID(),
                        sender: '',
                        content: '',
                        sentAt: '',
                        isFromMe: false,
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Message Row
                </button>
              </div>

              <div className="space-y-3">
                {manualMessages.map((msg, idx) => (
                  <div
                    key={msg.id}
                    className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 space-y-2.5"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-slate-400 tabular-nums">
                        #{idx + 1}
                      </span>
                      <input
                        type="text"
                        disabled={msg.isFromMe}
                        value={msg.isFromMe ? 'You' : msg.sender}
                        onChange={(e) =>
                          setManualMessages((prev) =>
                            prev.map((m) =>
                              m.id === msg.id
                                ? { ...m, sender: e.target.value }
                                : m
                            )
                          )
                        }
                        placeholder="Sender name"
                        className="flex-1 min-w-[140px] rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 disabled:bg-slate-100"
                      />
                      <input
                        type="text"
                        value={msg.sentAt}
                        onChange={(e) =>
                          setManualMessages((prev) =>
                            prev.map((m) =>
                              m.id === msg.id
                                ? { ...m, sentAt: e.target.value }
                                : m
                            )
                          )
                        }
                        placeholder="Time (optional, e.g. 2:30 PM)"
                        className="w-44 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                      />
                      <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={msg.isFromMe}
                          onChange={(e) =>
                            setManualMessages((prev) =>
                              prev.map((m) =>
                                m.id === msg.id
                                  ? { ...m, isFromMe: e.target.checked }
                                  : m
                              )
                            )
                          }
                          className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                        />
                        Sent by me
                      </label>
                      {manualMessages.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setManualMessages((prev) =>
                              prev.filter((m) => m.id !== msg.id)
                            )
                          }
                          aria-label="Remove message row"
                          className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <textarea
                      dir="auto"
                      rows={2}
                      value={msg.content}
                      onChange={(e) =>
                        setManualMessages((prev) =>
                          prev.map((m) =>
                            m.id === msg.id
                              ? { ...m, content: e.target.value }
                              : m
                          )
                        )
                      }
                      placeholder="Enter message text..."
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-medium text-slate-900">
                  Preview: {preview.messages.length} message(s) detected
                </span>
                <span>
                  Format: {preview.detectedFormat.replace('_', ' ')}
                  {preview.skippedSystemLines > 0
                    ? ` · ${preview.skippedSystemLines} system line(s) skipped`
                    : ''}
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {preview.messages.slice(0, 12).map((m, idx) => (
                  <div
                    key={idx}
                    className="text-xs bg-white rounded border border-slate-200/80 px-3 py-2"
                  >
                    <span className="font-semibold text-slate-900">
                      {m.sender}
                    </span>
                    {m.sentAt && (
                      <span className="ml-2 font-mono text-slate-400">
                        {m.sentAt}
                      </span>
                    )}
                    <p dir="auto" className="mt-0.5 text-slate-700 whitespace-pre-wrap">
                      {m.content}
                    </p>
                  </div>
                ))}
                {preview.messages.length > 12 && (
                  <p className="text-xs text-slate-500 pt-1">
                    + {preview.messages.length - 12} more messages
                  </p>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-2 text-sm text-red-800">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-2 text-sm text-emerald-900">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="pt-2 flex items-center justify-between gap-4 flex-wrap border-t border-slate-100">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Shield className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                Stored locally in SQLite. Sent to Google Gemini only when you click Analyze or Generate Reply.
              </span>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              {submitting ? 'Saving...' : 'Save Conversation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
