import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  ImportantPoint,
  Message,
  ReplyTone,
  SupportedLanguage,
} from '../shared/types.ts';

export const GEMINI_MODEL = 'gemini-4-hydrogen';

let lastGeminiError: string | null = null;

export function getLastGeminiError(): string | null {
  return lastGeminiError;
}

export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== 'MY_GEMINI_API_KEY');
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new GeminiServiceError(
      'GEMINI_API_KEY is not configured on the server. Add your Gemini API key to the server environment secrets or local .env file.',
      503,
      'MISSING_KEY'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export class GeminiServiceError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = 'GEMINI_ERROR') {
    super(message);
    this.name = 'GeminiServiceError';
    this.status = status;
    this.code = code;
  }
}

function classifyGeminiError(err: unknown): GeminiServiceError {
  if (err instanceof GeminiServiceError) return err;
  const rawMessage = err instanceof Error ? err.message : String(err);
  const lower = rawMessage.toLowerCase();

  if (
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit')
  ) {
    return new GeminiServiceError(
      'Gemini free-tier rate or quota limit reached. Please wait a few seconds and try again.',
      429,
      'RESOURCE_EXHAUSTED'
    );
  }

  if (
    lower.includes('403') ||
    lower.includes('permission_denied') ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('401')
  ) {
    return new GeminiServiceError(
      'Gemini API key was rejected or lacks permission. Please verify your GEMINI_API_KEY in server configuration.',
      403,
      'API_KEY_INVALID'
    );
  }

  if (lower.includes('404') || lower.includes('not_found')) {
    return new GeminiServiceError(
      `Gemini model "${GEMINI_MODEL}" could not be reached. Please check API availability.`,
      404,
      'NOT_FOUND'
    );
  }

  return new GeminiServiceError(
    `Gemini request failed: ${rawMessage}`,
    502,
    'GEMINI_UPSTREAM_ERROR'
  );
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      const result = await fn();
      lastGeminiError = null;
      return result;
    } catch (err) {
      const classified = classifyGeminiError(err);
      lastGeminiError = classified.message;
      const shouldRetry =
        (classified.code === 'RESOURCE_EXHAUSTED' || classified.status >= 500) &&
        attempt < maxRetries;
      if (!shouldRetry) {
        throw classified;
      }
      attempt++;
      const delayMs = 600 * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export interface ConversationAnalysisResult {
  detectedLanguage: string;
  summary: string;
  importantPoints: ImportantPoint[];
  questions: {
    messageId: string;
    question: string;
    sender: string;
    timestamp: string;
  }[];
  messageFlags: {
    messageId: string;
    isImportant: boolean;
    importanceReason: string;
    needsReply: boolean;
    detectedLanguage: string;
  }[];
}

export async function analyzeConversationWithGemini(params: {
  title: string;
  category: string;
  messages: Message[];
}): Promise<ConversationAnalysisResult> {
  if (params.messages.length === 0) {
    throw new GeminiServiceError(
      'Cannot analyze an empty conversation. Please add or import messages first.',
      400,
      'EMPTY_CONVERSATION'
    );
  }

  const ai = getClient();
  const contextMessages = params.messages.slice(-120);
  const serialized = contextMessages
    .map(
      (m) =>
        `[id:${m.id}] [time:${m.sentAt || 'unknown'}] [sender:${m.sender}${
          m.isFromMe ? ' (Me)' : ''
        }]: ${m.content}`
    )
    .join('\n');

  const systemInstruction = `You are a careful personal WhatsApp message analyst.
Strict rules:
1. Analyze ONLY the messages explicitly provided in the transcript. NEVER invent facts, dates, names, commitments, or messages that are not in the transcript.
2. Detect the primary language(s) accurately: "English", "Urdu", "Roman Urdu", or "Mixed".
3. Write a concise, accurate summary of what is happening in the conversation.
4. Extract key decisions, deadlines, action items, or critical facts as importantPoints.
5. Identify unanswered questions or messages from others that clearly require a reply.
6. Use ONLY the exact message ids provided in [id:...] when populating messageFlags and questions.`;

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: `Conversation: "${params.title}" (${params.category})\n\nTranscript:\n${serialized}`,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedLanguage: {
              type: Type.STRING,
              description: 'Primary language: English, Urdu, Roman Urdu, or Mixed.',
            },
            summary: {
              type: Type.STRING,
              description: 'Factual summary strictly grounded in the provided messages.',
            },
            importantPoints: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  category: {
                    type: Type.STRING,
                    description: 'One of: decision, deadline, action_item, key_info',
                  },
                  sender: { type: Type.STRING },
                  timestamp: { type: Type.STRING },
                },
                required: ['text', 'category', 'sender', 'timestamp'],
              },
            },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  messageId: { type: Type.STRING },
                  question: { type: Type.STRING },
                  sender: { type: Type.STRING },
                  timestamp: { type: Type.STRING },
                },
                required: ['messageId', 'question', 'sender', 'timestamp'],
              },
            },
            messageFlags: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  messageId: { type: Type.STRING },
                  isImportant: { type: Type.BOOLEAN },
                  importanceReason: { type: Type.STRING },
                  needsReply: { type: Type.BOOLEAN },
                  detectedLanguage: { type: Type.STRING },
                },
                required: [
                  'messageId',
                  'isImportant',
                  'importanceReason',
                  'needsReply',
                  'detectedLanguage',
                ],
              },
            },
          },
          required: [
            'detectedLanguage',
            'summary',
            'importantPoints',
            'questions',
            'messageFlags',
          ],
        },
      },
    })
  );

  const rawJson = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawJson) as ConversationAnalysisResult;

  const validCategories = new Set([
    'decision',
    'deadline',
    'action_item',
    'key_info',
  ]);

  return {
    detectedLanguage: parsed.detectedLanguage || 'English',
    summary: parsed.summary || 'No summary generated.',
    importantPoints: (parsed.importantPoints || []).map((p) => ({
      text: p.text,
      category: validCategories.has(p.category)
        ? (p.category as ImportantPoint['category'])
        : 'key_info',
      sender: p.sender || 'Unknown',
      timestamp: p.timestamp || '',
    })),
    questions: parsed.questions || [],
    messageFlags: parsed.messageFlags || [],
  };
}

