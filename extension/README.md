# Chumoku Chrome extension

Two buttons on every YouTube Short, in the column above Like:

- **Analyze** opens `chumoku.co/?analyze=<short>`: the normal analysis in the chat.
- **Steal** opens `chumoku.co/?steal=<short>`: the `steal-video` edge function reads
  the idea, watches the video, writes an outline for the user's channel and files it
  under Ideas → Saved. 5 credits (1 read + 4 outline), nothing if already stolen.

Also: right-click any Short link (Chumoku → Analyze / Steal), `Alt+Shift+A` /
`Alt+Shift+S` on the Short you're watching, and a popup for pasting a link.

The extension holds no auth and calls no API. It only opens the app with an intent in
the URL; the web app (`src/lib/intents.ts`) turns it into a one-shot localStorage key,
so a signed-out user carries it through signup and onboarding.

## Try it locally

1. `chrome://extensions` → turn on Developer mode
2. **Load unpacked** → pick this `extension/` folder
3. Open any youtube.com/shorts/... page

To point it at a local dev server, change `APP_URL` in `shared.js` and `content.js`.

## Ship to the Chrome Web Store

```bash
npm run ext:zip
```

Upload `dist-extension/chumoku-extension-<version>.zip` at
https://chrome.google.com/webstore/devconsole ($5 one-time developer fee). Bump
`version` in `manifest.json` on every upload.

### Listing copy

**Name:** Chumoku: Analyze and Steal Shorts

**Summary (132 chars max):** Two buttons on every YouTube Short. Analyze why it worked, or steal its format as an outline for your channel.

**Description:**

Scrolling Shorts is research. Chumoku turns it into work you can use.

Every Short on YouTube gets two buttons, right above Like:

ANALYZE: a score out of 100, what makes the hook land, and what loses viewers. The same analysis Chumoku runs on your own videos.

STEAL: Chumoku watches the Short, works out the structural move that made it work, and rewrites it for your niche as a shot-by-shot outline. The format, not the video. It lands in your Ideas, ready to film.

Also:
• Right-click any Short in a feed or search result
• Alt+Shift+A / Alt+Shift+S on the Short you're watching
• Paste any Shorts link into the popup

Built for Shorts creators posting daily in ranking, Minecraft, Roblox and commentary niches. Free account includes 20 credits.

**Category:** Productivity. **Language:** English.

**Permissions justification** (the store asks for each):
- `contextMenus`: the right-click Analyze / Steal entries on Short links.
- `activeTab`: the popup reads the current tab's URL to know which Short you're on.
- Host access to youtube.com: to place the two buttons on Shorts pages.

**Single purpose:** Send a YouTube Short to Chumoku for analysis or format adaptation.

**Data use:** the extension collects nothing and sends nothing on its own. Pressing a
button opens chumoku.co with the Short's public URL.

**Screenshots needed (1280×800):** the buttons on a Short, the popup, a finished
Steal outline in the app, an analysis in the chat.
