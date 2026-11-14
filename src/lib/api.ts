import type {
  AppSettings,
  Conversation,
  ConversationCategory,
  DashboardSummary,
  HealthStatus,
  ImportSourceType,
  Message,
  RecurrenceType,
  ReplyHistoryItem,
  ReplyTone,
  ScheduleExecution,
  ScheduledMessage,
  SupportedLanguage,
} from '../../shared/types.ts';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await res.json()
    : { error: await res.text() };

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  getHealth: () => request<HealthStatus>('/api/health'),
  testGemini: () =>
    request<{ ok: boolean; model: string; message: string }>(
      '/api/health/test-gemini',
      { method: 'POST' }
    ),

  getDashboard: () => request<DashboardSummary>('/api/dashboard'),

  getConversations: () => request<Conversation[]>('/api/conversations'),
  getConversation: (id: string) =>
    request<{ conversation: Conversation; messages: Message[] }>(
      `/api/conversations/${encodeURIComponent(id)}`
    ),

  previewParse: (rawText: string, fallbackSender?: string) =>
    request<{
      messages: {
        sender: string;
        content: string;
        sentAt: string | null;
        isFromMe: boolean;
      }[];
      inferredTitle: string;
      detectedFormat: string;
      skippedSystemLines: number;
    }>('/api/conversations/preview-parse', {
      method: 'POST',
      body: JSON.stringify({ rawText, fallbackSender }),
    }),

  importConversation: (payload: {
    title?: string;
    category: ConversationCategory;
    sourceType: ImportSourceType;
    rawText?: string;
    fallbackSender?: string;
    messages?: {
      sender: string;
      content: string;
      sentAt?: string | null;
      isFromMe?: boolean;
    }[];
  }) =>
    request<{
      conversation: Conversation;
      messages: Message[];
      skippedSystemLines: number;
    }>('/api/conversations/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  addMessageToConversation: (
    conversationId: string,
    payload: {
      sender?: string;
      content: string;
      sentAt?: string;
      isFromMe?: boolean;
    }
  ) =>
    request<Message>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  deleteConversation: (id: string) =>
    request<{ deleted: boolean }>(
      `/api/conversations/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    ),

  analyzeConversation: (id: string) =>
    request<{ conversation: Conversation; messages: Message[] }>(
      `/api/conversations/${encodeURIComponent(id)}/analyze`,
      { method: 'POST' }
    ),

  getImportantOverview: () =>
    request<{
      importantMessages: (Message & {
        conversationTitle: string;
        conversationCategory: string;
      })[];
      highlights: {
        conversationId: string;
        conversationTitle: string;
        category: string;
        lastAnalyzedAt: string;
        importantPoints: Conversation['importantPoints'];
        pendingQuestions: Conversation['pendingQuestions'];
      }[];
    }>('/api/important'),

  generateReply: (payload: {
    conversationId?: string | null;
    targetMessageId?: string | null;
    targetMessageText?: string;
    targetSender?: string;
    conversationTitle?: string;
    language: SupportedLanguage;
    tone: ReplyTone;
    customInstruction?: string;
  }) =>
    request<{ reply: ReplyHistoryItem; detectedInputLanguage: string }>(
      '/api/replies/generate',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  getReplyHistory: () => request<ReplyHistoryItem[]>('/api/replies'),

  updateReply: (
    id: string,
    payload: {
      replyText?: string;
      status?: 'draft' | 'copied' | 'sent_confirmed';
    }
  ) =>
    request<ReplyHistoryItem>(`/api/replies/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteReply: (id: string) =>
    request<{ deleted: boolean }>(`/api/replies/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  clearReplyHistory: () =>
    request<{ cleared: boolean }>('/api/replies', { method: 'DELETE' }),

  getSchedulerData: () =>
    request<{
      schedules: ScheduledMessage[];
      executions: ScheduleExecution[];
      activeNotifications: ScheduleExecution[];
    }>('/api/scheduler'),

  createSchedule: (payload: {
    conversationId?: string | null;
    recipientLabel: string;
    recipientType: ConversationCategory;
    messageText: string;
    language: SupportedLanguage;
    tone: ReplyTone;
    customInstruction?: string;
    scheduledDate: string;
    scheduledTime: string;
    timezone: string;
    recurrence: RecurrenceType;
    customDays: number[];
  }) =>
    request<ScheduledMessage>('/api/scheduler', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateSchedule: (
    id: string,
    payload: Partial<{
      conversationId: string | null;
      recipientLabel: string;
      recipientType: ConversationCategory;
      messageText: string;
      language: SupportedLanguage;
      tone: ReplyTone;
      customInstruction: string;
      scheduledDate: string;
      scheduledTime: string;
      timezone: string;
      recurrence: RecurrenceType;
      customDays: number[];
    }>
  ) =>
    request<ScheduledMessage>(`/api/scheduler/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  cancelSchedule: (id: string) =>
    request<ScheduledMessage>(
      `/api/scheduler/${encodeURIComponent(id)}/cancel`,
      { method: 'POST' }
    ),

  deleteSchedule: (id: string) =>
    request<{ deleted: boolean }>(
      `/api/scheduler/${encodeURIComponent(id)}`,
      { method: 'DELETE' }
    ),

  generateScheduleDraft: (payload: {
    conversationId?: string | null;
    recipientLabel: string;
    recipientType: ConversationCategory;
    topicOrInstruction: string;
    language: SupportedLanguage;
    tone: ReplyTone;
    customInstruction?: string;
    scheduledDate: string;
    scheduledTime: string;
  }) =>
    request<{ draftText: string }>('/api/scheduler/draft', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  confirmExecutionSent: (execId: string) =>
    request<ScheduleExecution>(
      `/api/scheduler/executions/${encodeURIComponent(execId)}/confirm`,
      { method: 'POST' }
    ),

  dismissExecution: (execId: string) =>
    request<{ dismissed: boolean }>(
      `/api/scheduler/executions/${encodeURIComponent(execId)}/dismiss`,
      { method: 'POST' }
    ),

  getSettings: () => request<AppSettings>('/api/settings'),
  saveSettings: (payload: Partial<AppSettings>) =>
    request<AppSettings>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  clearAllData: () =>
    request<{ cleared: boolean }>('/api/privacy/clear-all', {
      method: 'DELETE',
    }),
};
