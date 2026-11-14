import React, { useState } from 'react';
import { BookOpenText, RefreshCw, AlertCircle } from 'lucide-react';
import type { Conversation } from '../../shared/types.ts';
import { api } from '../lib/api.ts';

interface SummariesViewProps {
  conversations: Conversation[];
  onRefresh: () => Promise<void>;
  onOpenConversation: (id: string) => void;
}

export const SummariesView: React.FC<SummariesViewProps> = ({
  conversations,
  onRefresh,
  onOpenConversation,
}) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await api.analyzeConversation(id);
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to analyze conversation.'
      );
    } finally {
      setBusyId(null);
    }
  };

  if (conversations.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
        <BookOpenText className="w-9 h-9 text-slate-300 mx-auto" />
        <h2 className="mt-3 text-base font-semibold text-slate-900">
          No conversation summaries yet
        </h2>
        <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
          Import messages first, then generate Gemini summaries to quickly catch up on long WhatsApp threads.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-2 text-sm text-red-800">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {conversations.map((conv) => (
          <article
            key={conv.id}
            className="rounded-xl border border-slate-200 bg-white p-6 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {conv.title}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                  {conv.category === 'group' ? 'Group' : 'Contact'}
                  {' · '}
                  {conv.messageCount ?? 0} messages
                  {conv.detectedLanguage ? ` · ${conv.detectedLanguage}` : ''}
                  {conv.lastAnalyzedAt
                    ? ` · Analyzed ${new Date(
                        conv.lastAnalyzedAt
                      ).toLocaleString()}`
                    : ' · Not analyzed yet'}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busyId === conv.id}
                  onClick={() => handleAnalyze(conv.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      busyId === conv.id ? 'animate-spin' : ''
                    }`}
                  />
                  {busyId === conv.id
                    ? 'Analyzing...'
                    : conv.lastAnalyzedAt
                    ? 'Re-analyze'
                    : 'Generate Summary'}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenConversation(conv.id)}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                >
                  Open Chat
                </button>
              </div>
            </div>

            {conv.summary ? (
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <p
                  dir="auto"
                  className="text-sm text-slate-700 leading-relaxed"
                >
                  {conv.summary}
                </p>

                {conv.importantPoints.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-800">
                      Key Points Extracted
                    </p>
                    <ul className="space-y-1 text-xs text-slate-600 list-disc pl-4">
                      {conv.importantPoints.map((pt, i) => (
                        <li key={i} dir="auto">
                          <span className="font-medium text-slate-800 capitalize">
                            {pt.category.replace('_', ' ')}:
                          </span>{' '}
                          {pt.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500 pt-2 border-t border-slate-100">
                No summary generated yet. Click <strong>Generate Summary</strong> to analyze these messages with Gemini.
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
};
