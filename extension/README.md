# Chumoku Chrome extension

Two buttons on every YouTube Short, in the column above Like:

- **Analyze** opens `chumoku.co/?analyze=<short>`: the normal analysis in the chat.
- **Steal** opens `chumoku.co/?steal=<short>`: the `steal-video` edge function reads
  the idea, watches the video, writes an outline for the user's channel and files it
  under Ideas → Saved. 5 credits (1 read + 4 outline), nothing if already stolen.

Also: right-click any Short link (Chumoku → Analyze / Steal), `Alt+Shift+A` /
`Alt+Shift+S` on the Short you're watching, and a popup for pasting a link.

Results open in Chrome's **side panel**, beside the video. The panel keeps one analysis
and one steal alive at a time, with chips to switch between them, so stealing a Short you
just analysed does not throw the conversation away. `panel.html` is an iframe of
`chumoku.co/panel` (`src/components/PanelPage.tsx`): the real app, same session, same
chat and idea view, so everything is saved to the account as usual. Chrome gives an
extension's frames first-party storage on hosts in `host_permissions`, which is why the
login carries over. Each press is written to `chrome.storage.session` and posted into
the frame; `/panel` only accepts runs from a `chrome-extension://` parent.

If the panel will not open (Chrome older than 116, or the call not counted as a user
gesture), it falls back to a tab with `?analyze=` / `?steal=`, handled by
`src/lib/intents.ts`, which also carries a signed-out user through signup.

The extension itself holds no auth and calls no API.

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

**Name:** Chumoku

**Summary (132 chars max):** The Shorts workflow, automated. Analyze any Short or steal its format as an outline for your channel, beside the video.

**Description:** (kept short: the store shows the first lines, people skim the rest)

Two buttons on every YouTube Short, right above Like.

ANALYZE: a score out of 100 and the exact seconds to fix.
STEAL: the Short's format, rebuilt as an outline for your channel and saved to your Ideas.

Results open in a side panel beside the video, so you keep scrolling. Right-click any Short or use Alt+Shift+A / S.

Chumoku is workflow automation for Shorts creators. Free account includes 20 credits.

**Homepage URL:** https://chumoku.co/?utm_source=chrome_web_store

**Support URL:** https://discord.gg/N8S6C95Ry2

**Store icon:** `extension/store/out/store-icon-128.png` (96px artwork on a 128px transparent canvas, as the store asks).

**Category:** Workflow & Planning (the store split Productivity into subcategories; Tools is the fallback). **Language:** English.

**Privacy policy URL:** https://chumoku.co/privacy (has a Chrome extension section).

**Trader status (EU):** non-trader for now (2026-09-23): trader verification needs a registered organization in Dun & Bradstreet and there is none yet. Switch to trader in the developer dashboard once the business is registered.

**Permissions justification** (the store asks for each):
- `contextMenus`: the right-click Analyze / Steal entries on Short links.
- `activeTab`: the popup reads the current tab's URL to know which Short you're on.
- `sidePanel`: results open in a panel beside the video.
- `storage`: hands the pressed Short from the button to the panel (session only, cleared when Chrome closes).
- Host access to chumoku.co: the panel shows the Chumoku site, signed in with your existing session.
- Host access to youtube.com: to place the two buttons on Shorts pages.

**Remote code:** answer "No, I am not using remote code". Everything runs from the package; the side panel's chumoku.co iframe is embedded web content, not remote code.

**Data usage:** tick no data types (the extension collects nothing itself; it opens Chumoku with the Short's public link on a click), tick all three certifications.

**Single purpose:** Send a YouTube Short to Chumoku for analysis or format adaptation.

**Data use:** the extension collects nothing and sends nothing on its own. Pressing a
button opens chumoku.co with the Short's public URL.

**Screenshots:** ready in `extension/store/out/` (five at 1280×800 plus the 440×280 promo tile). Rebuild them with `npm run ext:shots` after changing `extension/store/*.html`.

Old note - screenshots needed (1280×800): the buttons on a Short, the popup, a finished
Steal outline in the app, an analysis in the chat.
