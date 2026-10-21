# Editor: copy TikTok's, then cut it down

Rule: first rebuild TikTok's editor almost 1:1, so it feels familiar in the hand. Only then remove what creators like Ivan never touch. What already works underneath (clip list, caption engine, renderer, Check, AI Cut on Opus) stays; only the screens change.

## 1. After the tick: the "post" screen (TikTok's first screen after recording)

- The video full screen, looping, with sound.
- AI Cut runs by itself as soon as it opens (Opus, ~15 s for a 2 min take), with a thin progress bar on top. The cut plays when it's ready. "Undo cut" in one tap.
- A rail of tools on the right, like TikTok: **Edit** (opens the timeline, step 2), **Text**, **Captions**, **Sound**, **Overlay**, **Check**.
- "Add sound" pill at the top in the middle.
- Bottom: **Next** (Check + Export) and **Save** (to Photos).

Reuses: `FullPreview` (playback and loop), `Planner`, `Review`.

## 2. Edit: the timeline (TikTok's / CapCut's advanced editor)

- Preview on top (about 55% of the screen), play button and `0:12 / 1:04` under it, **undo / redo** arrows on the right.
- Timeline: the playhead stays in the middle and the tracks scroll under it. Pinch to zoom in and out.
  - The video track: clips as frame strips (what `ClipsPanel` does now).
  - Below it, thin coloured bars: text, captions, overlays, music. Drag a bar to move it in time, drag its ends to change how long it shows.
- Bottom toolbar, depending on what's picked:
  - Nothing picked: Split, Sound, Text, Captions, Overlay, Speed.
  - A clip picked: Split, Delete, Duplicate, Speed, Volume, Noise reducer, Replace. Hold and drag a clip to reorder it.
  - A text or overlay picked: Edit, Duration, Delete, Duplicate.
- Tap the preview to play or pause. Drag and pinch text and captions right on the preview (already built).

New: an undo stack (a snapshot of `EditDoc` per change), a multi-track timeline view, and a context toolbar.

## 3. Text: TikTok's text screen

- Full-screen dark overlay with the keyboard up.
- A row of fonts above the keyboard, a row of colours, a style button (plain / outline / box / semi box) and alignment.
- Done puts the text on the video; tapping it there gives Edit / Duration / Delete.

Reuses: `TextOverlay`, `PaintedText`.

## 4. Captions: TikTok's auto captions

- One button generates them (they come from the transcript we already have, so they're instant).
- A list of caption lines you can edit, like TikTok's caption editor (fixes the spelling everywhere).
- A style row along the bottom (our Pop / Box / Tall / One word / Reveal / Clean).

Reuses: `Captions.swift`, the Words panel's spelling fixes.

## 5. Sound

- Two sliders like TikTok: original sound and added sound.
- Noise reducer as a switch.
- Music from Files for now. TikTok's sound library comes later, if ever.

Reuses: `AudioSettings`, `Cleaner`.

## Then cut down

Candidates to drop after using it for a week: Speed per clip, Replace, Overlay video, Duplicate, Duration bars for overlays. Never building: stickers, filters, effects, voice effects, templates, text-to-speech.

## Order of work

1. Timeline + context toolbar + undo (the part that feels like editing). Biggest and most important.
2. The post screen with automatic AI Cut.
3. Text screen.
4. Captions editor.
5. Sound.
