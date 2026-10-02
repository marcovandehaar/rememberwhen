using Indexer.Web;
using Xunit;

namespace Indexer.Tests;

public class RunTrackerTests
{
    [Fact]
    public void Running_finds_an_in_flight_run_of_the_requested_kind_only()
    {
        var tracker = new RunTracker();
        using var release = new ManualResetEventSlim();

        var deploy = tracker.Start(_ => release.Wait(TimeSpan.FromSeconds(5)), RunKinds.Deploy);

        Assert.Same(deploy, tracker.Running(RunKinds.Deploy));
        Assert.Null(tracker.Running(RunKinds.Index));

        release.Set();
    }

    [Fact]
    public void Running_ignores_a_finished_run()
    {
        var tracker = new RunTracker();
        var run = tracker.Start(r => r.MarkSucceeded("x"), RunKinds.Deploy);

        SpinWait.SpinUntil(() => run.Status != RunStatus.Running, TimeSpan.FromSeconds(5));

        Assert.Null(tracker.Running(RunKinds.Deploy));
    }

    [Fact]
    public void IdleSeconds_is_zero_once_the_run_is_no_longer_running()
    {
        var run = new RunState();
        run.MarkSucceeded("x");

        Assert.Equal(0, run.IdleSeconds);
    }

    [Fact]
    public void Logging_or_progress_counts_as_activity()
    {
        var run = new RunState();
        run.AppendLog("a line");
        run.SetProgress(1, 10);

        Assert.True(run.IdleSeconds < 5);
    }
}
