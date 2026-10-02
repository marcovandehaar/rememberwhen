using System.Collections.Concurrent;

namespace Indexer.Web;

public enum RunStatus
{
    Running,
    Succeeded,
    Failed,
    Cancelled,
}

public sealed class RunState
{
    private readonly List<string> _log = [];
    private readonly object _gate = new();
    private readonly CancellationTokenSource _cts = new();
    private StreamWriter? _logFile;

    private long _lastActivityTicks = DateTime.UtcNow.Ticks;

    public string Id { get; } = Guid.NewGuid().ToString("n");
    public string Kind { get; init; } = RunKinds.Index;
    public RunStatus Status { get; private set; } = RunStatus.Running;

    // Last time the run logged a line or moved its progress. A run that is
    // still Running but hasn't touched either for a while is stuck (a hung
    // ssh on the NAS looks exactly like that), and the UI says so rather
    // than spinning forever as if all is well.
    public int IdleSeconds =>
        Status == RunStatus.Running
            ? (int)TimeSpan.FromTicks(DateTime.UtcNow.Ticks - Interlocked.Read(ref _lastActivityTicks)).TotalSeconds
            : 0;
    public string? Error { get; private set; }
    public string? CatalogPath { get; private set; }
    public int? ProgressCurrent { get; private set; }
    public int? ProgressTotal { get; private set; }
    public CancellationToken CancellationToken => _cts.Token;

    // CatalogBuilder already persists its own per-Memory log this way
    // (curation-logs/{memoryId}.log); deploy runs had nothing, so a publish
    // that hangs or dies left no trace anywhere but OS process state — see
    // the Denmark 2023 publish that stalled on a single stuck `ssh rm -f`
    // for ten-plus minutes with nothing on disk to show it. AutoFlush so a
    // kill or crash mid-run still leaves everything logged up to that point.
    public void EnableFileLog(string path)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            _logFile = new StreamWriter(path, append: false) { AutoFlush = true };
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            AppendLog($"Kon logbestand niet wegschrijven naar {path}: {ex.Message}");
        }
    }

    public void AppendLog(string line)
    {
        Touch();
        lock (_gate)
        {
            _log.Add(line);
            try
            {
                _logFile?.WriteLine($"[{DateTime.Now:HH:mm:ss}] {line}");
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                // The log lives on the NAS share, which can drop mid-run. The
                // in-memory log (and the run itself) must outlive that.
                _logFile = null;
                _log.Add($"Logbestand niet meer bereikbaar, verder zonder: {ex.Message}");
            }
        }
    }

    private void Touch() => Interlocked.Exchange(ref _lastActivityTicks, DateTime.UtcNow.Ticks);

    public void SetProgress(int current, int total)
    {
        Touch();
        ProgressCurrent = current;
        ProgressTotal = total;
    }

    public List<string> SnapshotLog()
    {
        lock (_gate) return [.._log];
    }

    public void MarkSucceeded(string catalogPath)
    {
        CatalogPath = catalogPath;
        Status = RunStatus.Succeeded;
    }

    public void MarkFailed(string error)
    {
        Error = error;
        Status = RunStatus.Failed;
        AppendLog($"Mislukt: {error}"); // the field dies with the process; the file shouldn't
    }

    public void MarkCancelled()
    {
        Status = RunStatus.Cancelled;
        AppendLog("Geannuleerd.");
    }

    // Cooperative: CatalogBuilder.Build checks this between files, so a
    // cancelled run still unwinds cleanly (cleaning up what it already
    // wrote, see CatalogBuilder.cs) rather than stopping mid-write.
    public void RequestCancel() => _cts.Cancel();
}

// Runs are executed in a background Task; the UI polls GET /api/runs/{id}
// rather than holding a request open, so a page reload never loses progress.
public sealed class RunTracker
{
    private readonly ConcurrentDictionary<string, RunState> _runs = new();

    public RunState Start(Action<RunState> body, string kind = RunKinds.Index)
    {
        var run = new RunState { Kind = kind };
        _runs[run.Id] = run;

        Task.Run(() =>
        {
            try
            {
                body(run);
            }
            catch (OperationCanceledException)
            {
                run.MarkCancelled();
            }
            catch (Exception ex)
            {
                run.MarkFailed(ex.Message);
            }
        });

        return run;
    }

    public RunState? Get(string id) => _runs.GetValueOrDefault(id);

    // What a freshly loaded page asks for, since the browser forgets its own
    // run ids on reload but the run itself keeps going server-side.
    public RunState? Running(string kind) =>
        _runs.Values.FirstOrDefault(r => r.Kind == kind && r.Status == RunStatus.Running);
}

public static class RunKinds
{
    public const string Index = "index";
    public const string Deploy = "deploy";
}

public sealed class RunLogWriter(RunState run) : TextWriter
{
    public override System.Text.Encoding Encoding => System.Text.Encoding.UTF8;

    public override void WriteLine(string? value) => run.AppendLog(value ?? string.Empty);

    public override void Write(char value) =>
        throw new NotSupportedException($"{nameof(RunLogWriter)} only supports WriteLine(string).");
}
