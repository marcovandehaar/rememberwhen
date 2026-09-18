using System.Globalization;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace Indexer.Web;

// Forward geocoding for the Indexer-UI's "Suggest coordinate" button (#42) —
// a one-off, operator-confirmed lookup against Nominatim's /search endpoint.
// Never writes to the Gazetteer itself; the caller decides what to do with
// the suggestion. ADR 0005 explicitly keeps this out of the iPad runtime:
// the flat local lookup there is unchanged, this only helps fill it in.
public sealed class NominatimClient
{
    private readonly HttpClient _http;

    public NominatimClient(HttpClient http) => _http = http;

    public async Task<NominatimSuggestion?> Search(string query, CancellationToken cancellationToken = default)
    {
        var url = $"search?q={Uri.EscapeDataString(query)}&format=jsonv2&limit=1";
        using var response = await _http.GetAsync(url, cancellationToken);
        response.EnsureSuccessStatusCode();

        var results = await response.Content.ReadFromJsonAsync<List<NominatimApiResult>>(cancellationToken: cancellationToken);
        var first = results?.FirstOrDefault();
        if (first is null) return null;

        return new NominatimSuggestion(
            first.DisplayName,
            double.Parse(first.Lat, CultureInfo.InvariantCulture),
            double.Parse(first.Lon, CultureInfo.InvariantCulture));
    }

    private sealed record NominatimApiResult(
        [property: JsonPropertyName("display_name")] string DisplayName,
        [property: JsonPropertyName("lat")] string Lat,
        [property: JsonPropertyName("lon")] string Lon);
}

public sealed record NominatimSuggestion(string DisplayName, double Lat, double Lon);
