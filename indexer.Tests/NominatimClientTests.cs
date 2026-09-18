using System.Net;
using System.Net.Http;
using System.Text;
using Indexer.Web;

namespace Indexer.Tests;

public class NominatimClientTests
{
    [Fact]
    public async Task Returns_the_first_result_as_a_suggestion()
    {
        var client = ClientReturning("""
            [{"display_name":"Dublin, Leinster, Ireland","lat":"53.3498006","lon":"-6.2602964"}]
            """);

        var suggestion = await client.Search("Dublin");

        Assert.Equal(new NominatimSuggestion("Dublin, Leinster, Ireland", 53.3498006, -6.2602964), suggestion);
    }

    [Fact]
    public async Task Returns_null_when_nothing_matches()
    {
        var client = ClientReturning("[]");

        var suggestion = await client.Search("Onvindbareplaatsnaam");

        Assert.Null(suggestion);
    }

    private static NominatimClient ClientReturning(string json)
    {
        var handler = new StubHandler(json);
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://nominatim.openstreetmap.org/") };
        return new NominatimClient(http);
    }

    private sealed class StubHandler(string json) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(json, Encoding.UTF8, "application/json"),
            };
            return Task.FromResult(response);
        }
    }
}
