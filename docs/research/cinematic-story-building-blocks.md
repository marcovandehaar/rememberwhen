# Building blocks for a cinematic photo-and-video story on the web

Research note for issue #2. Written 2026-08-26. "Latest at the time of writing" means: remotion /
`@remotion/player` / `@remotion/transitions` / `@remotion/media` / `@remotion/renderer` /
`@remotion/lambda` 4.0.518, motion (and framer-motion, motion-dom) 13.1.1, `@react-spring/web` 10.1.2,
react-spring 10.0.4, gsap 3.15.0, `@gsap/react` 2.1.2, animejs 4.5.0, `@motion-canvas/core` and
`@motion-canvas/2d` 3.17.2, `@theatre/core` and `@theatre/studio` 0.7.2, `@rive-app/react-canvas`
4.32.1, `@rive-app/canvas` 2.40.1, rive-react 4.24.0, lottie-web 5.13.0,
`@lottiefiles/dotlottie-web` 0.79.2, `@lottiefiles/dotlottie-react` 0.19.15, mediabunny 1.55.3,
mp4box 2.4.1, `@ffmpeg/ffmpeg` 0.12.15, react-insta-stories 2.8.0 — all read from the npm registry on
2026-08-26. Measurements were made against react 19.2.8 / react-dom 19.2.8 with esbuild 0.28.2. The
newest Safari release notes on webkit.org are for **Safari 26.6**.

Every claim below links to the source that owns it. Anything I could not establish from a primary
source is marked **[UNESTABLISHED]**; my own reasoning is marked **inference** and my own judgement
**opinion**.

Two things this note deliberately does not do, matching
[`3d-globe-libraries.md`](3d-globe-libraries.md). It does not tell you whether anything *looks* good —
that judgement is Marco's, so where a visual verdict is needed I give a live URL instead. And it
gives no frame rates: **real-device iPad frame rate and decode behaviour cannot be established by
reading.**

Facts about iPadOS/WebKit already settled in the globe note (WebGL memory accounting, the 16-context
cap, texture budgets, Lockdown Mode disabling `WebGLEnabled`, `touch-action` behaviour, and the
measured-bundle methodology) are reused here rather than re-derived, and cited to that note.

## The question

After the globe opening screen, selecting a `Destination` plays back a cinematic photo-and-video
story — the heart of the app. The origin document
([`docs/inception-prompt.md`](../inception-prompt.md)) assumed we author the motion ourselves: "geen
zware standaard component-library … we hebben juist controle nodig over spacing, easing, gestures,
compositing, typography en transitions." Marco has pushed back: rendering a genuinely beautiful
cinematic experience may need specialist skill, and building from scratch may set the bar impossibly
high.

What building blocks actually exist today, how close does the best of them get, and — for each — what
is its *ceiling*, not its default?

## Verdict

**No drop-in solution exists.** Not one library, framework or component on npm takes a list of
`Media Item`s and plays back a cinematic story. The nearest things are, in descending order of
seriousness: **Remotion**, which is a *video production* framework whose in-browser `<Player>` is a
by-product of that; **AMP Story**, which is a whole-page publishing runtime with an entrance-animation
preset vocabulary; and **react-insta-stories**, a 1.5 k-star tap-through Instagram-story shell with
zero dependencies. Every package on npm whose name contains "ken burns" was last published between
2016 and 2018. **The category is empty, and its emptiness is the single most important finding in
this note.**

