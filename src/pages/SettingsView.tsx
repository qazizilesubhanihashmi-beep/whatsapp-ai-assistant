import React, { useState } from 'react';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import type {
  AppSettings,
  HealthStatus,
  ReplyTone,
  SupportedLanguage,
} from '../../shared/types.ts';
import { api } from '../lib/api.ts';
import {
  playAlertChime,
  requestDesktopNotificationPermission,
} from '../lib/notifications.ts';
import { PWAInstallButton } from '../components/PWAInstallButton.tsx';

interface SettingsViewProps {
  settings: AppSettings;
  health: HealthStatus | null;
  onSettingsUpdated: (next: AppSettings) => void;
  onAllDataCleared: () => Promise<void>;
}

const LANGUAGES: SupportedLanguage[] = ['English', 'Roman Urdu', 'Urdu'];
const TONES: ReplyTone[] = [
  'Short and direct',
  'Friendly',
  'Professional',
  'Detailed',
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  health,
  onSettingsUpdated,
  onAllDataCleared,
}) => {
  const [form, setForm] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [geminiTestResult, setGeminiTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [testingGemini, setTestingGemini] = useState(false);
  const [notifStatus, setNotifStatus] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wiping, setWiping] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(null);
    try {
      const updated = await api.saveSettings(form);
      onSettingsUpdated(updated);
      setSavedNotice('Settings saved locally.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestGemini = async () => {
    setTestingGemini(true);
    setGeminiTestResult(null);
    try {
      const res = await api.testGemini();
      setGeminiTestResult({ ok: true, message: res.message });
    } catch (err) {
      setGeminiTestResult({
        ok: false,
        message:
          err instanceof Error ? err.message : 'Gemini test request failed.',
      });
    } finally {
      setTestingGemini(false);
    }
  };

  const handleRequestNotifications = async () => {
    const perm = await requestDesktopNotificationPermission();
    setNotifStatus(perm);
    if (perm === 'granted') {
      playAlertChime();
      new Notification('WhatsApp AI Assistant', {
        body: 'Desktop reminder notifications are enabled.',
        icon: '/pwa-192x192.png',
      });
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Preferences */}
      <form
        onSubmit={handleSave}
        className="rounded-xl border border-slate-200 bg-white p-6 space-y-5"
      >
        <h2 className="text-base font-semibold text-slate-900">
          Assistant & Scheduler Preferences
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Default Reply Language
            </label>
            <select
              value={form.defaultLanguage}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  defaultLanguage: e.target.value as SupportedLanguage,
                }))
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Default Reply Style
            </label>
            <select
              value={form.defaultTone}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  defaultTone: e.target.value as ReplyTone,
                }))
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            >
              {TONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Your Display Name in WhatsApp Exports
            </label>
            <input
              type="text"
              value={form.userDisplayName}
              onChange={(e) =>
                setForm((p) => ({ ...p, userDisplayName: e.target.value }))
              }
              placeholder="e.g., You or your WhatsApp profile name"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Scheduler Timezone
            </label>
            <select
              value={form.timezone}
              onChange={(e) =>
                setForm((p) => ({ ...p, timezone: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-900"
            >
              <option value="Asia/Karachi">Asia/Karachi (PKT, UTC+5)</option>
              <option value="UTC">UTC</option>
            </select>
          </div>
        </div>

        <div className="space-y-2.5 pt-2">
          <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.desktopNotificationsEnabled}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  desktopNotificationsEnabled: e.target.checked,
                }))
              }
              className="rounded border-slate-300 text-emerald-700"
            />
            Show Windows / Browser desktop notifications when scheduled reminders are due
          </label>
          <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.soundAlertsEnabled}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  soundAlertsEnabled: e.target.checked,
                }))
              }
              className="rounded border-slate-300 text-emerald-700"
            />
            Play gentle chime alert for due and missed reminders
          </label>
        </div>

        <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-100">
          <span className="text-xs text-emerald-700 font-medium">
            {savedNotice}
          </span>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* Desktop Notifications & PWA */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Desktop Notifications & App Install
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Notification permission status:{' '}
              <span className="font-mono text-slate-800">{notifStatus}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleRequestNotifications}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Bell className="w-3.5 h-3.5 text-emerald-700" />
              Enable & Test Desktop Notification
            </button>
            <PWAInstallButton />
          </div>
        </div>
      </div>

      {/* Server-side Gemini Diagnostics */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Gemini Server Connection
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              API credentials stay strictly on the local Node.js server via environment configuration.
            </p>
          </div>
          <button
            type="button"
            disabled={testingGemini}
            onClick={handleTestGemini}
            className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
          >
            {testingGemini ? 'Verifying...' : 'Verify Gemini Connection'}
          </button>
        </div>

        <div className="text-xs text-slate-600 flex items-center gap-2">
          <span>Active model:</span>
          <span className="font-mono text-slate-900">
            {health?.model || 'gemini-4-hydrogen'}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Server secret:{' '}
            {health?.geminiConfigured ? 'Configured' : 'Not configured'}
          </span>
        </div>

        {geminiTestResult && (
          <div
            className={`rounded-lg border px-3.5 py-2.5 text-xs flex items-center gap-2 ${
              geminiTestResult.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            {geminiTestResult.ok ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{geminiTestResult.message}</span>
          </div>
        )}
      </div>

      {/* Privacy & Data Deletion */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900">
              Privacy & Local Data Deletion
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              This assistant never collects WhatsApp passwords, OTPs, cookies, or session tokens. All imported chats, summaries, reply drafts, and schedules remain inside your local SQLite file.
            </p>
          </div>
        </div>

        <div className="pt-2 flex items-center gap-3">
          {confirmWipe ? (
            <>
              <button
                type="button"
                disabled={wiping}
                onClick={async () => {
                  setWiping(true);
                  try {
                    await api.clearAllData();
                    await onAllDataCleared();
                    setConfirmWipe(false);
                  } finally {
                    setWiping(false);
                  }
                }}
                className="rounded-lg bg-red-700 px-4 py-2 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-50 cursor-pointer"
              >
                {wiping ? 'Deleting...' : 'Yes, Delete All Local Data'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmWipe(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmWipe(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-800 hover:bg-red-100 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete All Conversations, Replies & Schedules
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
