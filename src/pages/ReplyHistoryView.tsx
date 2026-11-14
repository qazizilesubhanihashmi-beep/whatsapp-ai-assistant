import React, { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  History,
  Search,
  Trash2,
} from 'lucide-react';
import type { ReplyHistoryItem } from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import { openWhatsAppWeb } from '../lib/notifications.ts';

interface ReplyHistoryViewProps {
  items: ReplyHistoryItem[];
  onRefresh: () => Promise<void>;
}

export const ReplyHistoryView: React.FC<ReplyHistoryViewProps> = ({
  items,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const filtered = items.filter(
    (item) =>
      item.conversationTitle.toLowerCase().includes(search.toLowerCase()) ||
      item.replyText.toLowerCase().includes(search.toLowerCase())
  );

  const handleCopy = async (item: ReplyHistoryItem) => {
    try {
      await navigator.clipboard.writeText(item.replyText);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId((p) => (p === item.id ? null : p)), 2500);
      if (item.status === 'draft') {
        await api.updateReply(item.id, { status: 'copied' });
        await onRefresh();
      }
    } catch {
      // Ignore
    }
  };

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
        <History className="w-9 h-9 text-slate-300 mx-auto" />
        <h2 className="mt-3 text-base font-semibold text-slate-900">
          No generated replies yet
        </h2>
        <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
          Replies generated in the AI Reply Assistant are stored locally here so you can copy, reuse, or delete them at any time.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reply history..."
            className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          {confirmingClear ? (
            <>
              <button
                type="button"
                onClick={async () => {
                  await api.clearReplyHistory();
                  setConfirmingClear(false);
                  await onRefresh();
                }}
                className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800 cursor-pointer"
              >
                Confirm Clear All
              </button>
              <button
                type="button"
                onClick={() => setConfirmingClear(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingClear(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-red-700 hover:border-red-200 cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear History
            </button>
          )}
        </div>
      </div>

      <ul className="divide-y divide-slate-100">
        {filtered.map((item) => (
          <li key={item.id} className="px-6 py-4 space-y-2.5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                <span className="font-semibold text-slate-900">
                  {item.conversationTitle}
                </span>
                <span aria-hidden="true">·</span>
                <span>{item.language}</span>
                <span aria-hidden="true">·</span>
                <span>{item.tone}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {new Date(item.createdAt).toLocaleString()}
                </span>
                <span aria-hidden="true">·</span>
                {item.status === 'sent_confirmed' ? (
                  <span className="text-emerald-700 font-medium">
                    Manually sent
                  </span>
                ) : item.status === 'copied' ? (
                  <span className="text-slate-700 font-medium">Copied</span>
                ) : (
                  <span>Draft</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(item)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  {copiedId === item.id ? (
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
                  onClick={openWhatsAppWeb}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-emerald-700" />
                  WhatsApp
                </button>
                {item.status !== 'sent_confirmed' && (
                  <button
                    type="button"
                    onClick={async () => {
                      await api.updateReply(item.id, {
                        status: 'sent_confirmed',
                      });
                      await onRefresh();
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Confirm Sent
                  </button>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    await api.deleteReply(item.id);
                    await onRefresh();
                  }}
                  aria-label="Delete reply"
                  className="p-1.5 text-slate-400 hover:text-red-700 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {item.targetMessageExcerpt && (
              <p
                dir="auto"
                className="text-xs text-slate-500 bg-slate-50 rounded px-3 py-1.5 border border-slate-200/70"
              >
                In reply to: {item.targetMessageExcerpt}
              </p>
            )}
            <p
              dir="auto"
              className="text-sm text-slate-800 whitespace-pre-wrap"
            >
              {item.replyText}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
};
