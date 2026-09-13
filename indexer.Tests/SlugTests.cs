namespace Indexer.Tests;

public class SlugTests
{
    [Theory]
    [InlineData("Zeeland 2016", "zeeland-2016")]
    [InlineData("IMG_1234.JPG", "img-1234-jpg")]
    [InlineData("  spaces  everywhere  ", "spaces-everywhere")]
    [InlineData("Café Müller", "cafe-muller")]
    public void Produces_a_stable_lowercase_dashed_id(string input, string expected)
    {
        Assert.Equal(expected, Slug.From(input));
    }
}
