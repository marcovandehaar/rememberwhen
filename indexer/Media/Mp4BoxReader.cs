using System.Text;

namespace Indexer.Media;

// A box's header: its four-character type, its total size (self plus every
// byte of its body), and how many of those bytes the header itself already
// consumed — HasHdrSignal/FindCreationDate need that to know where a box's
// children start.
internal readonly record struct BoxHeader(string Type, long Size, long HeaderLength);

// Shared ISO-BMFF (.mp4/.mov) box-reading logic — used by HdrVideoDetector
// and QuickTimeMetadataReader, which each walk a different part of the same
// box tree. Centralized (not just the byte primitives) after the two
// readers' independent copies of the size==1/size==0 handling drifted: one
// silently dropped the 64-bit extended-size case (#48/#49 review).
internal static class Mp4BoxReader
{
    // ISO/IEC 14496-12 §4.2: reads a box's size+type; size==1 means the real
    // size follows as a 64-bit integer (headerLength grows to 16), size==0
    // means "extends to the end of its parent," which the caller supplies.
    // A box whose declared size doesn't even cover its own header is
    // malformed input, not a valid degenerate case — reported as
    // IOException so it flows into the same "can't parse, fall back
    // gracefully" catch every caller already has.
    public static BoxHeader ReadBoxHeader(BinaryReader reader, long boxStart, long end)
    {
        long size = ReadUInt32BE(reader);
        var type = ReadFourCc(reader);
        var headerLength = 8L;
        if (size == 1)
        {
            size = checked((long)ReadUInt64BE(reader));
            headerLength = 16L;
        }
        else if (size == 0)
        {
            size = end - boxStart;
        }

        if (size < headerLength)
            throw new IOException($"Ongeldige ISO-BMFF-box '{type}' op {boxStart}: grootte {size} kleiner dan de eigen header.");

        return new BoxHeader(type, size, headerLength);
    }

    public static uint ReadUInt32BE(BinaryReader reader)
    {
        var b = ReadExact(reader, 4);
        return (uint)(b[0] << 24 | b[1] << 16 | b[2] << 8 | b[3]);
    }

    public static ulong ReadUInt64BE(BinaryReader reader) =>
        (ulong)ReadUInt32BE(reader) << 32 | ReadUInt32BE(reader);

    public static ushort ReadUInt16BE(BinaryReader reader)
    {
        var b = ReadExact(reader, 2);
        return (ushort)(b[0] << 8 | b[1]);
    }

    public static string ReadFourCc(BinaryReader reader) => Encoding.ASCII.GetString(ReadExact(reader, 4));

    // BinaryReader.ReadBytes silently returns fewer bytes than asked for at
    // EOF instead of throwing — every caller here treats a short read as
    // "this file is truncated/malformed," surfaced as EndOfStreamException.
    public static byte[] ReadExact(BinaryReader reader, int count)
    {
        var bytes = reader.ReadBytes(count);
        if (bytes.Length != count) throw new EndOfStreamException();
        return bytes;
    }
}
