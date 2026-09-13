using System.Globalization;
using System.Text;

namespace Indexer;

public static class Slug
{
    // Deterministic and stable across re-indexing runs, so Curation entries
    // keyed on a Media Item id (a later ticket) survive a re-run untouched.
    // ASCII-only on purpose: ids end up in file paths and URLs.
    public static string From(string value)
    {
        var decomposed = value.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);
        var previousWasDash = false;

        foreach (var c in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark) continue;

            if (c is >= 'a' and <= 'z' or >= '0' and <= '9')
            {
                builder.Append(c);
                previousWasDash = false;
            }
            else if (c is >= 'A' and <= 'Z')
            {
                builder.Append(char.ToLowerInvariant(c));
                previousWasDash = false;
            }
            else if (!previousWasDash)
            {
                builder.Append('-');
                previousWasDash = true;
            }
        }

        return builder.ToString().Trim('-');
    }
}
