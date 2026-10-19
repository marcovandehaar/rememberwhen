# rememberwhen — Indexer

Reads one Source Folder and publishes a `catalog.json` plus media derivatives, per `docs/v1-build-spec.md`.

## Settings UI (primary workflow, #37)

```sh
dotnet run --project indexer
```

Starts a local web server (default `http://localhost:5183`) and opens it in your default browser. The screen is one list of **Memories** (a Trip is a Memory with a Destination) with the detail of the selected one next to it:

- **The list** groups Memories by the year of their date, newest first, with Memories not indexed yet in their own group on top. A 📍 marks a Trip and an orange dot means "needs reindex". The filter above it shows Alles / Trips / Geen Trip with their counts.
- **+ Nieuwe Memory** takes a name and a first Source Folder ("Bladeren…" opens a picker over the Indexer's own filesystem, since a plain browser page can't get a real path back from a native OS dialog; typing the path works too), then **Indexeren** builds it and a thumbnail review grid appears.
- **Soort** — a Trip has a Destination ("Destination wijzigen…", or "Maak er een Trip van…" for a Memory that has none; "Geen Trip meer" removes it). Applied at once to `catalog.json` with a Gazetteer lookup, no reindex; the globe picks it up after the next publish.
- **Datum** — the effective date, with "(standaard …)" when overridden. "Wijzigen…" sets an override (empty = back to the date of the earliest photo). Applied at once; the override lives in `config.json`, the catalogue only holds the effective date.
- **Source Folders** — one row each. A Memory can draw on several, and one folder may feed several Memories ("ook in N andere"). Adding or removing one only marks the Memory "herindexeren nodig"; the last folder can't be removed.
- **Herindexeren** rebuilds the Memory from all its folders (a confirmation first, since photos removed from the result come back). **Naam wijzigen** fixes a mistyped name in place and instantly; **Verwijderen** drops the Memory and its published photos.
- **Unreadable files.** A file that can't be read (a share that drops a read, or a corrupt photo) gets three attempts, then is skipped and named in the run log; the rest still indexes.
- A photo removed in the review grid only affects the current result — a later reindex rereads the Source Folders and brings it back.

The Gazetteer, output location, Curatie- en logs-locatie, and a Source Folders-basismap live behind the settings sheet (gear icon), since they're setup, not part of the daily flow. Setting the basismap to a folder all trips live under — a mounted NAS share, say — points "Bladeren…" there directly instead of the drive list, and it can't wander above it. The Indexer only ever sees the filesystem of the machine it's running on, so this only works when that folder is actually reachable from there (a mapped network drive or UNC path with Windows already holding the credentials — nothing this app manages itself).

Anomaly-meldingen (`{memory-id}.curation.json`) and run-logs (`{memory-id}.log`) are written to the Curatie- en logs-locatie, never to the Source Folder — a photo archive is often read-only at the folder level, and the Indexer only ever needs read access there.

All of this is backed by one configuration file, `indexer/config.json` by default — machine-specific (Source Folder paths), so it's gitignored and starts out empty; the UI creates and updates it. An invalid setting (a Source Folder path that no longer exists, a missing Gazetteer file, …) is always reported in the UI, never silently applied.

## CLI (still available, for scripting)

```sh
dotnet run --project indexer -- <source-folder> <memory-naam> <destination-naam> <output-folder> [gazetteer.json] [curation-folder]
```

`gazetteer.json` defaults to `indexer/gazetteer.json`, `curation-folder` to `indexer/curation-logs`. Add the destination by hand before indexing:

```json
{ "Zeeland": { "lat": 51.5, "lon": 3.8 } }
```

Real photos never belong in this repo (see `.gitignore`) — point `<output-folder>` at a scratch directory outside the repo, or delete it before committing.

## Scope of this ticket (#28)

One Memory, one hardcoded Chapter — the Chapter-boundary heuristic (#20/#31), anomaly detection (#19/#33), and the confirmation UI (#22/#34) are later tickets. A missing capture time falls back to the file's own timestamp for now; that stopgap goes away once #33 lands.
