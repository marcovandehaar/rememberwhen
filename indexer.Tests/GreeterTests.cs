namespace Indexer.Tests;

public class GreeterTests
{
    [Fact]
    public void Greeting_is_not_empty()
    {
        Assert.False(string.IsNullOrWhiteSpace(Greeter.Greeting));
    }
}
