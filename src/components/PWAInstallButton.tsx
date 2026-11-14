import React, { useState } from 'react';
import { Download, MonitorDown } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';

interface Props {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<Props> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return compact ? null : (
      <span className="text-xs text-emerald-700 font-medium">
        Installed as desktop app
      </span>
    );
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-3.5 h-3.5 text-emerald-700" />
        Install Desktop App
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <MonitorDown className="w-3.5 h-3.5 text-emerald-700" />
          Install App
        </button>
        {showGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
              <h3 className="text-base font-semibold text-slate-900">
                Install WhatsApp AI Assistant
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Tap Share in your browser toolbar, then select Add to Home Screen to launch as a standalone app.
              </p>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
