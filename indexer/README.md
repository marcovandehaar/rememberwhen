# rememberwhen — Indexer

Reads one Source Folder and publishes a `catalog.json` plus media derivatives, per `docs/v1-build-spec.md`.

## Settings UI (primary workflow, #37)

```sh
dotnet run --project indexer
```

Starts a local web server (default `http://localhost:5183`) and opens it in your default browser. From there the operator can, without hand-editing any file:

- Add, view and remove Source Folders.
- Add, edit and remove Gazetteer entries (Destination name → coordinate).
- Set the output location.
- Start an indexing run against a configured Source Folder, with progress and the result shown in the page.

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
