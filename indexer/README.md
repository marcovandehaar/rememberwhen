# rememberwhen — Indexer

Reads one Source Folder and publishes a `catalog.json` plus media derivatives, per `docs/v1-build-spec.md`.

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
