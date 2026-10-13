using System.IO;
using System.Text.Json;

namespace Indexer.Catalog;

// What one startup migration step did, for the Indexer UI's banner and the
// console. Generic on purpose: the config migration (next slice) adds its
// own step to the same report instead of getting a second file.
public sealed class MigrationStepResult
{
    public required string Step { get; init; }
    public required bool Succeeded { get; init; }

    // Failure only: which part of the step broke, and why.
    public string? FailedAt { get; init; }
    public string? Error { get; init; }

    public int MemoryCount { get; init; }
    public List<string> Backups { get; init; } = [];

    // Memories whose date is a fallback (no capture time to take it from).
    public List<string> FallbackDates { get; init; } = [];
}

public sealed class MigrationReport
{
    public List<MigrationStepResult> Steps { get; init; } = [];

    public bool Failed => Steps.Any(s => !s.Succeeded);

    public static MigrationReport? Load(string path) =>
        File.Exists(path)
            ? JsonSerializer.Deserialize<MigrationReport>(File.ReadAllText(path), JsonOptions.Default)
            : null;

    public void Save(string path) =>
        File.WriteAllText(path, JsonSerializer.Serialize(this, JsonOptions.Default));
}

public static class MigrationRunner
{
    public const string ReportFileName = "migration-v2.json";

    // Runs each step in order and stops at the first failure. A step returns
    // null when it has nothing to do (already migrated), so a normal start
    // leaves an earlier report, and its banner, untouched. A step must report
    // its own failures rather than throw: the Indexer keeps running either way.
    public static MigrationReport? Run(string reportPath, TextWriter log, params Func<MigrationStepResult?>[] steps)
    {
        var results = new List<MigrationStepResult>();
        foreach (var step in steps)
        {
            var result = step();
            if (result is null) continue;

            results.Add(result);
            WriteToConsole(result, log);
            if (!result.Succeeded) break;
        }

        if (results.Count == 0) return null;

        var report = new MigrationReport { Steps = results };
        report.Save(reportPath);
        return report;
    }

    private static void WriteToConsole(MigrationStepResult result, TextWriter log)
    {
        if (!result.Succeeded)
        {
            log.WriteLine($"Migratie '{result.Step}' mislukt bij '{result.FailedAt}': {result.Error}");
            log.WriteLine("Herstel en herstart de Indexer om opnieuw te proberen; je originelen staan in de .pre-v2.bak-bestanden.");
            return;
        }

        log.WriteLine($"Migratie '{result.Step}': {result.MemoryCount} Memories bijgewerkt. Back-up: {string.Join(", ", result.Backups)}");
        foreach (var name in result.FallbackDates)
            log.WriteLine($"  Datum van '{name}' is een terugval (indexeerdatum van de map, anders de datum van de catalogus): er was geen opnametijd.");
    }
}
