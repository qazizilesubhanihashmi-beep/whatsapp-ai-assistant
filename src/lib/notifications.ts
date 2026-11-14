import type { ScheduleExecution } from '../../shared/types.ts';

export function playAlertChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch {
    // Ignore audio context autoplay restrictions
  }
}

export async function requestDesktopNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  if (Notification.permission === 'granted') return 'granted';
  return Notification.requestPermission();
}

export function triggerDesktopReminderNotification(
  exec: ScheduleExecution,
  onClick?: () => void
) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const isMissed = exec.status === 'missed';
  const title = isMissed
    ? `Missed WhatsApp Reminder: ${exec.recipientLabel}`
    : `WhatsApp Reminder Due: ${exec.recipientLabel}`;
  const body = `${exec.scheduledDate} ${exec.scheduledTime} (${exec.timezone})\n${exec.messageText.slice(
    0,
    140
  )}`;
  const tag = `wa-schedule-${exec.id}`;

  try {
    const notification = new Notification(title, {
      body,
      tag,
      icon: '/pwa-192x192.png',
      requireInteraction: true,
    });
    notification.onclick = () => {
      window.focus();
      onClick?.();
      notification.close();
    };
  } catch {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((reg) =>
          reg.showNotification(title, {
            body,
            tag,
            icon: '/pwa-192x192.png',
          })
        )
        .catch(() => {});
    }
  }
}

export function openWhatsAppWeb() {
  const link = document.createElement('a');
  link.href = 'https://web.whatsapp.com';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
