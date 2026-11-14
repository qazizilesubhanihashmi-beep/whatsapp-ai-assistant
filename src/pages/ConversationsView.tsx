import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  MessageSquarePlus,
  Search,
  Sparkles,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import type { Conversation, Message } from '../../shared/types.ts';
import { api } from '../lib/api.ts';

interface ConversationsViewProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRefresh: () => Promise<void>;
  onDraftReply: (conversationId: string, message?: Message) => void;
  onGoImport: () => void;
}

export const ConversationsView: React.FC<ConversationsViewProps> = ({
  conversations,
  selectedId,
  onSelect,
  onRefresh,
  onDraftReply,
  onGoImport,
}) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'contact' | 'group'>('all');
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add message inline form
  const [newSender, setNewSender] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newIsFromMe, setNewIsFromMe] = useState(false);
  const [addingMsg, setAddingMsg] = useState(false);

  const filtered = conversations.filter((c) => {
    const matchesSearch = c.title.toLowerCase().includes(search.toLowerCase());
    const matchesCat = categoryFilter === 'all' || c.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  useEffect(() => {
    if (!selectedId) {
      setActiveConv(null);
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    setError(null);
    api
      .getConversation(selectedId)
      .then((res) => {
        if (!cancelled) {
          setActiveConv(res.conversation);
          setMessages(res.messages);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load chat.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const handleAnalyze = async () => {
    if (!activeConv) return;
    setAnalyzing(true);
    setError(null);
    try {
      const res = await api.analyzeConversation(activeConv.id);
      setActiveConv(res.conversation);
      setMessages(res.messages);
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Gemini analysis failed.'
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await api.deleteConversation(id);
      if (selectedId === id) {
        onSelect(null);
      }
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete chat.');
    }
  };

  const handleAddMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv || !newContent.trim()) return;
    setAddingMsg(true);
    setError(null);
    try {
      const added = await api.addMessageToConversation(activeConv.id, {
        sender: newIsFromMe ? 'You' : newSender.trim() || activeConv.title,
        content: newContent.trim(),
        isFromMe: newIsFromMe,
      });
      setMessages((prev) => [...prev, added]);
      setNewContent('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add message.');
    } finally {
      setAddingMsg(false);
    }
  };

  if (conversations.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center">
        <MessageSquarePlus className="w-9 h-9 text-slate-300 mx-auto" />
        <h2 className="mt-3 text-base font-semibold text-slate-900">
          No imported conversations yet
        </h2>
        <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
          Import a WhatsApp chat export or paste selected messages to view transcripts, analyze key points, and draft context-aware replies.
        </p>
        <button
          type="button"
          onClick={onGoImport}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 cursor-pointer"
        >
          Import Messages
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Conversation Directory */}
      <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="p-4 border-b border-slate-200 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts or groups..."
              className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
            {(['all', 'contact', 'group'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setCategoryFilter(tab)}
                className={`py-1 text-xs font-medium rounded-md capitalize transition-colors cursor-pointer ${
                  categoryFilter === tab
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab === 'all' ? 'All' : `${tab}s`}
              </button>
            ))}
          </div>
        </div>

        <ul className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
          {filtered.map((conv) => {
            const isSelected = conv.id === selectedId;
            return (
              <li key={conv.id}>
                <button
                  type="button"
                  onClick={() => onSelect(conv.id)}
                  className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-50/70'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 min-w-0 font-medium text-sm text-slate-900">
                      {conv.category === 'group' ? (
                        <Users className="w-4 h-4 text-slate-400 shrink-0" />
                      ) : (
                        <User className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <span className="truncate">{conv.title}</span>
                    </span>
                    <span className="text-xs font-mono text-slate-400 tabular-nums shrink-0">
                      {conv.messageCount ?? 0}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <span className="capitalize">{conv.category}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {conv.lastAnalyzedAt
                        ? conv.detectedLanguage || 'Analyzed'
                        : 'Not analyzed'}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="px-4 py-8 text-center text-xs text-slate-500">
              No matching conversations.
            </li>
          )}
        </ul>
      </div>

      {/* Right Conversation Workspace */}
      <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-white overflow-hidden">
        {!selectedId || !activeConv ? (
          <div className="px-6 py-20 text-center text-sm text-slate-500">
            {loadingDetail
              ? 'Loading conversation...'
              : 'Select a conversation on the left to read messages, analyze with Gemini, or generate a reply.'}
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {/* Header */}
            <div className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-slate-900 truncate">
                  {activeConv.title}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                  {activeConv.category === 'group' ? 'Group' : 'Contact'}
                  {' · '}
                  {messages.length} message{messages.length === 1 ? '' : 's'}
                  {activeConv.detectedLanguage
                    ? ` · ${activeConv.detectedLanguage}`
                    : ''}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <button
                  type="button"
                  disabled={analyzing || messages.length === 0}
                  onClick={handleAnalyze}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {analyzing
                    ? 'Analyzing...'
                    : activeConv.lastAnalyzedAt
                    ? 'Re-analyze with Gemini'
                    : 'Analyze with Gemini'}
                </button>
                <button
                  type="button"
                  onClick={() => onDraftReply(activeConv.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                >
                  Draft Reply
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(activeConv.id)}
                  title="Delete conversation"
                  aria-label="Delete conversation"
                  className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-500 hover:text-red-700 hover:border-red-200 hover:bg-red-50 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {error && (
              <div className="px-6 py-3 bg-red-50 text-sm text-red-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Gemini Summary Snapshot */}
            {activeConv.summary && (
              <div className="px-6 py-4 bg-slate-50/70 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-slate-800">
                    Gemini Summary
                  </span>
                  <span className="font-mono">
                    {activeConv.detectedLanguage}
                  </span>
                </div>
                <p dir="auto" className="text-sm text-slate-700 leading-relaxed">
                  {activeConv.summary}
                </p>
                {activeConv.importantPoints.length > 0 && (
                  <ul className="space-y-1 pt-1">
                    {activeConv.importantPoints.map((pt, i) => (
                      <li key={i} className="text-xs text-slate-700">
                        <span className="font-medium text-slate-900 capitalize">
                          {pt.category.replace('_', ' ')}:
                        </span>{' '}
                        {pt.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Message Transcript */}
            <div className="p-6 space-y-3 max-h-[460px] overflow-y-auto bg-slate-50/40">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.isFromMe ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl border px-4 py-3 space-y-1.5 ${
                      msg.isFromMe
                        ? 'bg-emerald-50/80 border-emerald-200 text-slate-900'
                        : 'bg-white border-slate-200 text-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4 text-xs text-slate-500">
                      <span className="font-medium text-slate-800">
                        {msg.sender}
                      </span>
                      {msg.sentAt && (
                        <span className="font-mono tabular-nums">
                          {msg.sentAt}
                        </span>
                      )}
                    </div>

                    <p
                      dir="auto"
                      className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed"
                    >
                      {msg.content}
                    </p>

                    {(msg.isImportant || msg.needsReply || !msg.isFromMe) && (
                      <div className="pt-1 flex items-center justify-between gap-3 text-xs border-t border-slate-100">
                        <span className="text-slate-500">
                          {msg.isImportant && (
                            <span className="text-amber-800 font-medium">
                              Important
                              {msg.importanceReason
                                ? ` · ${msg.importanceReason}`
                                : ''}
                            </span>
                          )}
                          {msg.isImportant && msg.needsReply && ' · '}
                          {msg.needsReply && (
                            <span className="text-emerald-700 font-medium">
                              Needs reply
                            </span>
                          )}
                        </span>
                        {!msg.isFromMe && (
                          <button
                            type="button"
                            onClick={() => onDraftReply(activeConv.id, msg)}
                            className="text-emerald-700 font-medium hover:underline cursor-pointer whitespace-nowrap ml-auto"
                          >
                            Reply to this
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Inline Add Message */}
            <form
              onSubmit={handleAddMessage}
              className="px-6 py-4 bg-white space-y-3"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  type="text"
                  disabled={newIsFromMe}
                  value={newIsFromMe ? 'You' : newSender}
                  onChange={(e) => setNewSender(e.target.value)}
                  placeholder={`Sender (${activeConv.title})`}
                  className="w-48 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-900 disabled:bg-slate-100"
                />
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newIsFromMe}
                    onChange={(e) => setNewIsFromMe(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-700"
                  />
                  Sent by me
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  dir="auto"
                  type="text"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Add another selected message to this conversation..."
                  className="flex-1 rounded-lg border border-slate-200 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={addingMsg || !newContent.trim()}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                >
                  {addingMsg ? 'Adding...' : 'Add Message'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
