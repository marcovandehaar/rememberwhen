using System.Collections.Concurrent;

namespace Indexer.Web;

public enum RunStatus
{
    Running,
    Succeeded,
    Failed,
}

public sealed class RunState
{
    private readonly List<string> _log = [];
    private readonly object _gate = new();

    public string Id { get; } = Guid.NewGuid().ToString("n");
    public RunStatus Status { get; private set; } = RunStatus.Running;
    public string? Error { get; private set; }
    public string? CatalogPath { get; private set; }
    public int? ProgressCurrent { get; private set; }
    public int? ProgressTotal { get; private set; }

    public void AppendLog(string line)
    {
        lock (_gate) _log.Add(line);
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
    }
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
