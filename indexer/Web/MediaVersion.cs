using System.Collections.Concurrent;
using System.Threading;

namespace Indexer.Web;

// Cache-busts a media URL without touching disk. VersionedMediaUrl first
// tried File.GetLastWriteTimeUtc per item — correct, but a stat() call per
// file over the NAS share, multiplied across ~2,200 media items on every
// /api/folders call (every mutation triggers one), took 16+ seconds. A
// mutation already knows exactly which relative paths it just touched
// (PendingPublish.AddFile's callers), so Touch that instead — an in-memory
// counter bump, and Get is a dictionary lookup. Resets on a server restart,
// which just means those paths' URLs go back to their stable (unversioned
// in effect — value 0) state; nothing relies on this surviving one.
public static class MediaVersion
{
    private static readonly ConcurrentDictionary<string, long> Versions = new();
    private static long _counter;

    public static void Touch(string relativePath) =>
        Versions[relativePath] = Interlocked.Increment(ref _counter);

    public static long Get(string relativePath) => Versions.GetValueOrDefault(relativePath, 0);
}
