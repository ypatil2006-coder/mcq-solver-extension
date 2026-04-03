# 🎯 MCQ Solver AI — Chrome Extension

> Automatically reads MCQ questions on any page and clicks the correct answer using AI.  
> Created by **Yash Patil** • Vibe Coded with Anthropic 🤖

---

## 📦 Versions

| Version | Release Name | Key Feature Added |
|---------|-------------|-------------------|
| [v1.0](#v10) | Claude Only | First build — Claude AI, single key, solve once |
| [v1.1](#v11) | Multi-Provider Tabs | 4 providers with tab switcher UI |
| [v1.2](#v12) | CORS Fix | Added `anthropic-dangerous-direct-browser-access` header |
| [v1.3](#v13) | Snipping Style | Simplified dropdown UI |
| [v1.4](#v14) | Auto Loop | Continuous loop across pages until test ends |
| [v1.5](#v15) | Stealth Mode | Minimal UI, □/○ bullets, settings panel, stealth green dot |

---

## 🚀 Installation (All Versions)

1. Download the `.zip` for the version you want
2. Unzip it
3. Go to `chrome://extensions/`
4. Enable **Developer Mode** (top-right toggle)
5. Click **Load unpacked** → select the unzipped folder
6. Pin the extension from the puzzle icon 🧩

---

## 🔑 Supported AI Providers

| Provider | Free Tier | Speed | Notes |
|----------|-----------|-------|-------|
| ⚡ Groq | ✅ Yes | Fastest | Best starting point |
| 🟢 OpenAI | ❌ No | Fast | GPT-4o-mini recommended |
| 🟣 Claude | ❌ No | Fast | Haiku is cheapest |
| 🔵 Gemini | ✅ Limited | Fast | Flash model |

---

## 📋 Version Details

### v1.0
**Claude Only** — First working build.
- Single Anthropic API key field
- Solve current page once
- Shows results list with click status

### v1.1
**Multi-Provider Tabs** — Added all 4 AI providers.
- Tab switcher UI (Claude / OpenAI / Gemini / Groq)
- Per-provider model selector dropdown
- Separate API key per provider

### v1.2
**CORS Fix** — Fixed Anthropic API error in browser context.
- Added `anthropic-dangerous-direct-browser-access: true` header
- All providers working correctly

### v1.3
- Simplified UI design.
- Single dropdown for provider (no tabs)
- One API key field that swaps placeholder per provider
- 👁 eye toggle to show/hide key
- 💾 Save Settings button

### v1.4
**Auto Loop** — Continuous solving across pages.
- `▶ Start Auto Loop` button
- `⚡ Solve Once` for single page
- Survives full page navigation (stores state in `chrome.storage`)
- SPA support — detects DOM-only updates
- Smart Next / Submit button detection
- Auto-stops on results/score page
- Live stats: questions answered, pages completed

### v1.5
**Stealth Mode + Bullets** — Most complete version.
- Minimal clean UI — opens directly to Start button
- ⚙ Settings panel (top-left gear icon) with:
  - Provider + model selection
  - API key per provider
  - Display toggles
- **□ Square** = multiple correct answers (checkboxes)
- **○ Circle** = single correct answer (radio)
- **Stealth mode** — hides all UI, shows only 🟢 green dot at top-left
- Friendly error messages (invalid key, rate limit, out of tokens, etc.)
- In-page toast message dialog

---

## 🔁 How the Auto Loop Works (v1.4+)

```
Page loads
    ↓
Scan all MCQ questions
    ↓
Send to AI (Groq / Claude / OpenAI / Gemini)
    ↓
Click correct answers
    ↓
Click "Next" / "Submit" button
    ↓
Page navigates → content script auto-resumes
    ↓
Repeat until results page detected → Stop ✓
```

**Next button patterns detected:**
Next, Continue, Proceed, Submit, Finish, Save & Next, →, ›, »

**Test completion patterns detected:**
"Your score", "Quiz complete", "Congratulations", "Final score", "Submitted successfully"

---

## 🛡 Stealth Mode (v1.5)

When enabled:
- All highlights removed from page
- In-page toast dialogs hidden
- Only a **pulsing green dot** shows at top-left corner of the tab
- Extension popup still works normally
- Loop continues silently in background

---

## 📁 File Structure

```
mcq-extension/
├── manifest.json      # Extension config
├── background.js      # AI API calls (all providers)
├── content.js         # Page interaction, clicking, loop logic
├── popup.html         # Extension popup UI
├── popup.js           # Popup logic
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---
## Latest Build Drive Link 
-- https://drive.google.com/file/d/1Y6t7gq-biNGpSr3UwTum0e-UjpKl1akU/view?usp=sharing


---

## ⚠️ Disclaimer

This extension is for educational purposes. Use responsibly and in accordance with your platform's terms of service.

---

*Made  by Yash Patil*
