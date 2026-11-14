import React from 'react';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileInput,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import type {
  DashboardSummary,
  HealthStatus,
  ScheduleExecution,
} from '../../shared/types.ts';
import type { NavSection } from '../components/Sidebar.tsx';

interface DashboardViewProps {
  summary: DashboardSummary | null;
  health: HealthStatus | null;
  activeNotifications: ScheduleExecution[];
  loading: boolean;
  error: string | null;
  onNavigate: (section: NavSection) => void;
  onRefresh: () => void;
}

function formatTimeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  summary,
  health,
  activeNotifications,
  loading,
  error,
  onNavigate,
  onRefresh,
}) => {
  if (loading && !summary) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 rounded-xl border border-slate-200 bg-white p-5 animate-pulse"
            />
          ))}
        </div>
        <div className="h-64 rounded-xl border border-slate-200 bg-white animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between gap-4 text-sm text-red-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="text-xs font-medium underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Primary KPI Grid */}
      <section aria-label="Workspace metrics">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">
              Imported Conversations
            </p>
            <p className="mt-2 text-3xl font-display font-semibold text-slate-900 tabular-nums">
              {summary?.totalConversations ?? 0}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {summary?.totalMessages ?? 0} total stored messages
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">
              Analyzed Messages
            </p>
            <p className="mt-2 text-3xl font-display font-semibold text-slate-900 tabular-nums">
              {summary?.totalAnalyzedMessages ?? 0}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Processed by {health?.model || 'Gemini'}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">
              Replies Generated
            </p>
            <p className="mt-2 text-3xl font-display font-semibold text-slate-900 tabular-nums">
              {summary?.repliesGenerated ?? 0}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {summary?.repliesConfirmedSent ?? 0} confirmed manually sent
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">
              Upcoming Schedules
            </p>
            <p className="mt-2 text-3xl font-display font-semibold text-slate-900 tabular-nums">
              {summary?.upcomingSchedules ?? 0}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {activeNotifications.length} due or missed awaiting action
            </p>
          </div>
        </div>
      </section>

      {/* Main Split: Quick Actions + Gemini Connection & Privacy Posture */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              Recent Activity
            </h2>
            <span className="text-xs text-slate-500">
              Stored locally in SQLite
            </span>
          </div>

          {!summary || summary.recentActivity.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <MessageSquare className="w-8 h-8 text-slate-300 mx-auto" />
              <h3 className="mt-3 text-sm font-semibold text-slate-900">
                No activity recorded yet
              </h3>
              <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
                Paste selected WhatsApp messages, upload a chat export (.txt), or create a scheduled message reminder to get started.
              </p>
              <div className="mt-5 flex items-center justify-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => onNavigate('import')}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 cursor-pointer"
                >
                  <FileInput className="w-4 h-4" />
                  Import Messages
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('scheduler')}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <CalendarClock className="w-4 h-4" />
                  Schedule Reminder
                </button>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {summary.recentActivity.map((item) => (
                <li
                  key={item.id}
                  className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                >
                  <p className="text-sm text-slate-700 min-w-0 truncate">
                    {item.summary}
                  </p>
                  <span className="text-xs font-mono text-slate-400 tabular-nums shrink-0">
                    {formatTimeAgo(item.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-6">
          {/* Quick Workflow */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
            <h2 className="text-base font-semibold text-slate-900">
              Workflow Shortcuts
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('import')}
              className="w-full flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2.5">
                <FileInput className="w-4 h-4 text-emerald-700" />
                Import or Paste Messages
              </span>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('reply')}
              className="w-full flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-emerald-700" />
                Draft AI Reply
              </span>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('scheduler')}
              className="w-full flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2.5">
                <CalendarClock className="w-4 h-4 text-emerald-700" />
                New Message Schedule
              </span>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          {/* Connection & Safety Posture */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">
              System & Privacy Status
            </h2>

            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-600">Gemini API</span>
                {health?.geminiConfigured ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                    <CheckCircle2 className="w-4 h-4" />
                    Configured ({health.model})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-medium text-amber-700">
                    <AlertCircle className="w-4 h-4" />
                    Missing server key
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-600">Local SQLite Store</span>
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                  <CheckCircle2 className="w-4 h-4" />
                  {health?.sqliteReady ? 'Ready' : 'Checking'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-600">Scheduler Timezone</span>
                <span className="font-mono text-xs text-slate-800">
                  {health?.timezone || 'Asia/Karachi'}
                </span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-start gap-2.5 text-xs text-slate-500 leading-relaxed">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <span>
                Personal WhatsApp safety: no browser scraping, no session tokens, and no automatic sending. You always copy and send manually on WhatsApp Web.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
