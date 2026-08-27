# rememberwhen

An iPad-first cinematic memory experience built on top of a pre-composed media index. It is not a photo management app: the library is curated ahead of time on a desktop machine, and the runtime only plays it back.

## Language

**Memory**:
One trip, as a person would recall it: `Denemarken 2024`, `Zillertal 2026`. The top-level unit the app presents. Two visits to the same place are two separate Memories.
_Avoid_: Vakantie, Trip, Holiday, Album

**Chapter**:
A part of a Memory: one continuous stay in one place. `Legoland Billund` spanning two days is a single Chapter; a day split between two towns is two.
_Avoid_: Day, Dag, Etappe, Leg, Scene, Segment

**Destination**:
The chosen headline location of a Memory, and the label under which it appears on the globe. May name a town, region, park, or country (`Zillertal`, `Disneyland Parijs`, `Italië`, `Zuid-Duitsland`). Its name is chosen during indexing; its coordinate is derived from the Memory's Chapters.
_Avoid_: Main location, Hoofdlocatie, Place, Region

**Media Item**:
One photo or one short video belonging to a Chapter. Videos are ordinary members of the sequence, not a special case.
_Avoid_: Asset, Photo, File

**Story**:
The playable form of a Memory: its Chapters and Media Items composed into one continuous sequence, moved through at the viewer's own pace. What the app presents once a Destination is chosen.
_Avoid_: Slideshow, Presentation, Playback, Movie, Highlight reel

**Source Folder**:
A folder on the NAS pointed at during indexing. Its subfolders are included. One Memory may draw on several.
_Avoid_: Input directory, Import path

**Indexer**:
The .NET desktop program that reads Source Folders, proposes the structure of a Memory, takes the operator's corrections, and publishes the result. All expensive work happens here, never at runtime.
_Avoid_: Importer, Scanner, Ingester

**Media Source**:
The seam between the app and wherever Media Items physically live. Keeps the globe, search, and story playback ignorant of NAS paths.
_Avoid_: Provider, Backend, Storage adapter
