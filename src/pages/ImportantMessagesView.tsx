import React, { useEffect, useState } from 'react';
import { AlertCircle, HelpCircle, Star } from 'lucide-react';
import type { Conversation, Message } from '../../shared/types.ts';
import { api } from '../lib/api.ts';

interface ImportantMessagesViewProps {
  onDraftReply: (conversationId: string, message?: Message) => void;
  onOpenConversation: (conversationId: string) => void;
}

export const ImportantMessagesView: React.FC<ImportantMessagesViewProps> = ({
  onDraftReply,
  onOpenConversation,
}) => {
  const [importantMessages, setImportantMessages] = useState<
    (Message & { conversationTitle: string; conversationCategory: string })[]
  >([]);
  const [highlights, setHighlights] = useState<
    {
      conversationId: string;
      conversationTitle: string;
      category: string;
      lastAnalyzedAt: string;
      importantPoints: Conversation['importantPoints'];
      pendingQuestions: Conversation['pendingQuestions'];
    }[]
  >([]);
  const [filter, setFilter] = useState<'all' | 'needs_reply' | 'important'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .getImportantOverview()
      .then((res) => {
        setImportantMessages(res.importantMessages);
        setHighlights(res.highlights);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load.')
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="h-48 rounded-xl border border-slate-200 bg-white animate-pulse" />
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center gap-2">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  const visibleMessages = importantMessages.filter((m) => {
    if (filter === 'needs_reply') return m.needsReply;
    if (filter === 'important') return m.isImportant;
    return true;
  });

  const allQuestions = highlights.flatMap((h) =>
    h.pendingQuestions.map((q) => ({
      ...q,
      conversationId: h.conversationId,
      conversationTitle: h.conversationTitle,
    }))
  );

  if (importantMessages.length === 0 && allQuestions.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
        <Star className="w-9 h-9 text-slate-300 mx-auto" />
        <h2 className="mt-3 text-base font-semibold text-slate-900">
          No important messages flagged yet
        </h2>
        <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
          Open any imported conversation and click <strong>Analyze with Gemini</strong> to automatically surface deadlines, key decisions, and unanswered questions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Unanswered Questions */}
      {allQuestions.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-amber-700" />
              <h2 className="text-base font-semibold text-slate-900">
                Questions Needing a Response
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {allQuestions.length} detected
            </span>
          </div>
          <ul className="divide-y divide-slate-100">
            {allQuestions.map((q, idx) => (
              <li
                key={`${q.conversationId}-${idx}`}
                className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-900">
                      {q.conversationTitle}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>From {q.sender}</span>
                    {q.timestamp && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {q.timestamp}
                        </span>
                      </>
                    )}
                  </div>
                  <p dir="auto" className="text-sm text-slate-800">
                    {q.question}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDraftReply(q.conversationId)}
                  className="rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-800 cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-center"
                >
                  Draft Reply
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Flagged Messages */}
      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">
            Important Messages & Reply Triggers
          </h2>
          <div className="inline-flex p-1 bg-slate-100 rounded-lg self-start">
            {(
              [
                ['all', 'All Flagged'],
                ['needs_reply', 'Needs Reply'],
                ['important', 'Key Info'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  filter === key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <ul className="divide-y divide-slate-100">
          {visibleMessages.map((msg) => (
            <li
              key={msg.id}
              className="px-6 py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4"
            >
              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                  <button
                    type="button"
                    onClick={() => onOpenConversation(msg.conversationId)}
                    className="font-semibold text-slate-900 hover:text-emerald-700 hover:underline cursor-pointer"
                  >
                    {msg.conversationTitle}
                  </button>
                  <span aria-hidden="true">·</span>
                  <span>{msg.sender}</span>
                  {msg.sentAt && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {msg.sentAt}
                      </span>
                    </>
                  )}
                  {msg.isImportant && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-amber-800 font-medium">
                        {msg.importanceReason || 'Important'}
                      </span>
                    </>
                  )}
                  {msg.needsReply && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-700 font-medium">
                        Needs reply
                      </span>
                    </>
                  )}
                </div>
                <p dir="auto" className="text-sm text-slate-800 whitespace-pre-wrap">
                  {msg.content}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDraftReply(msg.conversationId, msg)}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
              >
                Reply
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};
