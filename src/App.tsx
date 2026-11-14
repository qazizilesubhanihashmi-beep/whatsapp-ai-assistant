import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Menu, Plus, WifiOff } from 'lucide-react';
import type {
  AppSettings,
  Conversation,
  DashboardSummary,
  HealthStatus,
  Message,
  ReplyHistoryItem,
  ScheduleExecution,
  ScheduledMessage,
} from '../shared/types.ts';
import { DEFAULT_TIMEZONE, getNowInTimeZone } from '../shared/timezone.ts';
import { api } from './lib/api.ts';
import {
  playAlertChime,
  triggerDesktopReminderNotification,
} from './lib/notifications.ts';
import { useOnlineStatus } from './hooks/usePWAInstall.ts';
import { Sidebar, type NavSection } from './components/Sidebar.tsx';
import { PWAInstallButton } from './components/PWAInstallButton.tsx';
import { DueReminderBanner } from './components/DueReminderBanner.tsx';
import { DashboardView } from './pages/DashboardView.tsx';
import { ImportMessagesView } from './pages/ImportMessagesView.tsx';
import { ConversationsView } from './pages/ConversationsView.tsx';
import { ReplyAssistantView } from './pages/ReplyAssistantView.tsx';
import { ImportantMessagesView } from './pages/ImportantMessagesView.tsx';
import { SummariesView } from './pages/SummariesView.tsx';
import { SchedulerView } from './pages/SchedulerView.tsx';
import { ReplyHistoryView } from './pages/ReplyHistoryView.tsx';
import { SettingsView } from './pages/SettingsView.tsx';

const SECTION_TITLES: Record<NavSection, string> = {
  dashboard: 'Overview',
  import: 'Import Messages',
  conversations: 'Conversations',
  reply: 'AI Reply Assistant',
  important: 'Important Messages',
  summaries: 'Conversation Summaries',
  scheduler: 'Message Scheduler',
  history: 'Reply History',
  settings: 'Settings',
};

