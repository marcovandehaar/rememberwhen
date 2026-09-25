using System.Globalization;
using System.IO;
using System.Text;
using static Indexer.Media.Mp4BoxReader;

namespace Indexer.Media;

// Reads Apple's own "com.apple.quicktime.creationdate" QuickTime metadata
// item (the moov/meta keys+ilst scheme, 'mdta' namespace) — a second,
// independently-written creation timestamp iPhone .MOV recordings carry
// alongside the ISO-BMFF mvhd atom's own creation_time. The two can
// disagree by tens of minutes: mvhd's creation_time has no explicit UTC
// offset and was found wrong against neighbouring photos on a real trip
// (#48 follow-up), while this key is written with one
// ("2026-07-10T11:06:05+0200") and matched the true position. Shell's
// "Media created" property (what VideoMetadataReader otherwise reads) only
// ever exposes mvhd's value, never this one, so it has to be read here
// directly from the container.
//
// Not every clip carries it — a video recorded in "Most Compatible" mode
// (.mp4, mp42 brand) has no moov/meta at all, only mvhd — so this is a
// preference, not a replacement: VideoMetadataReader falls back to Shell's
// value when this returns null.
public static class QuickTimeMetadataReader
{
    private const string CreationDateKey = "com.apple.quicktime.creationdate";
    private static readonly string[] ContainerBoxes = ["moov", "trak"];

    public static DateTimeOffset? ReadCreationDate(string path)
    {
        try
        {
            using var stream = File.OpenRead(path);
            using var reader = new BinaryReader(stream);
            return FindCreationDate(reader, stream.Length);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or EndOfStreamException or OverflowException)
        {
            // Same non-blocking default as HdrVideoDetector: a file this
            // can't parse just falls back to Shell's value.
            return null;
        }
    }

    private static DateTimeOffset? FindCreationDate(BinaryReader reader, long end)
    {
        var stream = reader.BaseStream;
        while (stream.Position <= end - 8)
        {
            var boxStart = stream.Position;
            var header = ReadBoxHeader(reader, boxStart, end);

            DateTimeOffset? found = header.Type switch
            {
                _ when ContainerBoxes.Contains(header.Type) => FindCreationDate(reader, boxStart + header.Size),
                "meta" => ReadCreationDateFromMeta(reader, boxStart + header.Size),
                _ => null,
            };
            if (found is not null) return found;

            stream.Position = boxStart + header.Size;
        }

        return null;
    }

    // A meta box's `keys` lists every 'mdta' key name in order (1-based);
    // its `ilst` then has one child item per key, whose own box "type" is
    // that 1-based index rather than a four-character code. `keys` always
    // precedes `ilst` in practice, so a single forward pass suffices.
    private static DateTimeOffset? ReadCreationDateFromMeta(BinaryReader reader, long metaEnd)
    {
        var stream = reader.BaseStream;
        var creationDateKeyIndex = 0;

        while (stream.Position <= metaEnd - 8)
        {
            var boxStart = stream.Position;
            var header = ReadBoxHeader(reader, boxStart, metaEnd);

            if (header.Type == "keys")
            {
                creationDateKeyIndex = FindKeyIndex(reader, CreationDateKey);
            }
            else if (header.Type == "ilst" && creationDateKeyIndex != 0)
            {
                var raw = ReadIlstItemAsString(reader, boxStart + header.Size, creationDateKeyIndex);
                if (raw is not null &&
                    DateTimeOffset.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
                {
                    return parsed;
                }
            }

            stream.Position = boxStart + header.Size;
        }

        return null;
    }

    private static int FindKeyIndex(BinaryReader reader, string targetKeyName)
    {
        ReadExact(reader, 4); // version(1) + flags(3)
        var entryCount = ReadUInt32BE(reader);
        var foundIndex = 0;
        for (var i = 1; i <= entryCount; i++)
        {
            var keySize = ReadUInt32BE(reader);
            ReadExact(reader, 4); // key_namespace ("mdta")
            var keyName = Encoding.UTF8.GetString(ReadExact(reader, ByteCountAfterHeader(keySize, 8, "keys entry")));
            if (keyName == targetKeyName) foundIndex = i;
        }

        return foundIndex;
    }

    private static string? ReadIlstItemAsString(BinaryReader reader, long ilstEnd, int targetIndex)
    {
        var stream = reader.BaseStream;
        while (stream.Position <= ilstEnd - 8)
        {
            var itemStart = stream.Position;
            long itemSize = ReadUInt32BE(reader);
            var itemIndex = ReadUInt32BE(reader); // not a four-character code — the 1-based key index
            if (itemSize == 0) itemSize = ilstEnd - itemStart;
            if (itemSize < 8) throw new IOException($"Ongeldig ilst-item op {itemStart}: grootte {itemSize} kleiner dan de eigen header.");

            if (itemIndex == targetIndex)
            {
                var dataSize = ReadUInt32BE(reader);
                var dataType = ReadFourCc(reader);
                if (dataType == "data")
                {
                    ReadExact(reader, 8); // type_indicator(4) + locale(4)
                    return Encoding.UTF8.GetString(ReadExact(reader, ByteCountAfterHeader(dataSize, 16, "data box")));
                }
            }

            stream.Position = itemStart + itemSize;
        }

        return null;
    }

    // keySize/dataSize both include the bytes already consumed reading the
    // field itself (the 8-byte size+namespace pair, or size+type+
    // type_indicator+locale) — a malformed file can declare one smaller
    // than that, which would otherwise underflow into a negative read count.
    private static int ByteCountAfterHeader(uint declaredSize, int headerLength, string what)
    {
        var remaining = (long)declaredSize - headerLength;
        if (remaining < 0)
            throw new IOException($"Ongeldige {what}: grootte {declaredSize} kleiner dan de eigen header ({headerLength}).");

        return (int)remaining;
    }
}