function getLanguageInstruction(language: SupportedLanguage): string {
  if (language === 'Urdu') {
    return 'Write the reply strictly in natural Urdu using proper Urdu script (اردو).';
  }
  if (language === 'Roman Urdu') {
    return 'Write the reply in natural, polite Pakistani Roman Urdu using Latin script (e.g., "Ji bilkul, main check karke batata hoon").';
  }
  return 'Write the reply in clear, natural English.';
}

function getToneInstruction(tone: ReplyTone, customInstruction?: string): string {
  switch (tone) {
    case 'Short and direct':
      return 'Keep the reply concise, clear, and to the point (1-2 sentences).';
    case 'Friendly':
      return 'Use a warm, natural, conversational WhatsApp tone.';
    case 'Professional':
      return 'Use a polite, respectful, and professional tone.';
    case 'Detailed':
      return 'Provide a thorough, helpful, well-structured response covering all points.';
    case 'Custom':
      return customInstruction?.trim()
        ? `Follow this specific user instruction: ${customInstruction.trim()}`
        : 'Use a helpful, balanced tone.';
  }
}

export async function generateReplyWithGemini(params: {
  conversationTitle: string;
  contextMessages: Message[];
  targetMessageText: string;
  targetSender?: string;
  language: SupportedLanguage;
  tone: ReplyTone;
  customInstruction?: string;
}): Promise<{ replyText: string; detectedInputLanguage: string }> {
  if (!params.targetMessageText.trim()) {
    throw new GeminiServiceError(
      'Please select or paste a message to reply to.',
      400,
      'EMPTY_TARGET'
    );
  }

  const ai = getClient();
  const recent = params.contextMessages.slice(-40);
  const contextBlock =
    recent.length > 0
      ? recent
          .map(
            (m) =>
              `${m.sender}${m.isFromMe ? ' (Me)' : ''}${
                m.sentAt ? ` [${m.sentAt}]` : ''
              }: ${m.content}`
          )
          .join('\n')
      : 'No prior history provided.';

  const systemInstruction = `You are drafting a personal WhatsApp reply for the user to review before manually sending.
Strict rules:
1. Ground your reply ONLY in the provided conversation context and target message. Do NOT invent facts, promises, prices, times, or details that were not provided; if specific details are missing (like an exact time or file), phrase the reply honestly or leave a clear bracketed placeholder like [time] only when essential.
2. ${getLanguageInstruction(params.language)}
3. ${getToneInstruction(params.tone, params.customInstruction)}
${
  params.tone !== 'Custom' && params.customInstruction?.trim()
    ? `4. Additional user guidance: ${params.customInstruction.trim()}`
    : ''
}
5. Return ONLY JSON matching the schema. Do not wrap the reply in quotation marks.`;

  const prompt = `Chat: ${params.conversationTitle || 'Direct Message'}
Recent context:
${contextBlock}

Target message to reply to (from ${params.targetSender || 'Contact'}):
${params.targetMessageText}`;

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            replyText: {
              type: Type.STRING,
              description: 'Ready-to-paste WhatsApp reply text.',
            },
            detectedInputLanguage: {
              type: Type.STRING,
              description: 'Detected language of the incoming target message.',
            },
          },
          required: ['replyText', 'detectedInputLanguage'],
        },
      },
    })
  );

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    replyText?: string;
    detectedInputLanguage?: string;
  };

  return {
    replyText: (parsed.replyText || '').trim(),
    detectedInputLanguage: parsed.detectedInputLanguage || 'English',
  };
}

