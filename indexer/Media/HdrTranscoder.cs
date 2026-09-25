using System.Diagnostics;

namespace Indexer.Media;

// Static tone-mapping only: ffmpeg without a Dolby-Vision-patched build
// reads a DV clip's HDR10/HLG-compatible base layer but not its per-frame
// RPU metadata, so this can't match a real Dolby Vision player frame for
// frame (#48, deliberately out of scope). What it fixes is the browser
// <video> tag's failure mode — an untouched HDR clip's PQ/HLG samples get
// displayed as if they were ordinary SDR gamma, blowing highlights out to
// near-white.
public static class HdrTranscoder
{
    // zscale needs a linear intermediate to tone-map in — dynamic range
    // can't be compressed in a gamma-encoded space — then converts back to
    // BT.709 for an ordinary SDR player. `hable` is the same filmic-curve
    // family VLC/libplacebo use for HDR->SDR, not a from-scratch guess.
    private const string ToneMapFilter =
        "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p";

    public static void ToneMapToSdr(string ffmpegPath, string sourcePath, string outputPath)
    {
        var startInfo = new ProcessStartInfo(ffmpegPath)
        {
            UseShellExecute = false,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };
        foreach (var arg in BuildArguments(sourcePath, outputPath)) startInfo.ArgumentList.Add(arg);

        Process process;
        try
        {
            // Process.Start throws Win32Exception (not IOException) when
            // ffmpegPath itself doesn't exist — a misconfigured/moved
            // binary is exactly the case #48 says must fall back to
            // publishing the original, not abort the whole run.
            process = Process.Start(startInfo)
                ?? throw new InvalidOperationException($"Kon ffmpeg niet starten op {ffmpegPath}.");
        }
        catch (System.ComponentModel.Win32Exception ex)
        {
            throw new InvalidOperationException($"Kon ffmpeg niet starten op {ffmpegPath}: {ex.Message}", ex);
        }

        using var _ = process;
        var stderr = process.StandardError.ReadToEnd();
        process.WaitForExit();
        if (process.ExitCode != 0)
            throw new InvalidOperationException($"ffmpeg mislukte (exit {process.ExitCode}) voor {sourcePath}:\n{stderr}");
    }

    // Separated from ToneMapToSdr so the argument list itself — the actual
    // thing worth getting wrong — is testable without an installed ffmpeg.
    public static IReadOnlyList<string> BuildArguments(string sourcePath, string outputPath) =>
    [
        "-y",
        "-i", sourcePath,
        // Only the first video and (if present) first audio stream — an
        // iPhone HDR clip can carry extra tracks (spatial audio, timed
        // metadata) a plain <video> tag never plays and ffmpeg's mp4 muxer
        // may not know how to stream-copy.
        "-map", "0:v:0",
        "-map", "0:a:0?",
        "-vf", ToneMapFilter,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-c:a", "copy",
        "-movflags", "+faststart",
        outputPath,
    ];
}