**The composition model that clears the bar is DOM + CSS, and the strongest evidence is Apple's own.**
I fetched the live [apple.com/airpods-pro](https://www.apple.com/airpods-pro/) page — the reference
for "cinematic on the web" — and counted **197 `<picture>` elements, 15 `<video>` elements, and zero
`<canvas>` elements**. Every one of those videos carries `muted playsinline preload="none"
role="img"` plus a keyframe-driven load/play controller (`data-inline-media-load-keyframe`,
`data-inline-media-play-keyframe`) and a still `endframe` image. Apple builds cinematic web pages out
of ordinary images and muted inline videos moved by CSS. It does not composite in canvas, and it does
not use WebGL.

**And there is a hard technical reason to stay on that path: the moment you composite in canvas or
WebGL, the NAS must serve CORS headers.** WebKit's `validateHTMLVideoElement` throws a
`SecurityError` if `taintsOrigin(&video)`
([`WebGLRenderingContextBase.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/canvas/WebGLRenderingContextBase.cpp)),
and the same origin-taint rule governs `drawImage` into a 2D canvas. The sibling note
[`local-network-access-ipados.md`](local-network-access-ipados.md) established that rendering media
through `<img>`/`<video>` needs **no** CORS headers at all. So the choice of composition model
reaches back and changes what the Synology has to be configured to send. **DOM composition keeps the
media pipeline simple; canvas/WebGL composition does not.**

**Remotion is a real candidate and a real trap.** Its ceiling on the parts that matter is genuinely
high and genuinely open: `linearTiming({durationInFrames, easing})` takes **any** `(t: number) =>
number`, and `TransitionPresentation` is a plain interface you can implement yourself (read from the
installed `@remotion/transitions` 4.0.518 typings) — the exact opposite of globe.gl's hardcoded
`Cubic.InOut`. But three findings cut against it.

1. **Eleven of its twenty built-in transitions — including `dissolve`, `crosswarp`, `cross-zoom`,
   `film-burn`, `ripple`, `linear-blur`, `dreamy-zoom`, `zoom-blur`, `zoom-in-out`, `book-flip` and
   `swap` — are built on the HTML-in-Canvas API**, and Remotion's own error string says so: *"HTML in
   Canvas is not supported. Two common causes: Chrome is older than version 148 (update Chrome), or
   the HTML-in-Canvas flag is disabled at chrome://flags/#canvas-draw-element"*. In WebKit trunk
   `HTMLInCanvasEnabled` is `status: unstable` and `false` on every frontend
   ([`UnifiedWebPreferences.yaml`](https://github.com/WebKit/WebKit/blob/main/Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml)) —
   the same status class that, in the sibling note, meant Local Network Access "has not shipped and
   cannot be enabled". **On iPadOS Safari, Remotion's good transitions do not run; you get `fade`,
   `slide`, `wipe`, `flip`, `clock-wipe`, `iris`, `push-cut` and `none`.**
2. **Measured, the Player costs 103 KB gzipped over a bare React app, and 222 KB if you take
   `@remotion/media`** (which pulls in mediabunny for WebCodecs frame extraction) — against **43 KB
   for Motion, 17 KB for react-spring, 28 KB for GSAP and 14 KB for anime.js**.
3. **Every named success story on Remotion's own page is a tool that renders MP4s** — Submagic,
   AIVideo.com, Revid.ai, Crayo.ai, Typeframes, MakeStories. This is the same shape as the damning
   globe finding: **Remotion's proven, revenue-generating use is producing video files, not being a
   beautiful in-browser playback surface on an iPad.**

**The pre-render escape hatch is the architecture the reference products actually chose, and it is
weaker than it looks here.** Google's own support page for featured memories says to *"click Play or
wait to be notified when the highlight video is ready"* — an asynchronously produced video file. But
for `rememberwhen` a pre-rendered MP4 costs the things the map cares about: deep-linking to `Aarhus`
becomes `video.currentTime = t` and therefore needs forced keyframes at every `Chapter` boundary;
range-request seeking means `206` responses, which the sibling note established **a Service Worker
cannot cache**; and a naive ffmpeg Ken Burns is not sub-pixel smooth — `vf_zoompan` crops at integer
offsets and then rounds *down* to the chroma-subsampling grid (`x &= ~((1 << log2_chroma_w) - 1)` in
[`libavfilter/vf_zoompan.c`](https://github.com/FFmpeg/FFmpeg/blob/master/libavfilter/vf_zoompan.c)),
so in yuv420p the crop window snaps in two-pixel steps. It remains the right *fallback* and the right
*answer for a "share this Memory" feature*, not the right v1 renderer.

**So: building blocks only, and the stack is small.** Concretely: **React + CSS transforms on
`<picture>`/`<img>` + muted `playsinline` `<video>` + one timeline driver**, where the driver is
GSAP, anime.js v4, Motion, or hand-written `requestAnimationFrame` over the Web Animations API. What
is genuinely left to author is listed in §21 and is roughly: a chronology-to-timeline compiler, a
preload/eviction window, a Ken Burns crop-and-move planner, a chapter-title typography layer, gesture
handling, and the choreography itself. **None of that is available off the shelf in any candidate,
including Remotion** — Remotion gives you the frame clock and the `<Sequence>` model, and you still
write all six.

**Three answers, stated plainly.**

1. **Does a drop-in solution exist, or only building blocks?** Only building blocks. The single
   nearest drop-in, Remotion, is a video-rendering framework whose most interesting transitions do
   not run in Safari, and whose track record is MP4 production.
2. **If only building blocks: which stack, and what is genuinely left to author?** React + DOM/CSS
   composition (`<picture>` and muted inline `<video>`, per Apple's own page) + a timeline driver.
   **Opinion: GSAP is the strongest driver** — it is now free including `CustomEase` (arbitrary
   authored easing curves), `Flip` (shared-element/match-cut choreography), `Observer` (unified touch
   gestures) and `SplitText` (per-word/per-character title animation), it costs a measured 28 KB
   gzipped for the core, and its licence changed in Webflow's favour, not against ours. **anime.js
   v4 is the MIT alternative at half the size.** What is left to author is §21.
3. **Which two or three directions are worth prototyping?** §22: **(A)** bespoke DOM/CSS story
   engine, one `Chapter`, GSAP-driven; **(B)** Remotion `<Player>` as the control, same `Chapter`,
   Safari-safe transitions only; **(C)** a pre-rendered MP4 of the same `Chapter` from ffmpeg on the
   .NET indexer. Run all three on the same `Chapter` of the same Memory so Marco is comparing one
   thing.

---

## 1. How the numbers in this note were produced

Same methodology as [`3d-globe-libraries.md` §1](3d-globe-libraries.md), reused deliberately so the
two notes are comparable. In a scratch directory I installed each package at the version listed in
the preamble and bundled a realistic entry point with **esbuild 0.28.2**
(`--bundle --minify --format=esm --define:process.env.NODE_ENV='"production"'`), then compressed the
output with `gzip -9` and Node's `zlib.brotliCompressSync`. Composition figures come from esbuild's
`--metafile`, aggregated per npm package. **No number in this note comes from Bundlephobia.**

Each React entry point is a realistic miniature of the story renderer — a Ken Burns shot with an
authored bezier easing, a spring, and a cross-dissolve to a second shot — not a bare import. The
React baseline (react + react-dom + `createRoot`) is measured separately so every React-dependent
figure can be quoted as a delta.

Package metadata (versions, publish dates, licences) comes from the npm registry API; repository
activity (`pushed_at`, `archived`, releases, last commit dates) from the GitHub API. WebKit facts come
from WebKit trunk on GitHub. The apple.com figures come from fetching the live page and counting
elements.

## 2. What the reference products actually do

### 2.1 Apple Photos Memories

Apple documents the *curation* extensively and the *rendering* not at all.

From Apple Machine Learning Research,
[A Multi-Task Neural Architecture for On-Device Scene Analysis](https://machinelearning.apple.com/research/on-device-scene-analysis):
the Apple Neural Scene Analyzer's tags are "ingested in the Photos knowledge graph, which is the
foundation of personalized experiences across the user's photo library", and its uses include
"ranking imagery for cover photo selection, titles for generated video memories, and alignment with
music content that enhances the experience". From
[Learning Iconic Scenes with Differential Privacy](https://machinelearning.apple.com/research/scenes-differential-privacy):
Photos "presents Memories as curated collections of photos and videos set to music", and "the key
photo selection algorithm is powered by iconic scenes crowd-learned with differential privacy".

**Everything Apple publishes about Memories is about deciding *what* to show, not *how* to move it.**
That is the important structural fact for this project, because — inference — the `Indexer` already
occupies exactly that position: it is where the expensive selection work happens, off the runtime.
The map already says so ("de indexer mag intelligent zijn en de runtime dom en razendsnel").

**How the Memory movie is rendered is [UNESTABLISHED]** and I do not believe it is publicly
documented. There is no PhotoKit API for it and no WWDC session I could find that describes the
compositor.

**One live URL worth more than any of this reading:** Apple ships Memories *on the web*, at
[icloud.com/photos](https://www.icloud.com/photos) → Memories in the sidebar. Apple's own support
page says you "select a memory to play it" and can pause and resume it
([Apple Support: View your photos and videos on iCloud.com](https://support.apple.com/guide/icloud/view-your-photos-and-videos-mm73262d11fe/icloud)).
**Marco should open that on the iPad, in Safari, with his own library.** It is the closest thing to a
ground truth for "how good can this be in a browser", and it is his photos. Whether iCloud renders it
as DOM playback or as a streamed video is **[UNESTABLISHED]** — the page is behind authentication and
I could not inspect it.

### 2.2 Google Photos highlight videos

Google is more explicit, and the answer is the pre-render architecture. Google's support page
*Find & manage your featured memories* instructs, on a computer: go to photos.google.com, click a
memory, and **"click Play or wait to be notified when the highlight video is ready"**
([Google Photos Help, Desktop](https://support.google.com/photos/answer/9454489?hl=en&co=GENIE.Platform%3DDesktop)).
A highlight video is "a video with music using photos and videos", can be saved, and can be edited by
reordering clips and changing the music. **Inference: that is a server-rendered video file, produced
asynchronously and then played.** It is the same architecture as §19 below.

Google's most cinematic photo feature is documented in detail:
[The Technology Behind Cinematic Photos](https://research.google/blog/the-technology-behind-cinematic-photos/)
(Google Research, 23 February 2021). It predicts a depth map from a single RGB image with "a
convolutional neural network with encoder-decoder architecture"; "the first step in 3D scene
reconstruction is to create a mesh by extruding the RGB image onto the depth map"; the virtual camera
rig is "inspired by professional video camera rigs to create cinematic motion"; and the trajectory is
chosen by optimisation — they "define a loss function that captures how much of the stretchiness can
be seen in the final animation, which allows [them] to optimize the camera parameters for each unique
photo", weighted by a segmentation mask splitting the image into "head, body and background".

**Which parts of that are reproducible on the web?** Opinion, with the reasoning shown:

- The **depth prediction** is not: it is an ML model, and it belongs in the `Indexer` if anywhere.
- The **mesh extrusion and parallax camera** are trivially reproducible on the web — it is a
  displaced plane in three.js, and the globe already brings three.js into the bundle. But it needs
  the depth map, so it depends on the previous point, **and** it moves the photo into WebGL, which
  (see the Verdict) drags CORS onto the NAS.
- The **trajectory optimisation** is reproducible and is the genuinely interesting idea: choose the
  Ken Burns start and end crop per photo by optimising against a saliency/face mask, not by picking
  a random direction. **That is a job for the `Indexer`**, and it is the single highest-leverage
  idea in this whole section, because it is what separates "pan and zoom" from "pan and zoom that
  lands on the face".

### 2.3 apple.com itself — the cinematic-web reference implementation

I fetched [apple.com/airpods-pro](https://www.apple.com/airpods-pro/) with a Safari user agent and
counted the markup:

| element | count |
|---|---|
| `<picture>` | 197 |
| `<img>` | 198 |
| `<video>` | 15 |
| `<canvas>` | **0** |

Each `<picture>` carries three `<source>` breakpoints with `1x`/`2x` `srcset`. Each `<video>` is of
the form `<video id="…" preload="none" role="img" muted playsinline data-inline-media
data-inline-media-basepath="…" …>` with a companion `_endframe` still image, and the page's
controller attributes are `data-inline-media-controller`, `data-inline-media-load-keyframe`,
`data-inline-media-play-keyframe`, `data-inline-media-breakpoint-substitution-map`.

**Three things follow.** First, **Apple's own answer to "cinematic on the web" is DOM composition**,
not canvas and not WebGL. Second, `preload="none"` plus an explicit load-keyframe is Apple's answer
to the preload problem in §4.4 — they load a video only when the scroll position says it is about to
be needed, and show a still until then. Third, `muted playsinline` on every single video is not a
stylistic choice: §4.2 shows it is what makes concurrent playback legal on iOS at all.

## 3. The composition models, and what composites with what

Five candidate models exist. This section is about what each can and cannot put next to what.

### 3.1 DOM + CSS

`<img>`/`<picture>` and `<video>` positioned and animated with `transform`, `opacity`, `filter`,
`clip-path`, `mask-image` and `mix-blend-mode`. Compositing is CoreAnimation's job.

- **Ken Burns:** `transform: scale() translate()` on an `<img>`, or `object-view-box` (below).
  Transforms are interpolated in the compositor at layer resolution, so motion is sub-pixel; **but
  whether the *raster* is re-generated at the scaled resolution during the animation, or a fixed
  raster is stretched, is [UNESTABLISHED]** and is exactly the kind of thing that decides whether it
  looks soft. Device test.
- **`object-view-box`** is a much cleaner Ken Burns primitive than `transform` — it changes the
  *source rectangle* of the image without touching layout. In WebKit it is gated on
  `CSSObjectViewBoxEnabled`, which is `status: stable` and `true` on all three frontends
  (`UnifiedWebPreferences.yaml`), the property is present in WebKit's
  [`CSSProperties.json`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/css/CSSProperties.json)
  with `"animation-type": "see prose"` (i.e. animatable per
  [css-images-5](https://drafts.csswg.org/css-images-5/#the-object-view-box)). **Worth trying in the
  prototype; it is the one CSS feature here that was designed for this exact effect.**
- **Cross-dissolve:** two stacked absolutely-positioned elements and an `opacity` tween. Works for
  image↔image, image↔video and video↔video.
- **Text overlay:** real text, real kerning, `font-variation-settings`, `text-wrap: balance`. This is
  the single biggest advantage of DOM over canvas and it is not close.
- **Layered depth / parallax:** several transformed layers; `transform-style: preserve-3d` and
  `perspective` if wanted.
- **What it cannot do:** true per-pixel warps (a GLSL crosswarp, a displacement dissolve, a film
  burn). `filter` and `backdrop-filter` give blur, brightness, saturate, hue-rotate and drop-shadow;
  `mix-blend-mode` gives the Photoshop blend set. Anything beyond that needs §3.2 or §3.3.
- **Caveat worth knowing before designing around filters:** WebKit paints a video into its own
  compositing layer, and `RenderVideo::paintReplaced` short-circuits *only* when
  `hasAcceleratedCompositing() && videoElement->supportsAcceleratedRendering() &&
  !paintInfo.paintBehavior.contains(PaintBehavior::FlattenCompositingLayers)`
  ([`RenderVideo.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/rendering/RenderVideo.cpp)).
  Whenever something forces compositing layers to flatten, the video is **software-painted frame by
  frame**. **Which CSS properties force flattening on iPadOS is [UNESTABLISHED]** — measure it,
  because it is the difference between a free effect and a per-frame readback.

### 3.2 Canvas2D

`ctx.drawImage(imageOrVideo, …)` every frame. Composites everything into one surface, so image and
video mix freely and `globalCompositeOperation` is available.

- **Cost:** you re-implement layout, text and typography. WebKit's canvas text has no
  `text-wrap: balance`, no variable-font axes beyond what you set on the font shorthand, and no
  hyphenation.
- **Blocker:** origin taint. A cross-origin image or video drawn into a canvas taints it, and any
  subsequent read throws. **The NAS would need `Access-Control-Allow-Origin` and the elements would
  need `crossorigin="anonymous"`** — see [`local-network-access-ipados.md` §3](local-network-access-ipados.md),
  which established that DSM's ability to send those headers is itself a spike.
- `CanvasUsesAcceleratedDrawing` defaults to `true` on the `WebKit` frontend
  (`UnifiedWebPreferences.yaml`), so drawing is GPU-backed; `OffscreenCanvas` and
  `OffscreenCanvasInWorkers` are `status: stable` and `true` on `PLATFORM(COCOA)`.

### 3.3 WebGL

Everything in the globe note applies. Plus:

- **Video → texture works and has a fast path.** `texImage2D(…, HTMLVideoElement)` reaches
  `player->videoFrameForCurrentTime()` and then
  `graphicsContextGL()->copyTextureFromVideoFrame(…)`, falling back to `videoFrameToImage()`
  (`WebGLRenderingContextBase.cpp`). `WebCodecsVideoFrame` has an equivalent zero-copy path.
- **Same origin-taint blocker**, and it is explicit:
  `validateHTMLVideoElement` returns `Exception { ExceptionCode::SecurityError }` when
  `taintsOrigin(&video)`.
- **Lockdown Mode kills it**, as the globe note established (`WebGLEnabled` and `WebGPUEnabled` both
  carry `disableInLockdownMode: true`). The map already lists "a non-WebGL entrance" as unspecified;
  **this note adds that the same applies to the story renderer.**
- 16 live WebGL contexts max on the main thread, 4 in workers; exceeding it recycles the least
  recently used one. Relevant here because the globe already holds one.

### 3.4 WebCodecs → canvas/WebGL

Decode video frames yourself and composite them. Feasible on iPadOS (see §18) but it is a much larger
build, it inherits the CORS requirement, and — the killer — `WebCodecsVideoEnabled` carries
**`disableInLockdownMode: true`** in `UnifiedWebPreferences.yaml`, exactly like WebGL. A WebCodecs
story renderer has the same fallback problem as the globe.

### 3.5 A pre-rendered `<video>`

One `<video>` element, one file. See §19.

## 4. iPadOS Safari: the hard constraints

### 4.1 What is a WebKit *default* and what is a Safari *setting*

Several preferences below are `status: embedder` in `UnifiedWebPreferences.yaml`, which means the
embedding application sets them and the listed value is only the default handed to WKWebView. Safari
configures its own. **Where that is true I say so, and mark the Safari-observable behaviour
[UNESTABLISHED].** The WebKitLegacy defaults are still informative because they encode Apple's design
intent, and several of them are keyed on `PAL::deviceClassIsSmallScreen()` — iPhone versus iPad.

### 4.2 How many videos can play at once

This is the single most useful thing in this section and it has a precise answer.

`MediaSessionManageriOS::resetRestrictions()` adds, for `MediaType::VideoAudio` only:

> `addRestriction(PlatformMediaSession::MediaType::VideoAudio, { MediaSessionRestriction::ConcurrentPlaybackNotPermitted, MediaSessionRestriction::BackgroundProcessPlaybackRestricted, MediaSessionRestriction::SuspendedUnderLockPlaybackRestricted });`
> — [`MediaSessionManagerIOS.mm`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/audio/ios/MediaSessionManagerIOS.mm)

`MediaSessionManagerInterface::enforceConcurrentPlaybackRestriction` then pauses every other *playing*
session that cannot play concurrently with the new one
([`MediaSessionManagerInterface.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/audio/MediaSessionManagerInterface.cpp)),
and `PlatformMediaSession::canPlayConcurrently` returns `true` immediately when the two media types
differ and at least one of them is not an audio-producing type
([`PlatformMediaSession.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/audio/PlatformMediaSession.cpp)).
The media type comes from:

```cpp
PlatformMediaSession::MediaType HTMLMediaElement::mediaType() const
{
    if (m_player && m_readyState >= HAVE_METADATA) {
        auto hasVideo = this->hasVideo();
        if (hasVideo && canProduceAudio())
            return PlatformMediaSession::MediaType::VideoAudio;
        return hasVideo ? PlatformMediaSession::MediaType::Video : PlatformMediaSession::MediaType::Audio;
    }
    return presentationType();
}
```
— [`HTMLMediaElement.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/HTMLMediaElement.cpp),
where `presentationType()` for a `<video>` is `muted() ? Video : VideoAudio`.

**So, established from source:**

- **At most one `<video>` that produces audio may play at a time on iOS/iPadOS.** Starting a second
  one pauses the first. Two Memories' videos, or a video plus background music through a `<video>`,
  will fight.
- **Muted videos, and videos with no audio track, are `MediaType::Video` and carry no concurrency
  restriction at all.** Two muted clips can play simultaneously, which is what a video-to-video
  cross-dissolve requires. This is corroborated by apple.com running fifteen muted inline videos on
  one page (§2.3).
- **How many muted videos can decode at once before the hardware or the tab gives up is
  [UNESTABLISHED].** That is a VideoToolbox / OS resource limit, not a WebKit constant; I found no
  number in WebKit and Apple publishes none. Measure it.

One more number from the same function: `MediaSessionManageriOS::resetRestrictions()` restricts video
in background tabs when `ramSize() < 1024 * 1024 * 1024` — a 1 GB device-RAM threshold. Not binding on
a modern iPad, but it is the only concrete memory constant in the media path.

### 4.3 Autoplay and the user gesture

The canonical statement is Apple's own,
[New `<video>` Policies for iOS](https://webkit.org/blog/6784/new-video-policies-for-ios/):

- "`<video autoplay>` elements will now honor the `autoplay` attribute" for elements with **no audio
  tracks or `muted="true"`**.
- "If a `<video>` element gains an audio track or becomes un-muted without a user gesture, playback
  will pause."
- "`<video autoplay>` elements will only begin playing when visible on-screen" and "will pause if
  they become non-visible."
- A user gesture means the `play()` call "directly resulted from a handler for a `touchend`, `click`,
  `doubleclick`, or `keydown` event".
- `playsinline` is an **iPhone** concern; on iPad videos have always played inline. WebKit source
  confirms the split: `defaultAllowsInlineMediaPlayback()` returns `!PAL::deviceClassIsSmallScreen()`
  and `defaultInlineMediaPlaybackRequiresPlaysInlineAttribute()` returns
  `PAL::deviceClassIsSmallScreen()`
  ([`WebPreferencesDefaultValues.mm`](https://github.com/WebKit/WebKit/blob/main/Source/WebKitLegacy/mac/WebView/WebPreferencesDefaultValues.mm)).
  **Set `playsinline` anyway** — it costs nothing and makes the app correct on iPhone.

**Two restrictions nobody expects**, both in `HTMLMediaElement::HTMLMediaElement`:

```cpp
if (page && page->isLowPowerModeEnabled())
    mediaSession->addBehaviorRestriction(MediaElementSession::RequireUserGestureForVideoDueToLowPowerMode);

if (page && page->isAggressiveThermalMitigationEnabled())
    mediaSession->addBehaviorRestriction(MediaElementSession::RequireUserGestureForVideoDueToAggressiveThermalMitigation);
```

**With Low Power Mode on, or the iPad thermally throttled, video will not autoplay** — every clip in
the story needs a gesture. The app must detect a rejected `play()` promise and degrade to the poster
frame rather than stalling. This is a real, common condition on a family iPad.

The good news: `HTMLMediaElement::removeBehaviorRestrictionsAfterFirstUserGesture()` clears
`RequireUserGestureForLoad`, `AutoPreloadingNotPermitted`, `RequireUserGestureForVideoRateChange`,
`RequireUserGestureForAudioRateChange`, `RequireUserGestureForFullscreen`, and both of the above.
**Inference: the tap on the globe pin that opens the story is itself the qualifying gesture**, so a
story entered by tapping is in a much better position than one entered by deep link. Worth confirming
on device.

### 4.4 `preload`

`RequiresUserGestureToLoadVideo` has WebCore default `true` on `PLATFORM(IOS_FAMILY)`
(`UnifiedWebPreferences.yaml`), and when set it adds `MediaElementSession::RequireUserGestureForLoad`,
gating `dataLoadingPermitted()`
([`MediaElementSession.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/MediaElementSession.cpp)).
Separately, `AutoPreloadingNotPermitted` is added when `!document->mediaDataLoadsAutomatically()`.
Both are `embedder`-controlled, so **the exact behaviour in Safari on iPadOS is [UNESTABLISHED]** and
must be measured. The 2016 WebKit post confirms `preload="metadata"` has been honoured since iOS 8.