export async function generateScheduledDraftWithGemini(params: {
  recipientLabel: string;
  recipientType: string;
  topicOrInstruction: string;
  language: SupportedLanguage;
  tone: ReplyTone;
  customInstruction?: string;
  scheduledDate: string;
  scheduledTime: string;
  contextMessages?: Message[];
}): Promise<{ draftText: string }> {
  if (!params.topicOrInstruction.trim()) {
    throw new GeminiServiceError(
      'Please describe what the scheduled message should say.',
      400,
      'EMPTY_TOPIC'
    );
  }

  const ai = getClient();
  const contextSnippet =
    params.contextMessages && params.contextMessages.length > 0
      ? `\nOptional recent chat context:\n${params.contextMessages
          .slice(-15)
          .map((m) => `${m.sender}: ${m.content}`)
          .join('\n')}`
      : '';

  const systemInstruction = `You are drafting a scheduled WhatsApp message for a personal user to review, approve, and later send manually.
Strict rules:
1. ${getLanguageInstruction(params.language)}
2. ${getToneInstruction(params.tone, params.customInstruction)}
${
  params.tone !== 'Custom' && params.customInstruction?.trim()
    ? `3. Additional guidance: ${params.customInstruction.trim()}`
    : ''
}
4. Never fabricate facts not given by the user.
5. Keep it natural for WhatsApp.`;

  const prompt = `Recipient: ${params.recipientLabel} (${params.recipientType})
Scheduled for: ${params.scheduledDate} at ${params.scheduledTime} (PKT)
Purpose / Topic: ${params.topicOrInstruction}${contextSnippet}`;

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            draftText: {
              type: Type.STRING,
              description: 'Draft WhatsApp message ready for user editing and approval.',
            },
          },
          required: ['draftText'],
        },
      },
    })
  );

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    draftText?: string;
  };
  return { draftText: (parsed.draftText || '').trim() };
}

export async function testGeminiConnection(): Promise<{
  ok: boolean;
  model: string;
  message: string;
}> {
  const ai = getClient();
  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: 'Reply with the single word: READY',
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      }),
    0
  );
  return {
    ok: true,
    model: GEMINI_MODEL,
    message: `Connected to ${GEMINI_MODEL} (${(response.text || 'OK').trim().slice(0, 24)})`,
  };
}
