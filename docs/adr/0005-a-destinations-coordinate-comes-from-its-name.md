# A Destination's coordinate comes from its name, not from its photos

The globe pin for a `Memory` is placed by looking its `Destination` name up in a **`Gazetteer`** — a local
JSON file mapping place names to coordinates, shipped with the `Indexer`, seeded by hand with roughly fifty
entries and appended to whenever a coordinate is established some other way. Where GPS exists it does not
place the pin; it *proposes the name* and afterwards checks it. Where GPS does not exist — which is most of
the library — the operator picks a name from the list, or pastes a coordinate.

This reverses what `CONTEXT.md` said. The glossary had the `Destination`'s coordinate *derived from the
Memory's Chapters*, which reads as: the photos know where they were, so the pin follows. The library survey
([issue #18](https://github.com/marcovandehaar/rememberwhen/issues/18)) removed the ground under that. **GPS is
a property of the camera, not of the era**: every Apple device tags essentially every frame and every other
device tags none, so location covers 23% of the photos, and the Samsung that shot 53% of the library geotags
nothing. Deriving the coordinate from the photos works for some holidays and not at all for others.

The name, by contrast, is always there. `CONTEXT.md` already says the `Destination`'s name is chosen during
indexing — the operator types "Zillertal" regardless. Resolving *that* costs nothing extra in the common case
and does not degrade when the camera was mute.

## Considered options

- **A geocoding service** (Nominatim, Photon, or a paid API) resolving the typed name. Recommended first and
  rejected by Marco in [issue #19](https://github.com/marcovandehaar/rememberwhen/issues/19): *"ik wil niet 80%
  van de software voor 1% van de gevallen maken."* It brings a network dependency, an API key, rate limits, a
  failure mode on a desktop without internet, and a service that may not exist in three years — all to answer a
  question asked a few dozen times in the life of the library.
- **A shortlist of the top ~50 holiday countries with a coordinate each.** Marco's own proposal, and the right
  *shape*: a data file, not a service. Rejected at **country granularity** only. A country centroid is a bad
  pin — France's lies over 250 km from Disneyland Paris, Austria's over 170 km from the Zillertal — and worse,
  **every French trip lands on the same point**. Overlapping pins are already an open problem on the map
  ([issue #11](https://github.com/marcovandehaar/rememberwhen/issues/11)); country granularity would manufacture
  it. The same fifty lines at trip granularity cost nothing more to type.
- **Deriving the coordinate from GPS and asking the operator only when there is none.** The literal reading of
  the old glossary. Rejected because it makes the exceptional path the common one: with location on 23% of
  photos, "ask the operator" would be the normal case rather than the fallback, and it would still need the
  list this ADR describes to be usable.
- **Letting the operator drop a pin on a map inside the `Indexer`.** Rejected as the expensive answer to a
  cheap question: a map control in a .NET desktop app is real work, where a paste field is a parser.

## Consequences

- **Nothing in the runtime changes.** The `Gazetteer` is consumed entirely inside the `Indexer`, on the
  desktop, before publishing. The catalogue carries a coordinate, as it always would have.
- **The list learns.** Every coordinate established by pasting, or read off a GPS-tagged photo, is written back
  as a (name, coordinate) pair. `Zillertal 2026` finds "Zillertal" already there, put there by `Zillertal
  2024`. The seed list is therefore a starting point, not a maintenance burden.
- **A `Media Item` carries no location in the published catalogue.** Location is a property of the `Chapter`.
  This was settled alongside this ADR and matters for a reason that is easy to miss: if a photo without GPS
  inherited its folder's coordinate, every photo in the folder would share one point, and location could no
  longer split that folder into `Chapter`s. Inheritance destroys the signal the boundary heuristic needs.
- **Reversible, and cheaply.** Nothing here is load-bearing beyond one file and one lookup. If the list turns
  out to be a chore, a geocoding service can be dropped in behind the same seam — and the accumulated pairs
  become its cache rather than being thrown away.
- **One measurement is still missing.** How many `Memory`s have no GPS at all is unknown; the survey counted
  cameras per library, not per folder. The estimate is nearer half than the "edge case" assumed in
  conversation. It does not threaten this decision — the `Gazetteer` earns itself back faster the larger the
  number is — but nobody should quote a percentage until it is measured.
