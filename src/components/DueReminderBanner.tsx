import React, { useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  X,
} from 'lucide-react';
import type { ScheduleExecution } from '../../shared/types.ts';
import { openWhatsAppWeb } from '../lib/notifications.ts';

interface DueReminderBannerProps {
  notifications: ScheduleExecution[];
  onConfirmSent: (execId: string) => Promise<void>;
  onDismiss: (execId: string) => Promise<void>;
  onOpenScheduler: () => void;
}

export const DueReminderBanner: React.FC<DueReminderBannerProps> = ({
  notifications,
  onConfirmSent,
  onDismiss,
  onOpenScheduler,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (notifications.length === 0) return null;

  const handleCopy = async (exec: ScheduleExecution) => {
    try {
      await navigator.clipboard.writeText(exec.messageText);
      setCopiedId(exec.id);
      setTimeout(() => setCopiedId((prev) => (prev === exec.id ? null : prev)), 2500);
    } catch {
      // Clipboard fallback ignored
    }
  };

  return (
    <section
      aria-label="Due and missed scheduled reminders"
      className="bg-amber-50/70 border-b border-amber-200 px-6 py-4"
    >
      <div className="max-w-6xl mx-auto space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <BellRing className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              {notifications.length === 1
                ? '1 Scheduled WhatsApp Reminder Requires Manual Action'
                : `${notifications.length} Scheduled WhatsApp Reminders Require Manual Action`}
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenScheduler}
            className="text-xs font-medium text-amber-900 underline underline-offset-2 hover:text-amber-700 cursor-pointer whitespace-nowrap"
          >
            View in Message Scheduler
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {notifications.map((exec) => {
            const isMissed = exec.status === 'missed';
            const isBusy = busyId === exec.id;
            return (
              <div
                key={exec.id}
                className="rounded-lg border border-amber-200 bg-white p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="min-w-0 space-y-1.5 flex-1">
                  <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1 font-medium ${
                        isMissed ? 'text-red-700' : 'text-amber-800'
                      }`}
                    >
                      {isMissed ? (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      ) : (
                        <BellRing className="w-3.5 h-3.5" />
                      )}
                      {isMissed ? 'Missed while closed' : 'Due now'}
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
                    className="text-sm text-slate-800 whitespace-pre-wrap break-words bg-slate-50 rounded-md px-3 py-2 border border-slate-200/80"
                  >
                    {exec.messageText}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopy(exec)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
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
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-700" />
                    Open WhatsApp
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={async () => {
                      setBusyId(exec.id);
                      try {
                        await onConfirmSent(exec.id);
                      } finally {
                        setBusyId(null);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Confirm Manually Sent
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={async () => {
                      setBusyId(exec.id);
                      try {
                        await onDismiss(exec.id);
                      } finally {
                        setBusyId(null);
                      }
                    }}
                    title="Dismiss reminder"
                    aria-label="Dismiss reminder"
                    className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