**What to do about it is not in doubt, because Apple has already shown it:** `preload="none"`,
a still `endframe` image, and an explicit "load now" trigger driven by the story's own timeline
(§2.3). Build the preloader; do not trust `preload="auto"`.

### 4.5 Images: preloading and decode

`HTMLImageElement.idl` exposes `Promise<undefined> decode()`, `fetchPriority`, and
`loading` (gated on `LazyImageLoadingEnabled`)
([`HTMLImageElement.idl`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/HTMLImageElement.idl)).
**`img.decode()` is the correct primitive for a photo story**: it resolves when the bitmap is ready,
so a shot can be swapped in without a decode hitch on the compositor. Combine with
`fetchPriority="high"` on the next shot and `low` on the one after.

**How many full-screen decoded photos can be held before iPadOS kills the tab is [UNESTABLISHED]** —
the same jetsam behaviour the globe note could not pin down, with no published number. This makes an
explicit **eviction window** (keep N-1, current, N+1, N+2; drop the rest) a design requirement rather
than an optimisation.

### 4.6 Fullscreen

Remotion's docs state flatly: *"On Safari on iOS, the Fullscreen API is not supported, so the Player
cannot go into fullscreen"*, and *"This option is not supported on mobile. You do not double-tap on
mobile to go to fullscreen"*
([`<Player>` docs](https://www.remotion.dev/docs/player/player)). In WebKit, `FullScreenEnabled` is
`status: embedder` and defaults `false` except on GTK/WPE, so **what Safari on iPadOS actually
enables is [UNESTABLISHED]** from source.

**This is mostly moot for `rememberwhen`:** an installed PWA with `"display": "standalone"` (or
`"fullscreen"`) has no browser chrome to escape. Do not design a fullscreen button into the story
player; design the PWA manifest instead.

### 4.7 HDR and wide gamut

Safari 26.0 "adds support for HDR images on the web. You can embed images with high dynamic range
into a webpage, just like other images — including images in WebGPU Canvas"
([WebKit Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)).
WebKit trunk carries `HDRAcceleratedApplyGainMapEnabled` (`status: stable`, `true` everywhere),
`SupportHDRDisplayEnabled` and `SupportHDRCompositorTonemappingEnabled` (the latter `testable`,
`false`).

**Opinion: treat HDR as a hazard for v1, not a feature.** Mixing HDR and SDR photos in a
cross-dissolve, on a display that adapts its headroom, is a good way to get a brightness pop mid-cut.
The safe move is for the `Indexer` to normalise derivatives to SDR sRGB (or Display P3) and revisit
later. **Whether an HDR gain-map JPEG cross-dissolved against an SDR JPEG pops on an iPad is
[UNESTABLISHED]** — a two-photo device test would settle it.

## 5. HEIC and the media pipeline

This bears directly on the map's "Media derivatives" fog, so it is worth stating precisely.

WebKit's default image-type allowlist on Cocoa is, verbatim from
[`UTIRegistry.mm`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/graphics/cg/UTIRegistry.mm):

```
"com.compuserve.gif", "com.microsoft.bmp", "com.microsoft.cur", "com.microsoft.ico",
"public.jpeg", "public.png", "public.tiff", "public.mpo-image",
"public.webp", "com.google.webp", "org.webmproject.webp",
#if HAVE(AVIF)   "public.avif", "public.avis",
#if HAVE(JPEGXL) "public.jxl", "public.jpegxl", "public.jpeg-xl",
#if HAVE(HEIC)   "public.heic", "public.heics", "public.heif",
```

and in [`PlatformHave.h`](https://github.com/WebKit/WebKit/blob/main/Source/WTF/wtf/PlatformHave.h),
`HAVE_HEIC` and `HAVE_AVIF` are both `#if PLATFORM(COCOA)`, and `HAVE_JPEGXL` covers
`PLATFORM(MAC) || PLATFORM(MACCATALYST) || PLATFORM(IOS) || PLATFORM(APPLETV) || PLATFORM(WATCHOS)`.
The list is then filtered against `CGImageSourceCopyTypeIdentifiers()`, i.e. what ImageIO on the
device actually decodes.

**So Safari on iPadOS displays HEIC, HEIF, AVIF, JPEG XL, WebP, JPEG, PNG, TIFF and MPO in `<img>`.**

**But — and this is the finding that decides the derivative format — under Lockdown Mode the list
collapses to four:**

```cpp
static constexpr std::array lockdownSupportedImageTypes = {
    "org.webmproject.webp", "public.jpeg", "public.png", "com.compuserve.gif",
};
```

**No HEIC. No HEIF. No AVIF. No JPEG XL. No TIFF.**

**Conclusion for the `Indexer`:** publish derivatives as **JPEG or WebP**. Both survive Lockdown
Mode, both work in every browser, and WebP is the smaller of the two at equal quality. HEIC and AVIF
are tempting on file size and would work on a normal iPad, but they fail in Lockdown Mode — the same
mode that already kills the globe — so choosing them would mean the app has *two* independent
Lockdown failure modes instead of one. **Opinion: JPEG for the large "cinematic" derivative (fastest
hardware decode path, widest compatibility), WebP for thumbnails and cover images.** The originals on
the NAS stay HEIC and are never served.

**Video:** the equivalent question is codec, not container. `WebCodecsHEVCEnabled` is `status:
mature` and `true` on `PLATFORM(COCOA)`; `WebCodecsAV1Enabled` is `status: preview` and `false` on
Cocoa (`UnifiedWebPreferences.yaml`). For `<video>` playback specifically, **H.264 in MP4 is the
choice that cannot go wrong**; HEVC works on Apple platforms and nowhere else reliably.

## 6. Remotion

**Licence first, because it is unusual.** `remotion@4.0.518` declares `"license": "SEE LICENSE IN
LICENSE.md"`. The
[LICENSE.md](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md) grants free use to "an
individual", "a for-profit organization with up to 3 employees", and non-profits, for "creating
videos and images", commercially or not. Everyone else needs a paid Company License; and "Companies
needing a license and using cloud rendering must set it up with Cloud Rendering Units"
([Lambda docs](https://www.remotion.dev/docs/lambda)).

**For `rememberwhen` — a private family app built by an individual — Remotion is free.** But it is
not open source and it is not MIT, and if this ever moved inside a company it would need a licence.
Flagging it loudly as the brief asks.

### 6.1 What the `<Player>` actually is

A React component that renders **DOM, not canvas**. It renders the composition into an absolutely
positioned div sized at the composition's `width`/`height` in CSS pixels and applies
`transform: scale(${scale})` to fit the container (read from the installed
`@remotion/player/dist/esm/index.mjs`). Playback is a `requestAnimationFrame` loop that advances a
frame counter and re-renders React.

**Two consequences worth designing around.** First, you author at composition resolution — write
`fontSize: 64` and mean 64 px *at 1920×1080*, then the whole thing is scaled to the iPad's viewport.
That is a real convenience for a "cinematic" layout and a real trap if you expected CSS pixels.
Second, because it is DOM, everything in §3.1 is available: real typography, `filter`, `mask-image`,
`mix-blend-mode`, and `<video>` elements composited by CoreAnimation.

`<OffthreadVideo>` is render-only — its source resolves to
`http://localhost:${window.remotion_proxyPort}/proxy?src=…&time=…` (read from
`remotion/dist/esm/index.mjs`), a proxy that exists only during a server render. In the browser it
falls back to a `<video>` element.

`@remotion/media`'s `<Video>` is the newer path: it "extracts the exact frame from the video using
Mediabunny and displays it in a `<canvas>` tag" ([docs](https://www.remotion.dev/docs/media/video)),
falling back to `<OffthreadVideo>` on error. **That is frame-accurate and it is also the path that
drags in WebCodecs, canvas compositing, CORS on the NAS, and Lockdown-Mode fragility all at once.**

### 6.2 The ceiling: easing and transitions

Genuinely open, and this is Remotion's best feature. From the installed typings:

```ts
export declare const linearTiming: (options: {
    durationInFrames: number;
    easing?: ((input: number) => number) | undefined;
}) => TransitionTiming;

export type TransitionPresentation<PresentationProps extends Record<string, unknown>> = {
    component: LooseComponentType<TransitionPresentationComponentProps<PresentationProps>>;
    props: PresentationProps;
};
```

Any easing function. Any presentation component. Plus `springTiming({config, durationInFrames,
durationRestThreshold, reverse})`. **There is no globe.gl-style hardcoded-easing trap here.**

### 6.3 The ceiling: the transitions that do not run in Safari

I grepped every shipped presentation in `@remotion/transitions@4.0.518` for `HtmlInCanvas`:

| Runs on iPadOS Safari (DOM/CSS) | Needs HTML-in-Canvas (Chrome 148+ with a flag) |
|---|---|
| `fade`, `slide`, `wipe`, `flip`, `clock-wipe`, `iris`, `push-cut`, `none` | `dissolve`, `crosswarp`, `cross-zoom`, `film-burn`, `ripple`, `linear-blur`, `dreamy-zoom`, `zoom-blur`, `zoom-in-out`, `book-flip`, `swap` |

The mechanism is `HtmlInCanvasPresentation`, which calls `canvas.transferControlToOffscreen()`, hands
the rasterised DOM subtree to a WebGL2 shader via `uploadElementImage(gl, elementImage)`, and throws
`HTML_IN_CANVAS_UNSUPPORTED_MESSAGE` if `HtmlInCanvas.isSupported()` is false. The message names
Chrome 148 and `chrome://flags/#canvas-draw-element`. **This is Remotion's equivalent of the
globe.gl hardcoded-easing finding, and it is worse: it is not a limitation you can work around from
outside, because the API it depends on does not exist in WebKit.**

Nothing stops you writing your own presentation — a cross-dissolve is `fade`, and a Ken Burns match
cut is a custom `TransitionPresentation` over CSS transforms. But then you are authoring the
interesting half yourself, which is precisely the question this note exists to answer.

### 6.4 Documented iOS limitations

From Remotion's own docs: no Fullscreen API on iOS Safari; `autoPlay` "is therefore discouraged if
your video contains any audio"; "on iOS Safari, the volume will be set to 1"; media tags "cannot be
played in reverse"; and "Mobile Safari is the most strict browser, and if your composition plays well
there, you should have no problems elsewhere". On flicker: "in Safari prefetching as described in
Option 5 is not enough" because blob URLs may still be slow from disk, and the suggested alternative
(base64 prefetching) is itself "not recommended" for large assets
([player-flicker](https://www.remotion.dev/docs/troubleshooting/player-flicker)). **That last one is
the exact problem this app has, at family-photo-library scale.**

### 6.5 Shipped products

From [remotion.dev/success-stories](https://www.remotion.dev/success-stories): Submagic
(submagic.co), AIVideo.com, Revid.ai, Crayo.ai, Typeframes (typeframes.com), Shortvid.io, YARX
(yarx.ch), MakeStories (makestories.io). **All eight are video-generation tools.** MakeStories is the
closest to this app's shape and its Remotion use is explicitly "export their stories as real MP4
videos" — i.e. Remotion is its *renderer*, not its *player*.

**I found no shipped consumer product using `@remotion/player` as a cinematic playback surface on
iPad.** Same honest answer as the globe note gave for globe.gl. The Player's live demo is at
[remotion.dev/player](https://www.remotion.dev/player) — worth opening on the iPad, since it is the
cheapest possible read on how the Player *feels* on the target device.

## 7. Motion Canvas — out

`@motion-canvas/core@3.17.2` and `@motion-canvas/2d@3.17.2`, both MIT, both **published 2024-12-14**.
The GitHub repo (19 k stars, not archived) had its last code commit on **2025-02-16**; the only
activity since is a docs-domain change on 2026-07-02. The most recent release tag is a
`v3.18.0-alpha.0` from 2025-02-16.

Structurally it is also wrong for this: Motion Canvas is an **authoring tool for producing
explanatory videos**, driven by generator functions in an editor, rendering to Canvas2D. There is no
React integration and no story-playback runtime. **Out on both maintenance and shape.**

## 8. Theatre.js — out

`@theatre/core@0.7.2` (Apache-2.0) and `@theatre/studio@0.7.2` (**AGPL-3.0-only**), both published
**2024-05-19**. The GitHub repo's last push was **2024-08-14**. Its README still carries the notice:

> "✨ Update: Theatre.js 1.0 is around the corner. We have _temporarily_ moved development to a
> private repo so we can iterate faster. We'll push our work back to this public repo soon."

Two years on, 1.0 has not shipped and nothing has been pushed back. **Out on maintenance.** Worth
recording the licence anyway: `@theatre/studio` is **AGPL-3.0-only**, which is a genuine constraint
if the visual editor were ever bundled into a deployed app rather than used in development.

The idea — a visual keyframe editor that writes a sequence you then play back in production — is
exactly right for this project, and its absence is part of why the category is empty. **Opinion: the
`Indexer` is where that editor should live if it ever exists, not in a JS library.**

## 9. GSAP

**Licence: changed, in our favour, and verified against GSAP's own site.** `gsap@3.15.0` declares
`"license": "Standard 'no charge' license: https://gsap.com/standard-license."`.
[gsap.com/licensing](https://gsap.com/licensing/) states GSAP is "free for everyone" thanks to
Webflow, effective **30 April 2025**, and that "Commercial usage is covered under the standard
license. All of GSAP including the plugins that were formerly 'members-only' … can be used in
commercial projects at no charge." The
[standard licence](https://gsap.com/standard-license) permits use "in any website, web application,
or digital interface by any person or entity" and prohibits only building tools that compete with
Webflow's visual animation builder, plus reverse-engineering for competitive products.

**Flag, honestly: GSAP is free but it is not open source.** No SPDX licence, no OSI licence, a
carve-out written to protect a specific commercial interest, and no right to redistribute source. For
a private family app that is a non-issue. It is still a different category from MIT.

**What ships in the npm package** (all `dist/` entries in 3.15.0): `CustomEase`, `CustomBounce`,
`CustomWiggle`, `Draggable`, `DrawSVGPlugin`, `EasePack`, `Flip`, `GSDevTools`, `InertiaPlugin`,
`MorphSVGPlugin`, `MotionPathPlugin`, `MotionPathHelper`, `Observer`, `Physics2DPlugin`,
`ScrambleTextPlugin`, `ScrollSmoother`, `ScrollToPlugin`, `ScrollTrigger`, `SplitText`, `TextPlugin`,
`PixiPlugin`, `EaselPlugin`, `CSSRulePlugin`. **Every formerly-paid plugin is in the box.**

**Against the cinematic vocabulary the brief asks about:**

| Requirement | GSAP |
|---|---|
| Authorable easing | **`CustomEase.create('name', 'M0,0 C0.2,0 0.1,1 1,1')`** — an arbitrary bezier path as an easing curve, plus `CustomWiggle`/`CustomBounce`. This is the strongest authorable-easing story of any candidate. |
| Ken Burns / pan-and-scan | `gsap.fromTo(img, {scale, x, y}, {scale, x, y, ease})`. Sub-pixel by construction; GSAP writes `transform` and CoreAnimation interpolates. |
| Cross-dissolve | An opacity tween on the timeline, positioned with `"-=1"` / labels. |
| Beat-driven or audio-synced cuts | `gsap.timeline()` with named labels; drive `timeline.time()` from `audioElement.currentTime` or `AudioContext.currentTime`. **Music is out of scope for v1 per the map**, so this is future-proofing only. |
| Match cuts | **`Flip`** — records an element's state, lets you reparent/restyle it, and animates the difference. This is the shared-element / match-cut primitive, and it is the reason to prefer GSAP over anime.js. |
| Typography | **`SplitText`** splits into lines/words/characters with configurable masking, for staggered titles. Real DOM text, so real kerning and variable fonts. |
| Gestures | **`Observer`** unifies wheel/touch/pointer with velocity and direction, with `preventDefault` and axis locking. |
| Timeline model | `gsap.timeline()` with labels, nesting, `seek()`, `timeScale()`, `progress()`, `tweenTo()`. **A story is a timeline, and this is the best timeline API in the list.** |

**Measured:** core alone **27,713 B gzipped**; core + `Observer` + `CustomEase` + `SplitText`
**37,680 B gzipped**. No React dependency (`@gsap/react` adds only a `useGSAP` hook).

**Shipped products at a high visual bar:** GSAP's own showcase lists live URLs —
[office.graffico.it](https://office.graffico.it/), [graffico.it](https://graffico.it/),
[jesperlandberg.com](https://jesperlandberg.com/), [gionatannese.com](https://www.gionatannese.com/),
[edolus.com](https://edolus.com), [bombon.rs](https://bombon.rs),
[square43.com](https://square43.com). **These are the URLs to put in front of Marco**; the visual
verdict is his. **Whether apple.com itself uses GSAP is [UNESTABLISHED]** — I grepped the AirPods Pro
markup for `gsap`/`ScrollTrigger` and found nothing, which suggests a bespoke in-house controller.

## 10. Motion (formerly Framer Motion)

`motion@13.1.1`, MIT, 33 k stars, pushed the day this note was written. `framer-motion` and
`motion-dom` are published in lockstep at the same version.

**Hybrid engine, confirmed from source:** the installed `motion-dom` bundle contains
`startWaapiAnimation` and a `NativeAnimation` class, i.e. Motion hands animations to the Web
Animations API where it can and falls back to its own JS loop otherwise. That matters on iPad: a
WAAPI transform/opacity animation runs off the main thread.

**Against the vocabulary:** `AnimatePresence` is the best exit-animation story of any candidate and
maps directly onto shot changes; `motion.img` with `initial`/`animate`/`exit` is a two-line Ken
Burns; `transition: { ease: [0.22, 1, 0.36, 1] }` takes arbitrary cubic beziers *and* arbitrary
functions; springs are first-class; `useScroll`/`useTransform` cover scroll-driven work. Layout
animations (`layoutId`) are Motion's match-cut equivalent to GSAP's `Flip`.

**Where it is weaker than GSAP for this specific job — opinion:** Motion is built around
*component state transitions*, not around a *seekable timeline*. A cinematic story is a timeline you
want to scrub, skip a `Chapter` in, and deep-link into. Motion has no first-class timeline with
labels and `seek()`; you would build one on top of `useMotionValue` and drive it yourself. GSAP hands
you that for free.

**Measured:** **102,883 B gzipped** for the React entry, i.e. **+42,658 B over the React baseline**.
Composition: `motion-dom` 93,549 B minified, `framer-motion` 32,770 B, `motion-utils` 1,948 B. The
vanilla mini build (`motion/mini`'s `animate` plus `spring`) is only **3,128 B gzipped** — worth
knowing, because it is the cheapest real animation library on this list.

**Licence flag: [Motion+](https://motion.dev/plus) is a paid product** — £299 one-time for the
Personal tier — covering "430+ examples, premium components, AI workflows, and the visual transition
editor", plus a per-seat/year Business tier. **The core library is MIT and complete**; nothing in the
free package is crippled. But the visual transition editor — the one thing that would most help here
— is behind the paywall.

## 11. react-spring

`@react-spring/web@10.1.2`, MIT, 29 k stars, actively pushed.

Spring-physics-first: you describe a target and a spring config, not a duration and a curve.
**That is the wrong default for cinema.** A cross-dissolve wants an authored curve over a known
duration so it can be cut to a beat or a shot length; a spring wants to settle when it settles.
`react-spring` does support `config: { duration, easing }`, but you are then using it against its
grain.

**Measured:** **77,283 B gzipped**, i.e. **+17,058 B over React** — the cheapest React-integrated
option by a distance. Composition: `@react-spring/core` 20,473 B minified, `shared` 12,711 B,
`web` 4,360 B, `animated` 3,634 B, `rafz` 1,791 B. Genuinely small and genuinely well-factored.

**Opinion: keep it in mind for the *controls* — the overlay that appears on interaction and fades
away — and not for the story timeline.**

## 12. anime.js v4

`animejs@4.5.0`, **MIT** (verified from the package's own `LICENSE.md`, "Copyright (c) 2025 Julian
Garnier"), 72 k stars, pushed 2026-08-21. The most-starred animation library in this note.

v4 is a full rewrite with per-feature entry points: `animejs/timer`, `/animation`, `/timeline`,
`/animatable`, `/draggable`, `/scope`, `/engine`, `/events`, `/layout`, `/easings/{eases,linear,steps,irregular,cubic-bezier,spring}`,
`/utils`, `/svg`, `/text`, `/waapi`, `/adapters`, `/adapters/three`. Note what is in that list:
a **timeline**, a **text splitter**, a **WAAPI adapter**, a **layout (FLIP) module**, and a
**three.js adapter** — which would let one timeline drive both the globe and the story.

**Measured: 14,067 B gzipped** for `createTimeline` + `animate` + eases. **Half of GSAP core, a third
of Motion.**

**Where it is behind GSAP — opinion:** no `CustomEase` equivalent for drawing an arbitrary bezier
*path* as a curve (it has cubic-bezier, spring, steps and irregular), no `MorphSVG`, no
`ScrollSmoother`, and a much smaller body of production evidence at the visual bar this app wants.
**But it is MIT, it is a third of the size, and its timeline is real.** If the licence character of
GSAP ever becomes uncomfortable, this is the swap.

## 13. Web Animations API, CSS scroll-driven animations, View Transitions

The free tier, and it is bigger than it was.

**WAAPI** — `element.animate(keyframes, options)` — costs **152 B gzipped** in my measurement,
because it is the platform. It gives compositor-thread transform/opacity animation, `cubic-bezier`
and `linear()` easing, `playbackRate`, `currentTime`, `finished` promises, and `getAnimations()`.
Two caveats from `UnifiedWebPreferences.yaml`: `WebAnimationsCustomEffectsEnabled` (the
`CustomEffect` interface, i.e. per-frame JS callbacks) is `status: testable` and **`false`
everywhere**, and `WebAnimationsCustomFrameRateEnabled` is likewise `testable` and `false`. So you
cannot ask WAAPI to run a JS effect per frame or to target a specific frame rate — for those you are
back to `requestAnimationFrame`.

**CSS scroll-driven animations** shipped in **Safari 26.0**: "Scroll-driven animations lets you tie
CSS animations to either the timeline of just how far the user has scrolled, or to how far particular
content has moved through the viewport"
([Safari 26.0 features](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/); see also
WebKit's own [guide](https://webkit.org/blog/17101/a-guide-to-scroll-driven-animations-with-just-css/)).
The properties `animation-timeline`, `scroll-timeline`, `view-timeline`, `timeline-scope` and
`animation-range` are all present in WebKit's `CSSProperties.json` **with no `settings-flag`**, i.e.
unconditionally enabled. `ThreadedScrollDrivenAnimationsEnabled` is `status: stable` and `true` on
the `WebKit` and `WebCore` frontends — Safari 26.4 added running qualifying scroll-driven animations
on the compositor thread.

**Relevance, and it is a real design fork:** the story could be *scroll-driven* rather than
*time-driven* — the user scrubs the story by scrolling, and the whole choreography is declarative
CSS with zero JS in the animation loop. That is a genuinely different product (and a genuinely
different feel) from autoplay, and the origin document specifies autoplay ("speelt standaard
automatisch af"). **Opinion: not v1, but worth knowing it is free and threaded if the interaction
model ever changes.**

**View Transitions**: `view-transition-name` is present in `CSSProperties.json` with no settings
flag. Directly useful for the globe→story handoff and for `Chapter` boundaries — it is the platform's
own match-cut. **Which Safari version shipped same-document versus cross-document view transitions is
[UNESTABLISHED]** from the sources I read; the property's presence in trunk is established.

**`object-view-box`** — see §3.1. Stable, on by default, and purpose-built for pan-and-scan.

## 14. Rive — out

`@rive-app/react-canvas@4.32.1` and `@rive-app/canvas@2.40.1` are MIT and actively maintained
(pushed the day this note was written).

**Out for two independent reasons.**

**Shape.** Rive is a vector-animation and state-machine tool. A `.riv` file is an *authored artboard*.
There is no path from "twenty Memories, each with hundreds of `Media Item`s discovered by the
`Indexer`" to a `.riv` without a human sitting in the Rive editor per Memory. That is disqualifying
for a generated library.

**Cost.** [rive.app/pricing](https://rive.app/pricing) puts shipping behind a paid tier: Free is
"Learn how to design, animate, and code in the Rive Editor" with 3 collaborative files, 1 project and
10 MB asset imports; **Cadet at $9/seat/month** is the tier described as "Ship to apps, products,
vehicles, and games" with unlimited files and export. **A recurring seat fee in a private family
app.** Flagging as the brief asks. (The exact wording of what the Free tier forbids at export time is
**[UNESTABLISHED]** — the pricing page describes tiers, not licence terms.)

## 15. Lottie / dotLottie — out

`lottie-web@5.13.0` (MIT, Airbnb; repo last pushed 2025-09-01) and
`@lottiefiles/dotlottie-web@0.79.2` / `@lottiefiles/dotlottie-react@0.19.15` (MIT, active).

Same structural objection as Rive, and sharper: a Lottie is an After Effects export. Lottie's schema
does support raster image assets, so an `Indexer` could in principle *generate* Lottie JSON with the
photos as assets and keyframed transforms — but the renderer is SVG/canvas built for vector shapes,
there is no video support at all, and you would be writing a bespoke Ken Burns compiler anyway,
targeting a format that fights you. **Out.**

## 16. AMP Story / Web Stories

The one thing on this list that is genuinely close to "a declarative photo story format".
`ampproject/amphtml` is Apache-2.0, 14.9 k stars, and actively released (tag `2608131752000`,
2026-08-18).

`amp-story` has a built-in animation vocabulary that includes exactly the right verbs —
`pan-left`, `pan-right`, `pan-up`, `pan-down`, `zoom-in`, `zoom-out`, plus `fade-in`, `drop`,
`fly-in-*`, `pulse`, `rotate-in-*`, `scale-fade-*`, `twirl-in`, `whoosh-in-*` — with
`animate-in-duration`, `animate-in-delay`, `animate-in-after` (chaining by element id) and
`animate-in-timing-function`, and elements "with different entrance animations can be nested to
combine them into one" ([amp.dev amp-story](https://amp.dev/documentation/components/amp-story/?format=stories)).

**Why it is still out — three reasons, in order.**

1. **It is a page format, not a component.** An AMP Story is a validated AMP document with its own
   runtime and its own restrictions on custom JavaScript. It cannot be a `CinematicStoryView` inside
   a React PWA next to a three.js globe; it would have to *be* the app, or be iframed, and iframing
   it forfeits the shared shell, the gestures and the transition from the globe.
2. **The vocabulary is entrance presets.** `pan-left` is a fixed preset with a duration, not an
   authored crop-to-crop move chosen per photo. There is no cross-dissolve between pages beyond the
   built-in page transition, and no compositing.
3. **Strategic risk.** AMP's role in Google's ecosystem has narrowed considerably; the
   `@ampproject/toolbox-optimizer` npm package last published 2024-06-14. **Opinion: not somewhere
   to bet a personal project's core experience.**

**But it is the best available proof that the vocabulary can be made declarative**, and its preset
list is a good checklist for what the bespoke engine's verbs should be.

## 17. Also checked, and ruled out

- **react-insta-stories 2.8.0** (MIT, 1.5 k stars, last pushed 2025-01-27, **zero dependencies**,
  peer `react >= 16.8.2`). A tap-through Instagram-story shell: progress bars, tap-to-advance,
  hold-to-pause, images and videos. **Not cinematic** — no Ken Burns, no transitions worth the name.
  **Worth reading its source anyway** as the smallest complete implementation of the story *shell*
  (progress, advance, pause, preload), which is real work the bespoke engine has to do.
- **Every "ken burns" package on npm**: `kenburns` 2.0.3 (2016), `kenburns-webgl` 2.0.2 (2016),
  `react-ken-burns-video` 1.2.5 (2017), `ken-burns-slideshow` 1.1.3 (2018), `ken-burns-carousel`
  0.2.5 (2018), `svelte-ken-burns-slideshow` (2023), `tailwindcss-ken-burns` 1.0.0 (2025 — a
  Tailwind plugin emitting CSS keyframes, i.e. six lines of CSS). **Nothing maintained. Nothing
  React. Nothing that handles video.**
- **`@getstoryteller/storyteller-sdk-javascript`** — a commercial hosted SaaS. Out on the hosted
  dependency alone.
- **`react-slideshow-image`, `react-photo-album`, `react-photo-view`** — gallery and lightbox
  components, not story players.

## 18. Video composition in the browser: is frame-accurate compositing possible on iPad?

**Yes, and it is the wrong tool for this job.** The pieces:

**WebCodecs.** Safari 16.4 "adds support for the video portion of Web Codecs API. This gives web
developers complete control over how media is processed by providing low-level access to the
individual frames of a video stream", on macOS Ventura/Monterey/Big Sur, **iPadOS 16 and iOS 16**
([WebKit Features in Safari 16.4](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)).
WebKit trunk confirms and refines:

| preference | status | Cocoa default | notes |
|---|---|---|---|
| `WebCodecsVideoEnabled` | mature | `true` (WebCore, `PLATFORM(COCOA)`) | **`disableInLockdownMode: true`** |
| `WebCodecsAudioEnabled` | stable | `true` | |
| `WebCodecsImageEnabled` | stable | `true` | `ImageDecoder` available |
| `WebCodecsHEVCEnabled` | mature | `true` (`PLATFORM(COCOA)`) | |
| `WebCodecsAV1Enabled` | preview | **`false`** on Cocoa | AV1 not decodable via WebCodecs on Apple |

(all from `UnifiedWebPreferences.yaml`)

**`requestVideoFrameCallback`.** `RequestVideoFrameCallbackEnabled` is `status: mature` and `true`
under `PLATFORM(COCOA) && HAVE(AVSAMPLEBUFFERVIDEOOUTPUT)` on all three frontends. **This is the
right primitive for syncing DOM animation to video playback** without going anywhere near WebCodecs
— you get a callback per presented frame, with presentation timestamps.

**Demuxers.** `mediabunny@1.55.3` is **MPL-2.0** (7 k stars, pushed the day of writing) and is what
Remotion's `@remotion/media` uses. `mp4box@2.4.1` is BSD-3-Clause (2.5 k stars). Mediabunny
tree-shakes well: **93,051 B gzipped** with `ALL_FORMATS`, **49,936 B gzipped** with `[MP4]` only
(measured). **Note MPL-2.0 is a file-level copyleft** — fine for use as a dependency, worth knowing
if it were ever forked.

**ffmpeg.wasm.** `@ffmpeg/ffmpeg@0.12.15`, MIT, but the repo was last pushed 2026-02-01 and
`@ffmpeg/core` is pinned at 0.12.10. The multi-threaded core "requires SharedArrayBuffer", which
requires cross-origin isolation (COOP/COEP)
([usage docs](https://ffmpegwasm.netlify.app/docs/getting-started/usage)). **That collides head-on
with this app's architecture:** `Cross-Origin-Embedder-Policy: require-corp` blocks no-cors
subresources, which is exactly how the sibling note established the NAS media should be loaded. Even
the single-threaded core is a WASM decode on the main thread with no GPU access, which Remotion's own
docs contrast against WebCodecs: "Unlike solutions which leverage WebAssembly, WebCodecs have full
access to GPU acceleration."

**Verdict for this section — opinion.** Frame-accurate compositing on iPad is *possible*
(WebCodecs + canvas/WebGL), and it buys precisely one thing this app cannot otherwise get: per-pixel
effects across a video boundary. It costs: CORS on the NAS, a Lockdown Mode dead end, ~50–95 KB of
demuxer, main-thread frame management, and all the typography problems of canvas. **`<video>`
playback plus `requestVideoFrameCallback` is the realistic path, and `<video>` composited by
CoreAnimation is what Apple itself ships.**

## 19. The pre-render escape hatch

Render the story to an MP4 ahead of time and play a video on the iPad. It deserves a serious hearing
because it is what Google Photos does (§2.2) and because it collapses the entire problem to "play a
file".

### 19.1 How it would be built

Two routes:

- **ffmpeg on the .NET indexer.** No new licence, no new service, no cloud, and the `Indexer` is
  already the place where "alle dure werk" happens. The Ken Burns move is `zoompan` or a
  `crop`+`scale` expression chain; cross-dissolves are `xfade`; titles are `drawtext` or a
  pre-composed PNG overlay.
- **Remotion server-side (`@remotion/renderer` or Lambda).** You author the story in React and get an
  MP4 out, with the full transition set available because the renderer *is* Chrome. **This is
  Remotion's actual strength and the thing all eight of its success stories do.** `@remotion/renderer`
  needs a Chrome Headless Shell on the rendering machine; Lambda needs an AWS account, an S3 bucket
  and a Lambda function with a Chromium layer, and for companies a Cloud Rendering Unit licence.
  **The exact system requirements of `@remotion/renderer` are [UNESTABLISHED]** — the docs page I
  fetched does not list them.

### 19.2 What it costs

| Capability | Live DOM renderer | Pre-rendered MP4 |
|---|---|---|
| Autoplay full-screen | yes | yes |
| Scrub | pointer → `transform` | `video.currentTime = t`; needs range requests |
| Skip a `Chapter` | jump the timeline, instant | seek; **lands on the nearest keyframe unless the encode forced one at every `Chapter` boundary** (`ffmpeg -force_key_frames`) |
| Deep-link to `Aarhus` | set the timeline position | seek to a timestamp stored in the catalogue |
| Service Worker offline cache | ordinary `cache.put()` of opaque responses | **range requests return `206`, and the sibling note established a Service Worker cannot cache a `206`** |
| Re-edit after indexing | free | re-encode the whole Memory |
| Storage on the NAS | none beyond derivatives | one MP4 per Memory, in addition to the media |
| Adapt to iPad orientation/aspect | free | one encode per aspect ratio |
| Interactive extras (tap a photo, favourite it) | free | impossible |
| **Sub-pixel-smooth Ken Burns** | free (CoreAnimation) | **not free** — see below |
| Visual ceiling | whatever you author in CSS | whatever ffmpeg/Chrome can render, which is higher |

### 19.3 The ffmpeg Ken Burns problem, from source

`vf_zoompan` computes the crop window as `w = in->width * (1.0 / zoom)` into an `int`, evaluates the
`x`/`y` expressions as doubles, then **truncates to `int` and masks off the chroma-subsampling bits**:

```c
x = *dx = av_clipd(*dx, 0, FFMAX(in->width - w, 0));
x &= ~((1 << s->desc->log2_chroma_w) - 1);
```
— [`libavfilter/vf_zoompan.c`](https://github.com/FFmpeg/FFmpeg/blob/master/libavfilter/vf_zoompan.c)

In yuv420p, `log2_chroma_w == 1`, so **the crop origin snaps to even pixels**. A slow pan therefore
advances in 2-px jumps rather than continuously. The filter's own documentation
([`doc/filters.texi`](https://github.com/FFmpeg/FFmpeg/blob/master/doc/filters.texi)) does not
mention this.

**Inference, not established:** the standard mitigation is to upscale before `zoompan` (`scale=iw*8:ih*8`)
so the 2-px snap becomes ¼-px at output, at the cost of a large intermediate. This is worth verifying
in the prototype rather than trusting.

### 19.4 Verdict on the escape hatch

**Opinion. It is not the v1 renderer, and it is worth building anyway — for a different job.** As a
renderer it forfeits interactivity, offline caching (the `206` problem), and orientation adaptability,
and it makes every editorial change a re-encode of a whole Memory. But:

1. **As the Lockdown Mode fallback** it is superb: a plain `<video>` is one of the few rich things
   that still works when WebGL and WebCodecs are off. The map lists "a non-WebGL entrance" as
   unspecified; **a pre-rendered story is a genuine answer for the story half of that problem.**
2. **As a "share this Memory" feature** — sending Oma an MP4 — it is the only possible
   implementation, and it is nearly free once the ffmpeg pipeline exists.
3. **As the control in prototype C** it answers a question nothing else can: *is the ceiling of a
   video renderer visibly higher than the ceiling of DOM/CSS on this hardware?* If the answer is no,
   the whole escape hatch closes cleanly and the note is settled.

## 20. Bundle cost, measured

All figures are esbuild 0.28.2, `--bundle --minify --format=esm`, `NODE_ENV=production`, then
`gzip -9` and Brotli. Entry points are the realistic miniatures described in §1.

| Entry point | minified | **gzip** | brotli | delta over React |
|---|---:|---:|---:|---:|
| **React 19.2.8 + ReactDOM (baseline)** | 193,338 | **60,225** | 51,856 | — |
| React + `@remotion/player` + `remotion` + `@remotion/transitions/fade` | 527,847 | **163,079** | 129,189 | **+102,854** |
| React + `@remotion/player` + `@remotion/media` (`<Video>`) | 970,020 | **282,111** | 226,001 | **+221,886** |
| React + `motion` 13.1.1 (`motion/react`) | 322,646 | **102,883** | 89,736 | **+42,658** |
| React + `@react-spring/web` 10.1.2 | 236,442 | **77,283** | 66,989 | **+17,058** |
| `gsap` 3.15.0 core (no React) | 70,782 | **27,713** | 25,119 | n/a |
| `gsap` + `Observer` + `CustomEase` + `SplitText` | 94,746 | **37,680** | — | n/a |
| `animejs` 4.5.0 (`createTimeline` + `animate` + eases) | 36,247 | **14,067** | 12,868 | n/a |
| `motion/mini` `animate` + `spring` (no React) | 7,884 | **3,128** | — | n/a |
| Web Animations API only (`element.animate`) | 163 | **152** | 116 | n/a |
| `remotion` core alone (no Player, no ReactDOM) | 186,028 | **58,860** | — | n/a |
| `mediabunny` 1.55.3, `ALL_FORMATS` + `VideoSampleSink` | 350,691 | **93,051** | 77,560 | n/a |
| `mediabunny` 1.55.3, `[MP4]` only | 180,739 | **49,936** | — | n/a |

Composition, from esbuild's metafile (bytes in the minified output):

- **Remotion Player entry:** `remotion` 238,187 · `react-dom` 180,679 · `@remotion/player` 60,692 ·
  `@remotion/transitions` 33,438 · `react` 8,123 · `scheduler` 3,713 · app 909. **Note that
  `remotion` core alone is 238 KB minified for a two-shot composition** — it is not meaningfully
  tree-shakeable, the same structural problem the globe note found in globe.gl.
- **Remotion + `@remotion/media`:** `mediabunny` 377,658 · `remotion` 238,296 · `react-dom` 180,728 ·
  `@remotion/media` 95,984 · `@remotion/player` 60,797.
- **Motion:** `react-dom` 180,174 · `motion-dom` 93,549 · `framer-motion` 32,770 · `motion-utils`
  1,948.
- **react-spring:** `react-dom` 180,114 · `@react-spring/core` 20,473 · `shared` 12,711 · `web`
  4,360 · `animated` 3,634 · `rafz` 1,791.

**Caveat, same as the globe note:** a Vite/Rollup production build may differ slightly. Mediabunny
demonstrably tree-shakes (93 KB → 50 KB by naming one format); `remotion` demonstrably does not.

**Context.** The globe note measured bespoke three.js at 138 KB gzipped and globe.gl at 540 KB. So a
bespoke globe + GSAP + React lands around **226 KB gzipped** for the whole app shell; a globe.gl +
Remotion Player app lands around **703 KB**. **Inference: over a LAN this is not a download-time
problem; it is a parse-and-execute problem on the iPad's main thread at cold start, which is exactly
what a PWA splash screen makes visible.**

## 21. What is genuinely left to author

The brief asks this explicitly. This list is the same whichever driver wins, and **it is not shorter
if you pick Remotion** — Remotion supplies items 0 and part of 5, and nothing else.

0. **A frame clock and a `<Sequence>` model.** *Remotion supplies this.* Bespoke: ~50 lines over
   `requestAnimationFrame`, or a GSAP timeline, or `document.timeline`.
1. **A chronology-to-timeline compiler.** Take a `Chapter`'s ordered `Media Item`s and produce a
   timeline: shot durations (longer for the good ones, shorter for the filler), which pairs get a cut
   and which get a dissolve, where `Chapter` titles land, where videos sit. **This is the heart of
   the product and it exists in no library.** Almost certainly belongs partly in the `Indexer`
   (it needs to know which photos are good) and partly at runtime.
2. **A Ken Burns planner.** Per photo: a start crop and an end crop. Random is bad; centred is
   boring. Google's answer (§2.2) is optimisation against a saliency and face mask, computed ahead of
   time. **This is the highest-leverage thing the `Indexer` could add**, and it is a catalogue field:
   two rects per `Media Item`.
3. **A preload and eviction window.** Load N+1 and N+2 with `img.decode()` and `fetchPriority`;
   trigger `<video>` loads on an explicit keyframe (§2.3, §4.4); evict behind. Required by §4.5,
   not optional.
4. **A typography layer.** `Chapter` titles, dates, place names — entrance, hold, exit; real kerning,
   variable-font weight, and a timing that reads as editorial rather than as a lower-third.
   `SplitText` (GSAP) or `animejs/text` does the splitting; the timing is yours.
5. **Transitions.** *Remotion supplies eight Safari-safe ones.* Bespoke: cross-dissolve, cut, and a
   push are three CSS animations. Anything beyond that is authored either way.
6. **Gestures and controls.** Tap to pause, swipe to skip a shot or a `Chapter`, the controls that
   "verschijnen bij interactie en daarna weer verdwijnen". `Observer` (GSAP) or `@use-gesture/react`;
   the choreography is yours. Note the globe note's open question about `touch-action: none` versus
   iPadOS overscroll applies here too.
7. **Degradation.** A rejected `play()` (Low Power Mode, thermal), a slow NAS, a decode that did not
   finish, Lockdown Mode. Every one of these needs a defined visual answer, and none of them is
   supplied by anything.

**Opinion: items 1, 2 and 4 are where "does it look like Apple made it" is decided, and no candidate
in this note helps with any of them.** That is the honest answer to Marco's worry: the specialist
skill this needs is not "knowing an animation library", it is editorial timing — and the library
choice barely touches it.

## 22. Ranked shortlist, and the prototype directions

**Real candidates, in order.**

1. **Bespoke DOM/CSS story engine, driven by GSAP.** Highest ceiling; every curve, duration and cut
   is yours; real typography; `<video>` composited by CoreAnimation exactly as apple.com does it; no
   CORS requirement on the NAS; degrades to something in Lockdown Mode. Measured cost **28–38 KB
   gzipped** on top of React's 60 KB. **What it cannot do:** per-pixel warps across a shot boundary
   (no GLSL without moving to canvas/WebGL and taking CORS with it). **What it costs:** all seven
   items in §21, and the risk that the first two attempts look like a slideshow. That risk is the
   reason to prototype rather than decide.
2. **Bespoke DOM/CSS driven by anime.js v4.** Same as 1, MIT, **14 KB gzipped**, with `animejs/text`,
   `animejs/layout` (FLIP) and an `adapters/three` that could drive globe and story from one
   timeline. Behind GSAP on authored-easing tooling (`CustomEase`) and on production evidence.
3. **Remotion `<Player>`.** The fastest route to a real timeline with a `<Sequence>` model, a frame
   clock, authorable easing and authorable transition presentations, and a straight path to
   server-side MP4 rendering later. **What it cannot be made to do:** run its eleven shader
   transitions on iPadOS Safari (`HTMLInCanvasEnabled` is `unstable`/`false` in WebKit); shed the
   238 KB minified `remotion` core; go fullscreen on iOS. **Free for Marco as an individual; not
   MIT.** Use it as the control.
4. **Motion (Framer Motion).** Best exit-animation and layout-animation ergonomics, hybrid WAAPI
   engine, MIT, +43 KB. **Weaker on the thing this app needs most: a seekable, labelled timeline.**
   Strong candidate for the *controls and shell*, weaker for the story spine.
5. **Pre-rendered MP4 from ffmpeg on the .NET indexer.** Not the v1 renderer (§19.4) but the right
   answer for Lockdown Mode fallback and for sharing a Memory, and cheap to build once the `Indexer`
   exists.

**Not real for this app:** Motion Canvas (dormant since Feb 2025; an authoring tool, not a runtime);
Theatre.js (public repo dormant since Aug 2024, 1.0 never shipped, studio is AGPL-3.0-only); Rive
(needs a human in an editor per Memory; $9/seat/month to ship); Lottie/dotLottie (After Effects
exports, no video); AMP Story (a page format with a preset vocabulary, cannot be a component);
react-spring as the timeline (spring-first is the wrong default for cut-to-length cinema — keep it
for the controls); ffmpeg.wasm (SharedArrayBuffer/COEP collides with the NAS media architecture);
every "ken burns" package on npm (abandoned 2016–2018).

### The 2–3 prototype directions to put in front of Marco

Short and frequent, per the map's Notes. **All three must render the same `Chapter` of the same
Memory**, or Marco is comparing three different edits rather than three technologies.

**A. Bespoke DOM/CSS, GSAP-driven.** One `Chapter`, ~15 photos and 2 short videos. A GSAP timeline
with authored `CustomEase` curves; Ken Burns as `transform` on `<img>` (and try `object-view-box`
alongside); cross-dissolves as opacity; one `Chapter` title with `SplitText`; muted `playsinline`
videos with `preload="none"` and an explicit load keyframe; an `img.decode()` preload window of
±2 shots. **Measured cost: ~98 KB gzipped total with React.** **Question for Marco: does the motion
feel authored, or does it feel like a slideshow with a zoom on it?**

**B. Remotion `<Player>` as the control.** Same `Chapter`, same media, same shot durations. A
`<TransitionSeries>` with `linearTiming({durationInFrames, easing})` carrying the *same* easing
function as A, restricted to Safari-safe presentations (`fade`, `push-cut`, `wipe`). Author at
1920×1080 and let the Player scale. **Question for Marco: does a framework that was built for this
get further in an afternoon than the bespoke one did, and does the Player feel smooth on the iPad?**

**C. Pre-rendered MP4 from the indexer.** Same `Chapter`, same shot list, produced with ffmpeg
(`zoompan` over an upscaled intermediate, `xfade` dissolves, `drawtext` or PNG overlay title,
`-force_key_frames` at every `Chapter` boundary), played in a plain `<video>` with `playsinline`.
**Question for Marco: is the ceiling of a rendered video visibly higher than A and B on this screen —
and does losing scrubbing, deep-linking and offline caching matter when you actually hold it?**

**Run A and C first, in either order.** They bracket the answer: A is the cheapest thing with the
highest interactivity, C is the most expensive thing with the highest theoretical image quality. B is
only worth building if A stalls on choreography, because B's principal advantage — the shader
transitions — does not exist on the target device.

**Whichever runs first must also carry the device checks that unblock everything else**, all of them
two-liners:

- how many muted `<video>` elements will actually decode at once before playback degrades (§4.2);
- whether `preload="none"` + a JS-triggered `load()` beats `preload="auto"` on cold start (§4.4);
- whether `play()` is rejected with Low Power Mode on (§4.3);
- whether a CSS `filter` on a playing `<video>` drops it off the accelerated path (§3.1);
- an FPS counter, and the peak `performance.memory`-equivalent proxy of choice, since the tab-kill
  threshold is unknowable by reading (§4.5).

## What I could not establish

In rough order of how much it matters.

1. **Real-device frame rate and smoothness on the target iPad**, for any candidate. Unestablishable
   by reading; the prototype must measure it. No number in this note is a frame rate.
2. **How many muted `<video>` elements can decode simultaneously on the iPad.** WebKit's
   `ConcurrentPlaybackNotPermitted` settles the *audio* case exactly (§4.2), but the hardware decoder
   ceiling is a VideoToolbox/OS resource limit with no published number and no WebKit constant. Apple
   ships fifteen on one page, which is evidence but not a limit.
3. **The memory threshold at which iPadOS kills the tab**, for decoded photos specifically. Same OS
   jetsam behaviour the globe note could not pin down.
4. **What Safari on iPadOS actually sets for the `status: embedder` media preferences** —
   `RequiresUserGestureToLoadVideo`, `AllowsInlineMediaPlayback`,
   `InlineMediaPlaybackRequiresPlaysInlineAttribute`, `FullScreenEnabled`. WebKit source gives the
   WKWebView defaults and Apple's iPhone/iPad design intent, not Safari's configuration.
5. **How Apple Photos renders a Memory movie**, on device or at icloud.com. Apple publishes the
   curation research in detail and nothing about the compositor. The iCloud web player is behind
   authentication and I could not inspect it — **but Marco can, and should**.
6. **Whether a CSS `filter`, `mask-image` or `mix-blend-mode` on a playing `<video>` forces
   `PaintBehavior::FlattenCompositingLayers` on iPadOS**, dropping it to per-frame software painting.
   The mechanism is established from `RenderVideo.cpp`; which properties trigger it is not.
7. **Whether a CSS-scaled `<img>` is re-rasterised at the animated scale on iPadOS** or a fixed
   raster is stretched — i.e. whether a slow Ken Burns zoom stays crisp. This decides how large the
   `Indexer`'s derivatives need to be.
8. **Whether cross-dissolving an HDR gain-map photo against an SDR photo pops** on an iPad display
   with adaptive headroom.
9. **The exact system requirements of `@remotion/renderer`** (Chrome Headless Shell version, ffmpeg,
   Node, supported OSes). Not listed on the docs page I fetched.
10. **Which Safari version shipped same-document versus cross-document View Transitions.** The CSS
    property is unconditionally present in WebKit trunk; the shipping version I did not pin down.
11. **Whether Rive's free tier legally forbids shipping a `.riv`**, as opposed to the pricing page
    merely describing the paid tier as the one for shipping.
12. **Whether apple.com's inline-media controller is bespoke or built on a public library.** No
    `gsap`/`ScrollTrigger` strings in the AirPods Pro markup, which suggests bespoke — but the
    controller lives in a separate bundle I did not read.

## Sources

Primary, in the order first used.

**Package and repository metadata**

- [npm registry API](https://registry.npmjs.org/) — versions, publish dates, licences, dependencies,
  and the package searches in §17, for every package named in the preamble
- [GitHub REST API](https://docs.github.com/rest) — `archived`, `pushed_at`, `stargazers_count`,
  releases and commit dates for motion-canvas/motion-canvas, theatre-js/theatre,
  remotion-dev/remotion, greensock/GSAP, juliangarnier/anime, rive-app/rive-wasm, airbnb/lottie-web,
  LottieFiles/dotlottie-web, motiondivision/motion, pmndrs/react-spring, Vanilagy/mediabunny,
  gpac/mp4box.js, ffmpegwasm/ffmpeg.wasm, ampproject/amphtml, mohitk05/react-insta-stories
- Installed package contents (`dist/`, `*.d.ts`, `package.json#exports`) read directly from
  `node_modules` at the versions in the preamble — the source for every claim about
  `@remotion/transitions`, `@remotion/player`, `remotion`, `motion-dom`, `gsap/dist`, `animejs`

**Remotion**

- [Remotion LICENSE.md](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md)
- [`<Player>` docs](https://www.remotion.dev/docs/player/player), [@remotion/player](https://www.remotion.dev/docs/player),
  [Avoiding flickering in `<Player>`](https://www.remotion.dev/docs/troubleshooting/player-flicker)
- [`@remotion/media` `<Video>`](https://www.remotion.dev/docs/media/video), [@remotion/media](https://www.remotion.dev/docs/media)
- [@remotion/webcodecs](https://www.remotion.dev/docs/webcodecs), [@remotion/renderer](https://www.remotion.dev/docs/renderer),
  [Remotion Lambda](https://www.remotion.dev/docs/lambda)
- [Remotion success stories](https://www.remotion.dev/success-stories)

**WebKit / iPadOS**

- [`UnifiedWebPreferences.yaml`](https://github.com/WebKit/WebKit/blob/main/Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml) —
  `HTMLInCanvasEnabled`, `WebCodecs*`, `RequestVideoFrameCallbackEnabled`, `RequiresUserGestureTo*`,
  `AllowsInlineMediaPlayback`, `InlineMediaPlaybackRequiresPlaysInlineAttribute`, `FullScreenEnabled`,
  `CSSObjectViewBoxEnabled`, `ThreadedScrollDrivenAnimationsEnabled`, `WebAnimationsCustom*`,
  `OffscreenCanvas*`, `CanvasUsesAcceleratedDrawing`, `SupportHDR*`, `HDRAcceleratedApplyGainMapEnabled`
- [`MediaSessionManagerIOS.mm`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/audio/ios/MediaSessionManagerIOS.mm) —
  `ConcurrentPlaybackNotPermitted`, the 1 GB `ramSize()` threshold
- [`MediaSessionManagerInterface.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/audio/MediaSessionManagerInterface.cpp) —
  `enforceConcurrentPlaybackRestriction`
- [`PlatformMediaSession.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/audio/PlatformMediaSession.cpp) —
  `canPlayConcurrently`, `isPlayingAudio`
- [`HTMLMediaElement.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/HTMLMediaElement.cpp) —
  `mediaType()`, `presentationType()`, the behaviour-restriction constructor block,
  `removeBehaviorRestrictionsAfterFirstUserGesture`, `fastSeek`
- [`MediaElementSession.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/MediaElementSession.cpp) —
  `dataLoadingPermitted`, `playbackStateChangePermitted`, `autoplayPermitted`
- [`WebPreferencesDefaultValues.mm`](https://github.com/WebKit/WebKit/blob/main/Source/WebKitLegacy/mac/WebView/WebPreferencesDefaultValues.mm) —
  `deviceClassIsSmallScreen()` and the iPhone/iPad split
- [`WebGLRenderingContextBase.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/canvas/WebGLRenderingContextBase.cpp) —
  `texImageSource(… HTMLVideoElement)`, `copyTextureFromVideoFrame`, `validateHTMLVideoElement`
- [`RenderVideo.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/rendering/RenderVideo.cpp) —
  `paintReplaced`, `supportsAcceleratedRendering`, `FlattenCompositingLayers`
- [`UTIRegistry.mm`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/graphics/cg/UTIRegistry.mm) —
  `defaultSupportedImageTypes`, `lockdownSupportedImageTypes`
- [`PlatformHave.h`](https://github.com/WebKit/WebKit/blob/main/Source/WTF/wtf/PlatformHave.h) —
  `HAVE_HEIC`, `HAVE_AVIF`, `HAVE_JPEGXL`
- [`CSSProperties.json`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/css/CSSProperties.json) —
  `animation-timeline`, `scroll-timeline`, `view-timeline`, `timeline-scope`, `animation-range`,
  `view-transition-name`, `object-view-box`
- [`HTMLImageElement.idl`](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/html/HTMLImageElement.idl) —
  `decode()`, `fetchPriority`, `loading`
- [New `<video>` Policies for iOS](https://webkit.org/blog/6784/new-video-policies-for-ios/) — first-party autoplay rules
- [WebKit Features in Safari 16.4](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/) — WebCodecs on iOS/iPadOS 16
- [WebKit Features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) — scroll-driven animations, HDR images
- [A guide to Scroll-driven Animations with just CSS](https://webkit.org/blog/17101/a-guide-to-scroll-driven-animations-with-just-css/)

**Reference products**

- [apple.com/airpods-pro](https://www.apple.com/airpods-pro/) — fetched and counted, 2026-08-26
- [Apple ML Research: A Multi-Task Neural Architecture for On-Device Scene Analysis](https://machinelearning.apple.com/research/on-device-scene-analysis)
- [Apple ML Research: Learning Iconic Scenes with Differential Privacy](https://machinelearning.apple.com/research/scenes-differential-privacy)
- [Apple ML Research: Recognizing People in Photos Through Private On-Device Machine Learning](https://machinelearning.apple.com/research/recognizing-people-photos)
- [Apple Support: View your photos and videos on iCloud.com](https://support.apple.com/guide/icloud/view-your-photos-and-videos-mm73262d11fe/icloud)
- [Google Research: The Technology Behind Cinematic Photos](https://research.google/blog/the-technology-behind-cinematic-photos/)
- [Google Photos Help: Find & manage your featured memories (Computer)](https://support.google.com/photos/answer/9454489?hl=en&co=GENIE.Platform%3DDesktop)

**Libraries**

- [GSAP licensing](https://gsap.com/licensing/) and [GSAP standard license](https://gsap.com/standard-license)
- [Motion+](https://motion.dev/plus)
- [Theatre.js README](https://github.com/theatre-js/theatre#readme) — the "temporarily moved development to a private repo" notice
- [Rive pricing](https://rive.app/pricing)
- [amp-story component documentation](https://amp.dev/documentation/components/amp-story/?format=stories)
- [Mediabunny introduction](https://mediabunny.dev/guide/introduction)
- [ffmpeg.wasm usage docs](https://ffmpegwasm.netlify.app/docs/getting-started/usage) — SharedArrayBuffer requirement

**FFmpeg**

- [`libavfilter/vf_zoompan.c`](https://github.com/FFmpeg/FFmpeg/blob/master/libavfilter/vf_zoompan.c) — integer crop and chroma-grid masking
- [`doc/filters.texi`](https://github.com/FFmpeg/FFmpeg/blob/master/doc/filters.texi) — `zoompan` options and expression constants

**Specs**

- [css-images-5: `object-view-box`](https://drafts.csswg.org/css-images-5/#the-object-view-box)
- [scroll-animations-1](https://drafts.csswg.org/scroll-animations-1/)
- [css-view-transitions](https://drafts.csswg.org/css-view-transitions/)

**Sibling notes in this repo**

- [`3d-globe-libraries.md`](3d-globe-libraries.md) — bundle methodology, Lockdown Mode, WebGL context
  cap and memory accounting, `touch-action`
- [`local-network-access-ipados.md`](local-network-access-ipados.md) — `<img>`/`<video>` need no CORS,
  a Service Worker cannot cache a `206`, and what DSM can be made to send

Secondary, used only as leads and not relied upon for any claim: web search result summaries used to
locate the first-party Apple, Google and WebKit pages listed above.
