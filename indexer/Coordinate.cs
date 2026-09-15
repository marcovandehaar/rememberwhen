namespace Indexer;

// Lives at the root namespace, not under Catalog, because it's a shared
// primitive: the Gazetteer, the catalogue model, and Media's own EXIF GPS
// reading all need it, and none of those should have to depend on each other
// just to share a lat/lon pair.
public readonly record struct Coordinate(double Lat, double Lon);
