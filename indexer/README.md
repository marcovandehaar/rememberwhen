# rememberwhen — Indexer

Reads one Source Folder and publishes a `catalog.json` plus media derivatives, per `docs/v1-build-spec.md`.

## Settings UI (primary workflow, #37)

```sh
dotnet run --project indexer
```

Starts a local web server (default `http://localhost:5183`) and opens it in your default browser. The screen is built around three workflows:

- **Add a folder and index it.** Add a Source Folder — "Bladeren…" opens a picker over the Indexer's own filesystem (a plain browser page can't get a real path back from a native OS dialog, so this is the closest equivalent; typing the path directly still works too) — name the Memory and Destination, and index it. Progress and any notices stream live, and the result is a thumbnail review grid where a stray photo (the odd one that doesn't belong) can be removed with a click. That removal only affects the current result, though — a later reindex rereads the Source Folder from scratch and brings it back, so a permanent fix means removing the file from the folder itself.
- **Reindex an existing folder.** One click, reusing the Memory/Destination name from the first run — no retyping.
- **Remove an indexed folder.** Drops it from the list and deletes its published photos.

The Gazetteer and output location live behind the settings sheet (gear icon), since they're setup, not part of the daily flow.

All of this is backed by one configuration file, `indexer/config.json` by default — machine-specific (Source Folder paths), so it's gitignored and starts out empty; the UI creates and updates it. An invalid setting (a Source Folder path that no longer exists, a missing Gazetteer file, …) is always reported in the UI, never silently applied.

## CLI (still available, for scripting)

```sh
dotnet run --project indexer -- <source-folder> <memory-naam> <destination-naam> <output-folder> [gazetteer.json]
```

`gazetteer.json` defaults to `indexer/gazetteer.json`. Add the destination by hand before indexing:

```json
{ "Zeeland": { "lat": 51.5, "lon": 3.8 } }
```

Real photos never belong in this repo (see `.gitignore`) — point `<output-folder>` at a scratch directory outside the repo, or delete it before committing.

## Scope of this ticket (#28)

One Memory, one hardcoded Chapter — the Chapter-boundary heuristic (#20/#31), anomaly detection (#19/#33), and the confirmation UI (#22/#34) are later tickets. A missing capture time falls back to the file's own timestamp for now; that stopgap goes away once #33 lands.
