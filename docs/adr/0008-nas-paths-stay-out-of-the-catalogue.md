# NAS paths stay out of the catalogue; the Indexer keeps its own map to source files

V2 makes the operator's edits to a `Memory` survive a reindex: removed photos, the chosen cover and rotations are
kept in its `Curation` and reapplied on every rebuild ([issue #60](https://github.com/marcovandehaar/rememberwhen/issues/60)).
They have to be tied to the **source file**, because a `Media Item`'s id encodes its position in the sorted sequence
(`…-c1-0003-img-1234`), and adding a `Source Folder` shifts every position after it. The review screen, though, only
knows the `Media Item` id. So something has to lead from that id back to a file on the NAS.

That link is written by each build into a private file in the Curation-folder, `<memoryId>.items.json` (Media Item
id → source path). The edit endpoints look the path up there. The published `catalog.json` never contains a NAS
path.

## Considered options

- **The source path as a field on every Media Item in `catalog.json`.** The obvious choice, and the cheapest: no
  second file, nothing to keep in sync. Rejected for two reasons. It breaks the `Media Source` seam, whose whole
  point is that the app stays ignorant of NAS paths. And it publishes the layout of a private photo archive into
  a file served to every device, in a project whose repo is public.

## Consequences

- **The map exists only after a build.** A `Memory` that was migrated to V2 but not yet reindexed has none. An
  edit on it patches `catalog.json` only, as V1 did, and the Indexer says so. The first reindex closes the gap.
- **The map is disposable.** It is rewritten on every build and never edited by hand. Losing it costs only one
  reindex, never a curation decision: those are keyed by source path in the Curation file itself.
- **A renamed or moved folder on the NAS drops its edits.** The source path is the identity, so a file that is no
  longer found takes its edits with it. That was accepted as the price of not fingerprinting files.
