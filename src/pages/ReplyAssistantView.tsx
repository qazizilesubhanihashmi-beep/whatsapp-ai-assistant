import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import type {
  AppSettings,
  Conversation,
  Message,
  ReplyHistoryItem,
  ReplyTone,
  SupportedLanguage,
} from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { openWhatsAppWeb } from '../lib/notifications.ts';

interface ReplyAssistantViewProps {
  conversations: Conversation[];
  settings: AppSettings;
  preselectedConversationId: string | null;
  preselectedMessage: Message | null;
  onReplySaved: () => void;
}

const LANGUAGES: SupportedLanguage[] = ['English', 'Roman Urdu', 'Urdu'];
const TONES: ReplyTone[] = [
  'Short and direct',
  'Friendly',
  'Professional',
  'Detailed',
  'Custom',
];

export const ReplyAssistantView: React.FC<ReplyAssistantViewProps> = ({
  conversations,
  settings,
  preselectedConversationId,
  preselectedMessage,
  onReplySaved,
}) => {
  const [inputMode, setInputMode] = useState<'conversation' | 'quick'>(
    preselectedConversationId || conversations.length > 0
      ? 'conversation'
      : 'quick'
  );
  const [selectedConvId, setSelectedConvId] = useState<string>(
    preselectedConversationId || conversations[0]?.id || ''
  );
  const [convMessages, setConvMessages] = useState<Message[]>([]);
  const [selectedMsgId, setSelectedMsgId] = useState<string>(
    preselectedMessage?.id || ''
  );

  const [quickSender, setQuickSender] = useState('');
  const [quickMessage, setQuickMessage] = useState('');

  const [language, setLanguage] = useState<SupportedLanguage>(
    settings.defaultLanguage
  );
  const [tone, setTone] = useState<ReplyTone>(settings.defaultTone);
  const [customInstruction, setCustomInstruction] = useState('');

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentReply, setCurrentReply] = useState<ReplyHistoryItem | null>(
    null
  );
  const [editableReplyText, setEditableReplyText] = useState('');
  const [detectedInputLang, setDetectedInputLang] = useState<string | null>(
    null
  );
  const [copied, setCopied] = useState(false);
  const [confirmingSent, setConfirmingSent] = useState(false);

  useEffect(() => {
    if (preselectedConversationId) {
      setInputMode('conversation');
      setSelectedConvId(preselectedConversationId);
    }
  }, [preselectedConversationId]);

  useEffect(() => {
    if (preselectedMessage) {
      setSelectedMsgId(preselectedMessage.id);
    }
  }, [preselectedMessage]);

  useEffect(() => {
    if (inputMode !== 'conversation' || !selectedConvId) {
      setConvMessages([]);
      return;
    }
    let cancelled = false;
    api
      .getConversation(selectedConvId)
      .then((res) => {
        if (cancelled) return;
        setConvMessages(res.messages);
        if (
          preselectedMessage &&
          res.messages.some((m) => m.id === preselectedMessage.id)
        ) {
          setSelectedMsgId(preselectedMessage.id);
        } else {
          const incoming = [...res.messages].reverse().find((m) => !m.isFromMe);
          setSelectedMsgId(
            incoming?.id || res.messages[res.messages.length - 1]?.id || ''
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedConvId, inputMode, preselectedMessage]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setGenerating(true);
    setCopied(false);

    try {
      const res = await api.generateReply(
        inputMode === 'conversation'
          ? {
              conversationId: selectedConvId,
              targetMessageId: selectedMsgId || null,
              language,
              tone,
              customInstruction: customInstruction.trim() || undefined,
            }
          : {
              conversationTitle: quickSender.trim() || 'Quick Message',
              targetSender: quickSender.trim() || 'Contact',
              targetMessageText: quickMessage.trim(),
              language,
              tone,
              customInstruction: customInstruction.trim() || undefined,
            }
      );

      setCurrentReply(res.reply);
      setEditableReplyText(res.reply.replyText);
      setDetectedInputLang(res.detectedInputLanguage);
      onReplySaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to generate AI reply.'
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyReply = async () => {
    if (!editableReplyText.trim()) return;
    try {
      await navigator.clipboard.writeText(editableReplyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      if (currentReply) {
        const updated = await api.updateReply(currentReply.id, {
          replyText: editableReplyText,
          status:
            currentReply.status === 'sent_confirmed'
              ? 'sent_confirmed'
              : 'copied',
        });
        setCurrentReply(updated);
        onReplySaved();
      }
    } catch {
      setError('Could not access clipboard. Select the text and press Ctrl+C.');
    }
  };

  const handleConfirmSent = async () => {
    if (!currentReply) return;
    setConfirmingSent(true);
    try {
      const updated = await api.updateReply(currentReply.id, {
        replyText: editableReplyText,
        status: 'sent_confirmed',
      });
      setCurrentReply(updated);
      onReplySaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status.');
    } finally {
      setConfirmingSent(false);
    }
  };

  const selectedMessageObj = convMessages.find((m) => m.id === selectedMsgId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Configuration & Input */}
      <form
        onSubmit={handleGenerate}
        className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-6 space-y-5"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-slate-900">
            Message Context & Reply Controls
          </h2>
          <div className="inline-flex p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setInputMode('conversation')}
              disabled={conversations.length === 0}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer disabled:opacity-40 ${
                inputMode === 'conversation'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600'
              }`}
            >
              From Conversation
            </button>
            <button
              type="button"
              onClick={() => setInputMode('quick')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                inputMode === 'quick'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600'
              }`}
            >
              Quick Paste
            </button>
          </div>
        </div>

        {inputMode === 'conversation' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Select Conversation
              </label>
              <select
                value={selectedConvId}
                onChange={(e) => setSelectedConvId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
              >
                {conversations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.messageCount ?? 0} messages)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Target Message to Reply To
              </label>
              <select
                value={selectedMsgId}
                onChange={(e) => setSelectedMsgId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
              >
                {convMessages.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.sender}: {m.content.slice(0, 75)}
                    {m.content.length > 75 ? '...' : ''}
                  </option>
                ))}
              </select>

              {selectedMessageObj && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <span className="font-semibold text-slate-900">
                    {selectedMessageObj.sender}:
                  </span>{' '}
                  <span dir="auto">{selectedMessageObj.content}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Sender Name (optional)
              </label>
              <input
                type="text"
                value={quickSender}
                onChange={(e) => setQuickSender(e.target.value)}
                placeholder="e.g., Bilal"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Incoming Message Text
              </label>
              <textarea
                dir="auto"
                rows={4}
                value={quickMessage}
                onChange={(e) => setQuickMessage(e.target.value)}
                placeholder="Paste the WhatsApp message you received..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* Reply Language */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            Reply Language
          </label>
          <div className="grid grid-cols-3 gap-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setLanguage(lang)}
                className={`py-2 px-3 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  language === lang
                    ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>

        {/* Reply Tone */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            Reply Style
          </label>
          <div className="flex flex-wrap gap-2">
            {TONES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTone(t)}
                className={`py-1.5 px-3 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  tone === t
                    ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            Custom Instruction {tone === 'Custom' ? '(required)' : '(optional)'}
          </label>
          <input
            dir="auto"
            type="text"
            value={customInstruction}
            onChange={(e) => setCustomInstruction(e.target.value)}
            placeholder="e.g., Politely decline and suggest Tuesday at 4 PM PKT"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-2 text-sm text-red-800">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={
            generating ||
            (inputMode === 'conversation' && !selectedConvId) ||
            (inputMode === 'quick' && !quickMessage.trim())
          }
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
        >
          <Sparkles className="w-4 h-4" />
          {generating ? 'Generating Reply with Gemini...' : 'Generate AI Reply'}
        </button>
      </form>

      {/* Right Editable Reply & Manual WhatsApp Dispatch */}
      <div className="lg:col-span-6 rounded-xl border border-slate-200 bg-white p-6 space-y-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">
            Review, Edit & Send Manually
          </h2>
          {detectedInputLang && (
            <span className="text-xs text-slate-500">
              Detected input: {detectedInputLang}
            </span>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            Editable Reply Draft
          </label>
          <textarea
            dir="auto"
            rows={8}
            value={editableReplyText}
            onChange={(e) => setEditableReplyText(e.target.value)}
            placeholder="Your Gemini-generated reply will appear here. Review and edit freely before copying to WhatsApp Web."
            className="w-full rounded-lg border border-slate-200 bg-slate-50/40 px-4 py-3 text-sm text-slate-900 leading-relaxed focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
          />
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            disabled={!editableReplyText.trim()}
            onClick={handleCopyReply}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-40 cursor-pointer whitespace-nowrap"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                Copied to Clipboard
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy Reply
              </>
            )}
          </button>

          <button
            type="button"
            onClick={openWhatsAppWeb}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            <ExternalLink className="w-3.5 h-3.5 text-emerald-700" />
            Open WhatsApp Web
          </button>

          {currentReply && currentReply.status !== 'sent_confirmed' && (
            <button
              type="button"
              disabled={confirmingSent}
              onClick={handleConfirmSent}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {confirmingSent ? 'Confirming...' : 'I Sent This Reply'}
            </button>
          )}

          {currentReply?.status === 'sent_confirmed' && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              Confirmed manually sent
            </span>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 space-y-1 leading-relaxed">
          <p className="font-semibold text-slate-800">
            Manual WhatsApp Web Sending Steps
          </p>
          <p>
            1. Click <strong>Copy Reply</strong> above after reviewing your text.
          </p>
          <p>
            2. Click <strong>Open WhatsApp Web</strong> and select the chat manually.
          </p>
          <p>
            3. Paste (Ctrl+V), double-check the recipient, and press Send in WhatsApp.
          </p>
        </div>
      </div>
    </div>
  );
};
