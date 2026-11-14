import React from 'react';
import {
  BellRing,
  BookOpenText,
  CalendarClock,
  FileInput,
  History,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Sparkles,
  Star,
  X,
} from 'lucide-react';

export type NavSection =
  | 'dashboard'
  | 'import'
  | 'conversations'
  | 'reply'
  | 'important'
  | 'summaries'
  | 'scheduler'
  | 'history'
  | 'settings';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  dueCount: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: {
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'import', label: 'Import Messages', icon: FileInput },
  { id: 'conversations', label: 'Conversations', icon: MessageSquare },
  { id: 'reply', label: 'AI Reply Assistant', icon: Sparkles },
  { id: 'important', label: 'Important Messages', icon: Star },
  { id: 'summaries', label: 'Conversation Summaries', icon: BookOpenText },
  { id: 'scheduler', label: 'Message Scheduler', icon: CalendarClock },
  { id: 'history', label: 'Reply History', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  dueCount,
  mobileOpen,
  onCloseMobile,
}) => {
  const content = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src="/icon.svg"
            alt="WhatsApp AI Assistant icon"
            className="w-7 h-7 rounded-lg shrink-0"
          />
          <span className="font-display text-sm font-semibold tracking-tight text-slate-900 truncate">
            WhatsApp AI Assistant
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation"
          className="lg:hidden p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5" aria-label="Primary navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectSection(item.id);
                onCloseMobile();
              }}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-emerald-50 text-emerald-900 font-medium'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-emerald-700' : 'text-slate-400'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </span>
              {item.id === 'scheduler' && dueCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-mono font-medium text-amber-700 tabular-nums shrink-0">
                  <BellRing className="w-3.5 h-3.5" />
                  {dueCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-slate-200 text-xs text-slate-500 leading-relaxed">
        Personal workspace. Replies and scheduled reminders are always copied and sent manually by you on WhatsApp Web.
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 h-screen sticky top-0">
        {content}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] h-full z-10">
            {content}
          </aside>
        </div>
      )}
    </>
  );
};
