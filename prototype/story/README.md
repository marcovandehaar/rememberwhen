# Story prototype — scroll-driven cinematic story

Throwaway. Answers [issue #6](https://github.com/marcovandehaar/rememberwhen/issues/6):
**does a scroll-driven cinematic story feel like reliving, or like scrubbing?**

## What it is

One real `Chapter`: **20 February 2024, 08:48–17:04, Wintersport Zillertal** —
42 photos and 7 videos, chosen on real capture times rather than filename order.
The day is split in two at its largest internal gap, so a `Chapter` transition
is visible.

**Scroll is the timeline.** Each shot's `animation-range` is its own slice of
the document scroll, driven by `animation-timeline: scroll(root block)`. There
is **no JavaScript in the animation loop** — the finger drives the clock and CSS
does the rest.

Tap any shot to open it full-screen; video gets sound there, and only there.

## Run

```
npm install
npm run dev
```

Open the **Network** URL on the iPad, same wifi. Port 5174, pinned.

## The media is not in this repo

`public/media/` and `chapter.json` are gitignored: this repo is public and those
are family photos plus their exact capture times. Regenerate them from the
originals with the PowerShell in the issue's history, or point the manifest at
your own folder.

## The one piece of JavaScript that is not optional

`useScrollWindow.ts` mounts only a window of shots around the scroll position.
Every shot is a full-bleed fixed layer, and 42 decoded 1920px photos is roughly
half a gigabyte of bitmap — iPadOS kills the tab long before that. The story
research said preload and eviction stays required work whatever the renderer;
this is the cheapest honest version.

## What to look at

1. **Does scrolling feel like reliving, or like scrubbing?** The whole ticket.
   If it reads as scrubbing, the decision behind it ([#12](https://github.com/marcovandehaar/rememberwhen/issues/12))
   is wrong and needs revisiting, not patching.
2. **Is formulaic Ken Burns enough** — alternating direction, slight zoom in, no
   image analysis — or is the missing saliency obvious?
3. **The video at 09:36 and the six after it.** Do they sit in the rhythm, or
   break it?
4. **The Chapter transition** in the middle of the day.

## The HUD

Top-left. Live fps, how many `<video>` elements are actually decoding, and
whether this Safari has `scroll-timeline`, `animation-range` and view
transitions. On the laptop `hevc/mov` reads `no` — Chromium cannot decode the
iPhone clips. Safari should say otherwise; that is one of the things to check.