const DEFAULT_SETTINGS: AppSettings = {
  defaultLanguage: 'English',
  defaultTone: 'Friendly',
  userDisplayName: 'You',
  timezone: DEFAULT_TIMEZONE,
  desktopNotificationsEnabled: true,
  soundAlertsEnabled: true,
};

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [preselectedReplyMsg, setPreselectedReplyMsg] =
    useState<Message | null>(null);

  const [replyHistory, setReplyHistory] = useState<ReplyHistoryItem[]>([]);
  const [schedules, setSchedules] = useState<ScheduledMessage[]>([]);
  const [executions, setExecutions] = useState<ScheduleExecution[]>([]);
  const [activeNotifications, setActiveNotifications] = useState<
    ScheduleExecution[]
  >([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clockDisplay, setClockDisplay] = useState(() =>
    getNowInTimeZone(DEFAULT_TIMEZONE)
  );

  const isOnline = useOnlineStatus();
  const notifiedExecIdsRef = useRef<Set<string>>(new Set());
  const settingsRef = useRef<AppSettings>(settings);
  settingsRef.current = settings;

  const refreshAll = useCallback(async () => {
    setLoadError(null);
    try {
      const [
        healthRes,
        dashRes,
        convRes,
        replyRes,
        schedRes,
        settingsRes,
      ] = await Promise.all([
        api.getHealth(),
        api.getDashboard(),
        api.getConversations(),
        api.getReplyHistory(),
        api.getSchedulerData(),
        api.getSettings(),
      ]);

      setHealth(healthRes);
      setSummary(dashRes);
      setConversations(convRes);
      setReplyHistory(replyRes);
      setSchedules(schedRes.schedules);
      setExecutions(schedRes.executions);
      setActiveNotifications(schedRes.activeNotifications);
      setSettings(settingsRes);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Failed to reach local backend.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Live clock in active timezone (defaults to Asia/Karachi)
  useEffect(() => {
    const tz = settings.timezone || DEFAULT_TIMEZONE;
    setClockDisplay(getNowInTimeZone(tz));
    const timer = setInterval(() => {
      setClockDisplay(getNowInTimeZone(tz));
    }, 15_000);
    return () => clearInterval(timer);
  }, [settings.timezone]);

  const dispatchClientAlert = useCallback((exec: ScheduleExecution) => {
    if (notifiedExecIdsRef.current.has(exec.id)) return;
    notifiedExecIdsRef.current.add(exec.id);

    const cfg = settingsRef.current;
    if (cfg.desktopNotificationsEnabled) {
      triggerDesktopReminderNotification(exec, () => {
        setActiveSection('scheduler');
      });
    }
    if (cfg.soundAlertsEnabled) {
      playAlertChime();
    }
  }, []);

  // SSE subscription for real-time due and missed scheduled reminders
  useEffect(() => {
    const source = new EventSource('/api/scheduler/stream');

    source.addEventListener('snapshot', (event) => {
      try {
        const list = JSON.parse(
          (event as MessageEvent).data
        ) as ScheduleExecution[];
        setActiveNotifications(list);
        for (const exec of list) {
          dispatchClientAlert(exec);
        }
      } catch {
        // Ignore parse error
      }
    });

    source.addEventListener('notification', (event) => {
      try {
        const exec = JSON.parse(
          (event as MessageEvent).data
        ) as ScheduleExecution;
        dispatchClientAlert(exec);
        api
          .getSchedulerData()
          .then((res) => {
            setSchedules(res.schedules);
            setExecutions(res.executions);
            setActiveNotifications(res.activeNotifications);
          })
          .catch(() => {});
        api.getDashboard().then(setSummary).catch(() => {});
      } catch {
        // Ignore parse error
      }
    });

    const fallbackPoll = setInterval(() => {
      api
        .getSchedulerData()
        .then((res) => {
          setSchedules(res.schedules);
          setExecutions(res.executions);
          setActiveNotifications(res.activeNotifications);
          for (const exec of res.activeNotifications) {
            dispatchClientAlert(exec);
          }
        })
        .catch(() => {});
    }, 30_000);

    return () => {
      source.close();
      clearInterval(fallbackPoll);
    };
  }, [dispatchClientAlert]);

  const handleConfirmExecutionSent = async (execId: string) => {
    await api.confirmExecutionSent(execId);
    await refreshAll();
  };

  const handleDismissExecution = async (execId: string) => {
    await api.dismissExecution(execId);
    await refreshAll();
  };

  const handleDraftReply = (conversationId: string, message?: Message) => {
    setSelectedConversationId(conversationId);
    setPreselectedReplyMsg(message || null);
    setActiveSection('reply');
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        dueCount={activeNotifications.length}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Workspace Header */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-6 py-3.5">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-6">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open navigation"
                className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="font-display text-lg font-semibold text-slate-900 truncate">
                {SECTION_TITLES[activeSection]}
              </h1>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className="hidden md:inline-block text-xs font-mono text-slate-500 tabular-nums whitespace-nowrap">
                {clockDisplay.display} {clockDisplay.tzShort}
              </span>
              <PWAInstallButton compact />
              <button
                type="button"
                onClick={() => setActiveSection('import')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Import Chat
              </button>
            </div>
          </div>
        </header>

        {/* Due / Missed Scheduled Reminders Banner */}
        <DueReminderBanner
          notifications={activeNotifications}
          onConfirmSent={handleConfirmExecutionSent}
          onDismiss={handleDismissExecution}
          onOpenScheduler={() => setActiveSection('scheduler')}
        />

        {/* Main Viewport */}
        <main className="flex-1 px-6 py-6">
          <div className="max-w-6xl mx-auto">
            {activeSection === 'dashboard' && (
              <DashboardView
                summary={summary}
                health={health}
                activeNotifications={activeNotifications}
                loading={loading}
                error={loadError}
                onNavigate={setActiveSection}
                onRefresh={refreshAll}
              />
            )}

            {activeSection === 'import' && (
              <ImportMessagesView
                onImported={async (conv) => {
                  await refreshAll();
                  setSelectedConversationId(conv.id);
                  setActiveSection('conversations');
                }}
              />
            )}

            {activeSection === 'conversations' && (
              <ConversationsView
                conversations={conversations}
                selectedId={selectedConversationId}
                onSelect={setSelectedConversationId}
                onRefresh={refreshAll}
                onDraftReply={handleDraftReply}
                onGoImport={() => setActiveSection('import')}
              />
            )}

            {activeSection === 'reply' && (
              <ReplyAssistantView
                conversations={conversations}
                settings={settings}
                preselectedConversationId={selectedConversationId}
                preselectedMessage={preselectedReplyMsg}
                onReplySaved={refreshAll}
              />
            )}

            {activeSection === 'important' && (
              <ImportantMessagesView
                onDraftReply={handleDraftReply}
                onOpenConversation={(id) => {
                  setSelectedConversationId(id);
                  setActiveSection('conversations');
                }}
              />
            )}

            {activeSection === 'summaries' && (
              <SummariesView
                conversations={conversations}
                onRefresh={refreshAll}
                onOpenConversation={(id) => {
                  setSelectedConversationId(id);
                  setActiveSection('conversations');
                }}
              />
            )}

            {activeSection === 'scheduler' && (
              <SchedulerView
                conversations={conversations}
                settings={settings}
                schedules={schedules}
                executions={executions}
                activeNotifications={activeNotifications}
                onRefresh={refreshAll}
                onConfirmExecutionSent={handleConfirmExecutionSent}
                onDismissExecution={handleDismissExecution}
              />
            )}

            {activeSection === 'history' && (
              <ReplyHistoryView items={replyHistory} onRefresh={refreshAll} />
            )}

            {activeSection === 'settings' && (
              <SettingsView
                settings={settings}
                health={health}
                onSettingsUpdated={(next) => setSettings(next)}
                onAllDataCleared={async () => {
                  setSelectedConversationId(null);
                  setPreselectedReplyMsg(null);
                  await refreshAll();
                }}
              />
            )}
          </div>
        </main>
      </div>

      {!isOnline && (
        <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Offline — Local SQLite data available; Gemini requests require internet.</span>
        </div>
      )}
    </div>
  );
}
