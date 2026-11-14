# WhatsApp AI Assistant

A lightweight, privacy-first Windows desktop-style assistant built with React, TypeScript, Node.js, SQLite, and Google Gemini (`gemini-4-hydrogen`). Designed for one personal WhatsApp user to understand selected WhatsApp messages, generate context-aware replies in **English**, **Roman Urdu**, or **Urdu**, and schedule manual WhatsApp reminders in **Pakistan Standard Time (`Asia/Karachi`)**.

---

## Safety & WhatsApp Integration Policy

This application respects WhatsApp's rules for personal accounts:

- **No unofficial automation**: Does not scrape WhatsApp Web DOM, automate browsers, extract session cookies/tokens, or read WhatsApp's private local database.
- **No bulk or auto-sending**: Never automatically sends messages. You always copy the generated or scheduled message, open **WhatsApp Web**, select the chat, review it, and click Send yourself.
- **Confirmed-only send tracking**: Replies and scheduled reminders are only marked as sent after you explicitly click **I Sent This Reply** or **Confirm Manually Sent**.
- **Authorized message input methods**:
  1. Paste selected messages directly.
  2. Import a WhatsApp `.txt` chat export file (`More → Export chat → Without Media`).
  3. Build or append messages manually in a conversation.

---

## Features Implemented

- **Dashboard Overview**: Live counters for imported conversations, analyzed messages, generated replies, upcoming/due schedules, Gemini server status, and recent SQLite activity.
- **Import Messages**: Supports Android & iOS WhatsApp `.txt` exports, `Sender: Message` paste format, raw pasted messages, and manual row-by-row entry with live parse preview.
- **Conversations & Summaries**: Organize chats by Contact or Group, view `dir="auto"` RTL/LTR transcripts, and run Gemini analysis for summaries, key decisions/deadlines, and detected language.
- **Important Messages & Questions**: Aggregates important facts and unanswered questions detected across analyzed conversations.
- **AI Reply Assistant**: Generates context-aware replies in **English**, **Roman Urdu**, or **Urdu** with selectable styles (*Short and direct*, *Friendly*, *Professional*, *Detailed*, *Custom*). Includes editable draft box, **Copy Reply**, **Open WhatsApp Web**, and **I Sent This Reply**.
- **Message Scheduler (`Asia/Karachi` PKT)**:
  - One-time, Daily, Weekly, and Custom weekday schedules.
  - Gemini AI draft generator for scheduled messages.
  - Real-time browser/Windows desktop notifications + chime when due.
  - Startup recovery that detects **missed schedules** after Windows restarts or app closure without creating duplicate notifications.
- **Reply History & Privacy Controls**: Full local SQLite storage in `./data/whatsapp-assistant.db` with single-item deletion and full local data wipe.
- **Installable PWA**: Install directly from Chrome or Microsoft Edge as a standalone Windows desktop app.

---

## Windows 10 Installation & Launch (After ZIP Export)

### Prerequisites

1. **Node.js 22 LTS** (recommended for Windows 10): Download from [nodejs.org](https://nodejs.org/).
2. **Google Gemini API Key**: Create a free API key in [Google AI Studio](https://aistudio.google.com/).

### Step 1: Extract & Configure `.env`

1. Export and extract the project ZIP into a folder such as `C:\Apps\whatsapp-ai-assistant`.
2. In the project root folder, copy `.env.example` to `.env` (or double-click `start.bat` once to create `.env` automatically).
3. Open `.env` in Notepad and replace `MY_GEMINI_API_KEY` with your real key:

```env
GEMINI_API_KEY="your-actual-gemini-api-key-here"
PORT="3000"
HOST="127.0.0.1"
```

> **Security Note**: Never share your `.env` file or commit it to source control. Keeping `HOST="127.0.0.1"` ensures the local server is only reachable on your own Windows PC.

### Step 2: Launch on Windows 10

Double-click **`start.bat`** in the project folder.

`start.bat` automatically:
1. Verifies Node.js is installed.
2. Installs npm dependencies on first run (`npm install`).
3. Builds the production frontend (`npm run build`).
4. Starts the local Node.js + SQLite server bound to `127.0.0.1:3000`.
5. Opens `http://127.0.0.1:3000` in your default browser.

### Optional: Install as a Windows Desktop App (PWA)

When open in Microsoft Edge or Google Chrome:
- Click **Install Desktop App** in the top bar (or the browser address bar install icon) to pin **WhatsApp AI Assistant** to your Windows Start Menu and Desktop.

### Optional: Electron Packaging (Not Required)

To keep RAM, disk size, and build dependencies minimal, the app runs via Node.js + browser/Edge PWA (~50–80 MB footprint vs ~300+ MB for bundled Chromium in Electron). If you ever need a standalone `.exe`, you can wrap `http://127.0.0.1:3000` with Electron as an optional future step.

---

## Known Limitations (Personal WhatsApp Account)

- WhatsApp does not offer an official API to read personal chat threads or automatically dispatch messages on a personal account.
- Scheduled messages trigger desktop alerts and open WhatsApp Web for you to paste and send manually.
- Gemini AI features require an active internet connection and valid `GEMINI_API_KEY` within your Gemini API quota.
