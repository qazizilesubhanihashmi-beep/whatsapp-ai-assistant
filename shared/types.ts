export type SupportedLanguage = 'English' | 'Roman Urdu' | 'Urdu';

export type ReplyTone =
  | 'Short and direct'
  | 'Friendly'
  | 'Professional'
  | 'Detailed'
  | 'Custom';

export type ConversationCategory = 'contact' | 'group';

export type ImportSourceType = 'paste' | 'export' | 'manual';

export interface ImportantPoint {
  text: string;
  category: 'decision' | 'deadline' | 'action_item' | 'key_info';
  sender: string;
  timestamp: string;
}

export interface PendingQuestion {
  messageId: string;
  question: string;
  sender: string;
  timestamp: string;
  answered: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  category: ConversationCategory;
  sourceType: ImportSourceType;
  detectedLanguage: string | null;
  summary: string | null;
  importantPoints: ImportantPoint[];
  pendingQuestions: PendingQuestion[];
  lastAnalyzedAt: string | null;
  messageCount?: number;
  importantCount?: number;
  needsReplyCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  sender: string;
  content: string;
  sentAt: string | null;
  isFromMe: boolean;
  isImportant: boolean;
  importanceReason: string | null;
  needsReply: boolean;
  detectedLanguage: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface ReplyHistoryItem {
  id: string;
  conversationId: string | null;
  conversationTitle: string;
  targetMessageId: string | null;
  targetMessageExcerpt: string | null;
  replyText: string;
  language: SupportedLanguage;
  tone: ReplyTone;
  customInstruction: string | null;
  status: 'draft' | 'copied' | 'sent_confirmed';
  createdAt: string;
  confirmedSentAt: string | null;
}

export type RecurrenceType = 'once' | 'daily' | 'weekly' | 'custom';

export type ScheduleStatus =
  | 'upcoming'
  | 'due'
  | 'missed'
  | 'sent_confirmed'
  | 'cancelled';

export interface ScheduledMessage {
  id: string;
  conversationId: string | null;
  recipientLabel: string;
  recipientType: ConversationCategory;
  messageText: string;
  language: SupportedLanguage;
  tone: ReplyTone;
  customInstruction: string | null;
  scheduledDate: string; // YYYY-MM-DD in target timezone
  scheduledTime: string; // HH:mm in target timezone
  timezone: string; // Default: Asia/Karachi
  nextRunUtc: string;
  recurrence: RecurrenceType;
  customDays: number[]; // 0=Sun..6=Sat
  status: ScheduleStatus;
  lastNotifiedForRunUtc: string | null;
  notifiedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleExecution {
  id: string;
  scheduleId: string;
  recipientLabel: string;
  recipientType: ConversationCategory;
  messageText: string;
  scheduledDate: string;
  scheduledTime: string;
  timezone: string;
  recurrence: RecurrenceType;
  scheduledRunUtc: string;
  status: 'due' | 'missed' | 'sent_confirmed' | 'cancelled' | 'skipped';
  notifiedAt: string | null;
  confirmedSentAt: string | null;
}

export interface ActivityLogItem {
  id: string;
  actionType: string;
  summary: string;
  entityId: string | null;
  createdAt: string;
}

export interface AppSettings {
  defaultLanguage: SupportedLanguage;
  defaultTone: ReplyTone;
  userDisplayName: string;
  timezone: string;
  desktopNotificationsEnabled: boolean;
  soundAlertsEnabled: boolean;
}

export interface DashboardSummary {
  totalConversations: number;
  totalAnalyzedMessages: number;
  totalMessages: number;
  repliesGenerated: number;
  repliesConfirmedSent: number;
  upcomingSchedules: number;
  dueOrMissedCount: number;
  recentActivity: ActivityLogItem[];
}

export interface HealthStatus {
  sqliteReady: boolean;
  geminiConfigured: boolean;
  model: string;
  timezone: string;
  lastGeminiError: string | null;
  host: string;
  port: number;
}
