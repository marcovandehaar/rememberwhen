# rememberwhen

An iPad-first cinematic memory experience built on top of a pre-composed media index. It is not a photo management app: the library is curated ahead of time on a desktop machine, and the runtime only plays it back.

## Language

**Memory**:
Something that happened, as a person would recall it: `Denemarken 2024`, `Zillertal 2026`, `Onze nieuwe hond`. The top-level unit the app presents. Two visits to the same place are two separate Memories. It draws its Media Items from one or more Source Folders. Its date defaults to the date of its earliest Media Item and the operator may override it; the date's year is the year the Memory belongs to, so a Memory spanning New Year belongs to the year it began. Its cover image defaults to its earliest Media Item; the operator may override the choice during indexing.
_Avoid_: Vakantie, Holiday, Album, Event

**Trip**:
A Memory that has a Destination. Not a separate kind: a Memory becomes a Trip by being given a Destination, and stops being one by losing it. Only Trips appear on the globe. A Trip's own name is distinct from its Destination's name (`Zillertal 2026` the Trip, `Zillertal` the headline place) and never collapses into it.
_Avoid_: Vakantie, Holiday, Journey

**Chapter**:
A part of a Memory: one continuous stay in one place. `Legoland Billund` spanning two days is a single Chapter; a day split between two towns is two. The place is a property of the Chapter, not of its Media Items: a Chapter has a location as soon as any of its Media Items carries GPS, and a Media Item never carries one of its own.
_Avoid_: Day, Dag, Etappe, Leg, Scene, Segment

**Destination**:
The chosen headline location of a Trip, and the label under which it appears on the globe. May name a town, region, park, or country (`Zillertal`, `Disneyland Parijs`, `Italië`, `Zuid-Duitsland`). Its name is chosen during indexing, and its coordinate follows from that name via the Gazetteer. Where Media Items carry GPS, that GPS proposes the name and afterwards checks it; it does not place the pin.
_Avoid_: Main location, Hoofdlocatie, Place, Region

**Media Item**:
One photo or one short video belonging to a Chapter. Videos are ordinary members of the sequence, not a special case.
_Avoid_: Asset, Photo, File

**Story**:
The playable form of a Memory: its Chapters and Media Items composed into one continuous sequence, moved through at the viewer's own pace. What the app presents once a Memory is chosen, from the globe or from the timeline.
_Avoid_: Slideshow, Presentation, Playback, Movie, Highlight reel

**Source Folder**:
A folder on the NAS pointed at during indexing. Its subfolders are included. One Memory may draw on several, pooled into one sequence as if they were one folder; one Source Folder may also feed several Memories, each taking all of it.
_Avoid_: Input directory, Import path

**Indexer**:
The .NET desktop program that reads Source Folders, proposes the structure of a Memory, takes the operator's corrections, and publishes the result. All expensive work happens here, never at runtime.
_Avoid_: Importer, Scanner, Ingester

**Media Source**:
The seam between the app and wherever Media Items physically live. Keeps the globe, search, and story playback ignorant of NAS paths.
_Avoid_: Provider, Backend, Storage adapter

**Gazetteer**:
The list of place names and their coordinates that a Destination name is resolved against. Seeded by hand at the granularity of the places actually visited, and it grows: every coordinate established another way is written back into it under the name it was given.
_Avoid_: Geocoder, Lookup table, Places database

**Curation**:
The operator's standing decisions about one Memory, kept in the Curation-folder — a location the operator controls independently of the Source Folders' own (often read-only) permissions — so they outlive the published catalogue and any re-run of the Indexer. Holds how each reported anomaly was dealt with, and which source files were left out, chosen as cover, or rotated; these are tied to the source file, not to its place in the sequence, so adding a Source Folder never loses them.
_Avoid_: Sidecar, Overrides, Metadata, Corrections
