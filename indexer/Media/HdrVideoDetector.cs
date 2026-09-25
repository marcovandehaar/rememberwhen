using System.IO;
using System.Linq;
using static Indexer.Media.Mp4BoxReader;

namespace Indexer.Media;

// Dolby Vision / HDR10 / HLG detection, read straight from the container's
// own ISO-BMFF boxes (moov/trak/mdia/minf/stbl/stsd's video sample entry) —
// not from Shell.GetDetailsOf, which exposes no color/HDR signalling among
// its properties on this machine (same limitation library-survey.md found
// for GPS). Works for both .mov and .mp4: they share the same box layout.
//
// Why this matters: a browser's <video> tag doesn't reliably tone-map
// Dolby Vision/HDR the way Apple's own players or VLC do, so an untouched
// HDR clip can render severely overexposed (#48, verified against a real
// iPhone clip's dvvC box). CatalogBuilder uses this to decide which videos
// actually need tone-mapping, rather than paying that cost on every clip.
public static class HdrVideoDetector
{
    private static readonly string[] ContainerBoxes = ["moov", "trak", "mdia", "minf", "stbl"];
    private static readonly string[] VideoSampleEntries = ["avc1", "hvc1", "hev1", "mp4v"];

    // PQ (SMPTE ST 2084) and HLG (ARIB STD-B67) — the two transfer
    // functions that mean "these samples are HDR," per the colr box's
    // nclx form (ISO/IEC 14496-12 §12.1.5).
    private const ushort PqTransferFunction = 16;
    private const ushort HlgTransferFunction = 18;

    // ISO/IEC 14496-12 §12.1.3: a video sample entry always has this fixed
    // 78-byte body (reserved/data_reference_index plus the video-specific
    // fields) before any child boxes like colr/dvcC/dvvC begin.
    private const int VideoSampleEntryFixedBodySize = 78;

    public static bool IsHdr(string path)
    {
        try
        {
            using var stream = File.OpenRead(path);
            using var reader = new BinaryReader(stream);
            return HasHdrSignal(reader, stream.Length);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or EndOfStreamException or OverflowException)
        {
            // A file this can't parse is not this detector's problem to
            // solve — CatalogBuilder treats "not HDR" as "publish as-is,"
            // the same safe default a genuinely SDR file would get.
            return false;
        }
    }

    private static bool HasHdrSignal(BinaryReader reader, long end)
    {
        var stream = reader.BaseStream;
        while (stream.Position <= end - 8)
        {
            var boxStart = stream.Position;
            var header = ReadBoxHeader(reader, boxStart, end);

            if (ContainerBoxes.Contains(header.Type))
            {
                if (HasHdrSignal(reader, boxStart + header.Size)) return true;
            }
            else if (header.Type == "stsd")
            {
                ReadExact(reader, 8); // version(1) + flags(3) + entry_count(4); entries are walked as children below
                if (HasHdrSignal(reader, boxStart + header.Size)) return true;
            }
            else if (VideoSampleEntries.Contains(header.Type))
            {
                stream.Position = boxStart + header.HeaderLength + VideoSampleEntryFixedBodySize;
                if (HasHdrSignal(reader, boxStart + header.Size)) return true;
            }
            else if (header.Type is "dvcC" or "dvvC")
            {
                return true; // a Dolby Vision configuration box is itself the signal
            }
            else if (header.Type == "colr" && HasHdrTransferFunction(reader))
            {
                return true;
            }

            stream.Position = boxStart + header.Size;
        }

        return false;
    }

    private static bool HasHdrTransferFunction(BinaryReader reader)
    {
        if (ReadFourCc(reader) != "nclx") return false;
        ReadExact(reader, 2); // colour_primaries
        var transferFunction = ReadUInt16BE(reader);
        return transferFunction is PqTransferFunction or HlgTransferFunction;
    }
}
