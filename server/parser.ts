export interface ParsedMessage {
  sender: string;
  content: string;
  sentAt: string | null;
  isFromMe: boolean;
}

export interface ParseResult {
  messages: ParsedMessage[];
  inferredTitle: string;
  detectedFormat: 'whatsapp_export' | 'sender_prefixed' | 'plain_text';
  skippedSystemLines: number;
}

const SYSTEM_MESSAGE_PATTERNS = [
  /messages and calls are end-to-end encrypted/i,
  /created group "/i,
  /added you/i,
  /changed the subject/i,
  /changed this group's icon/i,
  /changed their phone number/i,
  /you were added/i,
  /security code changed/i,
  /missed voice call/i,
  /missed video call/i,
];

// Android / Desktop export formats:
// 14/11/2026, 2:35 pm - Ali Khan: Hello
// 11/14/26, 14:35 - Ali Khan: Hello
// 2026-11-14, 14:35 - Ali Khan: Hello
const ANDROID_LINE_RE =
  /^[\u200e\u200f]*(\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[apAP][mM])?)\s*[-–]\s*(.+)$/;

// iOS bracket export formats:
// [14/11/2026, 2:35:12 PM] Ali Khan: Hello
// [2026-11-14, 14:35:12] Ali Khan: Hello
const IOS_LINE_RE =
  /^[\u200e\u200f]*\[(\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[apAP][mM])?)\]\s*(.+)$/;

// Simple pasted "Sender: Message" line (avoid matching URLs like https://...)
const SENDER_COLON_RE = /^([A-Za-z0-9\u0600-\u06FF\s._+()-]{1,48}):\s+(.+)$/;

function isSystemMessage(body: string): boolean {
  return SYSTEM_MESSAGE_PATTERNS.some((re) => re.test(body));
}

function splitSenderAndContent(rest: string): { sender: string; content: string } | null {
  const colonIdx = rest.indexOf(': ');
  if (colonIdx <= 0) return null;
  const sender = rest.slice(0, colonIdx).trim();
  const content = rest.slice(colonIdx + 2);
  if (!sender || sender.length > 80) return null;
  return { sender, content };
}

function normalizeSenderIsMe(sender: string, userDisplayName: string): boolean {
  const s = sender.trim().toLowerCase();
  const me = userDisplayName.trim().toLowerCase();
  return s === 'you' || s === 'me' || (me.length > 0 && s === me);
}

export function parseWhatsAppInput(
  rawText: string,
  options?: {
    fallbackSender?: string;
    userDisplayName?: string;
  }
): ParseResult {
  if (typeof rawText !== 'string') {
    throw new Error('Message input must be text.');
  }

  const cleaned = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u200e\u200f\ufeff]/g, '')
    .trim();

  if (!cleaned) {
    throw new Error('Please paste at least one message or upload a non-empty .txt export.');
  }

  if (cleaned.length > 2_000_000) {
    throw new Error('Input exceeds the 2 MB limit. Please select a smaller portion of the chat.');
  }

  const userDisplayName = options?.userDisplayName || 'You';
  const fallbackSender = options?.fallbackSender?.trim() || 'Contact';
  const lines = cleaned.split('\n');

  const exportMessages: ParsedMessage[] = [];
  let skippedSystemLines = 0;
  let matchedExportLines = 0;

  for (const line of lines) {
    const androidMatch = line.match(ANDROID_LINE_RE);
    const iosMatch = !androidMatch ? line.match(IOS_LINE_RE) : null;
    const match = androidMatch || iosMatch;

    if (match) {
      matchedExportLines++;
      const timestamp = `${match[1]} ${match[2].replace(/\u202f/g, ' ').trim()}`;
      const rest = match[3];
      const split = splitSenderAndContent(rest);

      if (!split) {
        if (isSystemMessage(rest)) {
          skippedSystemLines++;
        }
        continue;
      }

      if (isSystemMessage(split.content)) {
        skippedSystemLines++;
        continue;
      }

      exportMessages.push({
        sender: split.sender,
        content: split.content.trim(),
        sentAt: timestamp,
        isFromMe: normalizeSenderIsMe(split.sender, userDisplayName),
      });
    } else if (exportMessages.length > 0) {
      // Multi-line continuation of the previous WhatsApp message
      const prev = exportMessages[exportMessages.length - 1];
      prev.content = `${prev.content}\n${line}`.trim();
    }
  }

  if (matchedExportLines > 0 && exportMessages.length > 0) {
    const nonMeSenders = Array.from(
      new Set(
        exportMessages
          .filter((m) => !m.isFromMe)
          .map((m) => m.sender)
      )
    );
    const inferredTitle =
      nonMeSenders.length === 1
        ? nonMeSenders[0]
        : nonMeSenders.length > 1
        ? `${nonMeSenders[0]} & ${nonMeSenders.length - 1} others`
        : fallbackSender;

    return {
      messages: exportMessages.slice(0, 2000),
      inferredTitle,
      detectedFormat: 'whatsapp_export',
      skippedSystemLines,
    };
  }

  // Try Sender: Message lines (for quick manual copy-paste like "Ali: Salam\nYou: Walaikum Salam")
  const senderPrefixed: ParsedMessage[] = [];
  let matchedSenderLines = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(SENDER_COLON_RE);
    if (m && !/^https?$/i.test(m[1])) {
      matchedSenderLines++;
      const sender = m[1].trim();
      senderPrefixed.push({
        sender,
        content: m[2].trim(),
        sentAt: null,
        isFromMe: normalizeSenderIsMe(sender, userDisplayName),
      });
    } else if (senderPrefixed.length > 0) {
      const prev = senderPrefixed[senderPrefixed.length - 1];
      prev.content = `${prev.content}\n${trimmed}`;
    }
  }

  if (matchedSenderLines >= 1 && senderPrefixed.length > 0) {
    const nonMe = Array.from(
      new Set(senderPrefixed.filter((m) => !m.isFromMe).map((m) => m.sender))
    );
    return {
      messages: senderPrefixed.slice(0, 2000),
      inferredTitle: nonMe[0] || fallbackSender,
      detectedFormat: 'sender_prefixed',
      skippedSystemLines: 0,
    };
  }

  // Fallback: raw single or multi-paragraph pasted message from a contact
  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const plainMessages: ParsedMessage[] = (
    paragraphs.length > 1 ? paragraphs : [cleaned]
  ).map((content) => ({
    sender: fallbackSender,
    content,
    sentAt: null,
    isFromMe: false,
  }));

  return {
    messages: plainMessages,
    inferredTitle: fallbackSender,
    detectedFormat: 'plain_text',
    skippedSystemLines: 0,
  };
}
