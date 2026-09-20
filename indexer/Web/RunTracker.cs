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

    public string Id { get; } = Guid.NewGuid().ToString("n");
    public RunStatus Status { get; private set; } = RunStatus.Running;
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
        lock (_gate)
        {
            _log.Add(line);
            _logFile?.WriteLine($"[{DateTime.Now:HH:mm:ss}] {line}");
        }
    }

    public void SetProgress(int current, int total)
    {
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

    public RunState Start(Action<RunState> body)
    {
        var run = new RunState();
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
}

public sealed class RunLogWriter(RunState run) : TextWriter
{
    public override System.Text.Encoding Encoding => System.Text.Encoding.UTF8;

    public override void WriteLine(string? value) => run.AppendLog(value ?? string.Empty);

    public override void Write(char value) =>
        throw new NotSupportedException($"{nameof(RunLogWriter)} only supports WriteLine(string).");
}
