# What is actually in the library

Findings for [issue #18](https://github.com/marcovandehaar/rememberwhen/issues/18). Everything below was
measured on the real library on `\\vandehaarnas\Fotos`, not sampled or estimated.

Until now every assumption about the `Indexer` rested on two folders, Zillertal 2024 and Allgäu 2025, which
the map itself called *representative but not exhaustive*. Marco picked thirteen folders spanning 2010 to
2025 to cover the real spread. **2926 files, 21.4 GB.** Of those, 7 are not media (6 `Thumbs.db`, one
`pano.txt`), leaving **2754 photos and 165 videos**.

## The seven findings that matter

### 1. GPS is a property of the camera, and the camera that shot half the library has none

| Camera | photos | with GPS |
| --- | --- | --- |
| samsung SM-A536B | 1551 | **0** |
| Apple iPhone 14 | 487 | 485 |
| Panasonic DMC-TZ20 | 408 | 0 |
| SONY DSC-W70 | 112 | 0 |
| Apple iPhone 6s | 95 | 95 |
| Apple iPhone 5 | 69 | 67 |
| NIKON D50 | 3 | 0 |
| no camera in EXIF | 29 | 0 |

**647 of 2754 photos carry GPS — 23%.** And the split is not gradual: every Apple device has it on
essentially every frame, and every other device has it on none. The Samsung Galaxy A53 alone accounts for
**53% of all photos in the survey** and geotags nothing.

This is the single most consequential number here, because the open question about `Chapter` boundaries
concluded that a time heuristic alone cannot work and *"needs location (GPS EXIF) as well, or the operator"*.
Location is available on roughly a quarter of the library, concentrated in the iPhone folders. **A
location-based `Chapter` heuristic is not a general solution; it is a solution for some holidays and not
others.** Whatever the `Indexer` does must degrade to something sensible when there is no location at all.

### 2. A folder that seems to span months is usually a camera with the wrong clock

Every folder examined closely has a dominant contiguous block plus a handful of outliers. Schotland 2010
looks like the worst case — a folder "spanning 187 days" — until you line the cameras up against both
timestamps:

| | photos | EXIF capture date | file mtime |
| --- | --- | --- | --- |
| SONY DSC-W70 | 112 | 3–5 August 2010 | matches the EXIF to the minute |
| NIKON D50 | 3 | **30 January 2010** | **6 August 2010, 23:30 — all three identical** |
| no EXIF at all (the panoramas) | 5 | — | 7 August 2010 |

The three Nikon files were copied off a card in one go on 6 August, three days into a trip that ran 3–5
August. They are not photos from another occasion; **they are photos from this trip taken on a camera whose
clock was wrong.** For those three files the mtime is closer to the truth than the EXIF, which is the exact
reverse of the rule that holds everywhere else in this library.

Disneyland Paris 2025 has the same shape (1 photo on 10 March, then 22/31/60 on 14–16 March), and Canada 2013
runs 24 January to 1 February before jumping four days to four final files.

**So the `Indexer` cannot simply take a min/max over a folder** — that is wrong in at least three of the
thirteen. But nor should it silently discard the outliers, because they are usually real photos of the trip
with a broken timestamp. What it can do is *notice*: a trip that appears to last 187 days is an anomaly, and
the shape of the anomaly (one camera's whole output sitting far outside the cluster, with mtimes inside it)
is machine-detectable and points straight at the cause.

### 3. Falling back to mtime does not merely lose precision — it invents a date

The five Scottish panoramas carry no EXIF whatsoever: no camera, no capture time. Their mtime says
**7 August 2010, two days after the trip ended** — because that is when they were stitched, not when they
were shot. A fallback to mtime would file them as a separate `Chapter` after the holiday.

The map already said mtime "is only the copy date and useless for this". This is what that costs in practice.

Put this next to finding 2 and the honest conclusion is uncomfortable: **neither timestamp can be trusted on
its own.** EXIF is right for 99% of the library and badly wrong for one camera; mtime is wrong for the
panoramas and right for that same camera. What separates the two cases is not which field you read but
whether the value **agrees with the rest of the folder** — and that is something the `Indexer` can check. A
`Media Item` whose capture time falls far outside its neighbours is a flag, not a fact, whichever field it
came from.

### 4. "Original" is not a uniform concept — some folders hold exports

Median long edge per folder, and it is not monotonic over time:

| folder | median long edge | megapixels | avg photo |
| --- | --- | --- | --- |
| Schotland 2010 | 3072 px | 6.8 MP | 2.7 MB |
| Canada 2013 | 4320 px | 13.3 MP | 5.3 MB |
| Dubrovnik 2015 | 4320 px | 13.3 MP | 4.4 MB |
| Zeeland 2016 | 3264 px | 7.6 MP | 1.7 MB |
| Dublin 2019 | 4032 px | 11.6 MP | 2.3 MB |
| 2023 zomervakantie | 4624 px | 15.3 MP | 5.4 MB |
| 2024 Zillertal (HEIC) | 4032 px | 11.6 MP | 2.0 MB |
| 2024 wintersport | 4624 px | 15.3 MP | 4.2 MB |
| 2024 zomervakantie | 4624 px | 15.3 MP | 5.2 MB |
| **2025 Disneyland** | **2048 px** | **3.0 MP** | **0.9 MB** |
| **2025 Pinksterweekend** | **2048 px** | 3.0 MP | 1.0 MB |
| **2025 Fantasialand** | **2048 px** | 3.0 MP | 1.1 MB |
| **2025 Allgäu** | **2048 px** | 3.0 MP | 1.2 MB |

All four 2025 folders sit at exactly 2048 px — Disneyland's minimum *and* maximum are both 2048 — so those
are **exports, not camera originals**, even though the EXIF still names the iPhone 14. The library therefore
contains two populations: full-resolution originals up to 15.3 MP, and 3.0 MP exports.

Two consequences. First, a resolution ladder cannot assume it is always downscaling; for the 2025 material a
1920 px derivative is barely smaller than the input. Second, and worth flagging: **Allgäu 2025 was one of the
two folders the derivative measurement was taken on**, and it is an exports folder. The ~415 KB figure for
1920 px at quality 82 was measured partly on already-downscaled input.

### 5. Video is 5.7% of the files and 48% of the bytes

| | count | total | average | resolution | capture time readable |
| --- | --- | --- | --- | --- | --- |
| `.mp4` | 134 | 9.16 GB | 70.0 MB | 1920x1080 (132 of 134) | 134/134 |
| `.mov` | 20 | 0.53 GB | 26.9 MB | 1920x1080 | 20/20 |
| `.mts` | 9 | 0.48 GB | 54.4 MB | 1920x1080 | **0/9** |
| `.mpg` | 2 | 0.03 GB | 13.8 MB | 640x480 | **0/2** |

Video is uniformly 1080p — no 4K anywhere in this survey, which is a relief for the derivatives question.
But it is nearly half the bytes, and the average clip is 70 MB where the media spike measured on a 20 MB one.

`.mts` (AVCHD, from a camcorder, Canada 2013) and `.mpg` (Schotland 2010) are two formats nobody had
considered, and they are exactly the two where **Windows Shell returns no `Media created`**. Eleven files, so
small in count — but they are the oldest material, and the `Indexer` has to decide whether to support the
camcorder era at all or to convert it once by hand.

### 6. Capture time is readable for 99% of the media, and the 1% is a known set

**28 of 2919 media files have no capture time in their metadata (1.0%).** They are not random:

- **9 `.mts` and 2 `.mpg`** — camcorder video, see above.
- **9 stitched panoramas** (`pano*.jpg` in Schotland and Canada) — no EXIF at all.
- **6 resized or shared copies** — 1500x2000 and 960x525 and 900x1600 files with the EXIF stripped, including
  one `FB_IMG_1723051632352.jpg` that came out of Facebook.
- **2 `.png`.**

For everything else the technique the map recorded still holds: EXIF `DateTaken` for photos, Shell property
**215** (`Media created`) for `.mov` and `.mp4`. Note that this survey read photos through **WIC**
(`System.Windows.Media.Imaging`) rather than the Shell, because the Shell property set on this machine
**exposes no GPS fields at all** — there is no latitude or longitude among its 340 properties. WIC reads
HEIC, EXIF and GPS in one pass, so it is the better route for photos regardless.

### 7. What is *not* there is as useful as what is

- **No RAW.** Not one file, across fifteen years and four camera brands.
- **HEIC exists in exactly one folder** (Zillertal 2024, 99 files). It is real and must be supported, but it
  is not the common case — 90% of the photos are `.jpg` or `.jpeg`.
- **Screenshots and social images do appear**, but barely: three `Screenshot_*_Gallery.jpg` and one
  `FB_IMG_*`. Enough to prove the category exists and needs a rule; not enough to build around.
- **No live photos** surfaced as separate files, and no sidecar files of any kind.
- **Panoramas are real and extreme.** Eighteen files exceed a 2:1 aspect ratio, the widest being
  `pano_dubrovnik_1.jpg` at **14745x2734 — 5.4:1 and 40 megapixels.** A formulaic Ken Burns crop on that,
  in a portrait iPad viewport, is a different problem from a crop on a 4:3 frame.

## What the `Indexer` must handle

Input formats, in order of how much of the library they cover:

| | share | note |
| --- | --- | --- |
| `.jpg` / `.jpeg` | 2653 photos, 96% | the baseline |
| `.heic` | 99 photos | decodes natively through WIC; no ImageMagick needed |
| `.mp4` / `.mov` | 154 videos, 93% of video | all 1080p, capture time readable |
| `.mts` / `.mpg` | 11 videos | no capture time; decide whether to support at all |
| `.png` | 2 | screenshots; no capture time |
| `Thumbs.db`, `.txt` | 7 | exclude, along with `@eaDir` |

## What this feeds

Three decisions were waiting on this survey, and each now has a sharper question:

- **How the `Indexer` proposes `Chapter` boundaries.** Location is available for 23% of photos and is
  all-or-nothing per device. Folders contain strays that must be rejected before any boundary logic runs.
  Files without capture time must not be placed by mtime.
- **Media derivatives.** Video is half the bytes and averages 70 MB per clip, all 1080p. The photo input is
  bimodal — 15 MP originals and 3 MP exports — so the ladder has to handle both without upscaling. RAW is not
  a case that needs solving.
- **The catalogue contract.** It must carry a capture time that can be absent, an aspect ratio that can reach
  5.4:1, and a location that is usually missing. None of those are edge cases the schema can defer.

## Method, and what it does not cover

The scan is `spike/library-scan.ps1`; it walks the folders, reads photos through WIC and videos through the
Shell property set, and writes one row per file to CSV. It skips `@eaDir`. Running it over all thirteen
folders took **223 seconds** over SMB.

Not covered, deliberately:

- **The rest of the library.** These thirteen folders are Marco's pick of the spread, not the whole of
  `\\vandehaarnas\Fotos`. Nothing here says how many holidays there are in total.
- **Duplicates.** Not looked for. Two folders cover the same 2024 ski trip (`1. wintersport Zillertal` and
  `wintersport '24`) from what appear to be two different phones, and whether that pattern repeats elsewhere
  is unknown.
- **Video codecs.** Only container, resolution and duration were read. Whether every `.mp4` is H.264 is
  unverified, and it matters for whether the browser can play the original.
- **Orientation.** EXIF orientation was not recorded. WIC applies it on decode, so the `Indexer` is expected
  to be fine, but the survey does not prove it.
- **Faces, subjects, saliency.** Out of scope; that is a later ticket by design.
