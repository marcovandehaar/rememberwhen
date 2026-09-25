using System.Text;

namespace Indexer.Tests;

// Minimal synthetic ISO-BMFF (.mp4/.mov) fixtures — just enough box
// structure for HdrVideoDetector to walk (moov/trak/mdia/minf/stbl/stsd's
// video sample entry), without a real encoded video anywhere inside. No
// external tool needed, same spirit as TestImages' synthetic JPEGs.
public static class TestVideos
{
    public static void WriteMinimalVideo(
        string path,
        bool dolbyVisionConfigBox = false,
        ushort? colrTransferFunction = null,
        string? quickTimeCreationDate = null)
    {
        var sampleEntryChildren = Array.Empty<byte>();
        if (dolbyVisionConfigBox) sampleEntryChildren = Concat(sampleEntryChildren, Box("dvvC", new byte[24]));
        if (colrTransferFunction is { } transferFunction)
            sampleEntryChildren = Concat(sampleEntryChildren, Box("colr", NclxColorBox(transferFunction)));

        var sampleEntryFixedBody = new byte[78]; // reserved + data_reference_index + video fields; zeroed is fine, the walker never reads them
        var hvc1 = Box("hvc1", Concat(sampleEntryFixedBody, sampleEntryChildren));

        var stsdBody = Concat(new byte[8], hvc1); // version(1) + flags(3) + entry_count(4), zeroed
        var stsd = Box("stsd", stsdBody);
        var stbl = Box("stbl", stsd);
        var minf = Box("minf", stbl);
        var mdia = Box("mdia", minf);
        var trak = Box("trak", mdia);

        var moovBody = trak;
        if (quickTimeCreationDate is not null)
            moovBody = Concat(moovBody, MetaBoxWithCreationDate(quickTimeCreationDate));

        var moov = Box("moov", moovBody);
        var ftyp = Box("ftyp", Concat(Encoding.ASCII.GetBytes("qt  "), new byte[4], Encoding.ASCII.GetBytes("qt  ")));

        File.WriteAllBytes(path, Concat(ftyp, moov));
    }

    // moov/meta's "keys" (one 'mdta' key name, here just the creation-date
    // key) + "ilst" (one item, whose own box "type" is the 1-based key
    // index rather than a four-character code, wrapping a "data" box) —
    // the same shape a real iPhone .MOV carries (verified against
    // IMG_3229.MOV's own moov/meta, #48 follow-up).
    private static byte[] MetaBoxWithCreationDate(string creationDate)
    {
        var keyName = Encoding.ASCII.GetBytes("com.apple.quicktime.creationdate");
        var keyEntry = Concat(UInt32BE((uint)(8 + keyName.Length)), Encoding.ASCII.GetBytes("mdta"), keyName);
        var keysBody = Concat(new byte[4], UInt32BE(1), keyEntry); // version(1) + flags(3), entry_count=1
        var keys = Box("keys", keysBody);

        var valueBytes = Encoding.UTF8.GetBytes(creationDate);
        var dataBody = Concat(UInt32BE(1), new byte[4], valueBytes); // type_indicator=1 (UTF-8), locale=0
        var data = Box("data", dataBody);
        var ilstItem = Concat(UInt32BE((uint)(8 + data.Length)), UInt32BE(1), data); // item "type" = key index 1

        return Box("meta", Concat(keys, Box("ilst", ilstItem)));
    }

    private static byte[] NclxColorBox(ushort transferFunction) =>
        Concat(
            Encoding.ASCII.GetBytes("nclx"),
            UInt16BE(1), // colour_primaries (unspecified value, unread by the detector)
            UInt16BE(transferFunction),
            UInt16BE(1), // matrix_coefficients (unread by the detector)
            [0] // full_range_flag + reserved
        );

    private static byte[] Box(string type, byte[] body)
    {
        var size = 8 + body.Length;
        return Concat(UInt32BE((uint)size), Encoding.ASCII.GetBytes(type), body);
    }

    private static byte[] UInt32BE(uint value) => [(byte)(value >> 24), (byte)(value >> 16), (byte)(value >> 8), (byte)value];
    private static byte[] UInt16BE(ushort value) => [(byte)(value >> 8), (byte)value];

    private static byte[] Concat(params byte[][] parts)
    {
        var result = new byte[parts.Sum(p => p.Length)];
        var offset = 0;
        foreach (var part in parts)
        {
            Buffer.BlockCopy(part, 0, result, offset, part.Length);
            offset += part.Length;
        }

        return result;
    }
}
