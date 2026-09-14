using Indexer.Web;

namespace Indexer.Tests;

// Exercises the real Windows Credential Manager (there is no in-process
// fake for a Win32 API like this) under a per-test target name, always
// cleaned up afterward.
public class CredentialStoreTests : IDisposable
{
    private readonly string _host = $"rememberwhen-test-{Guid.NewGuid()}";

    public void Dispose() => CredentialStore.Delete(_host);

    [Fact]
    public void An_unconfigured_host_has_no_stored_username()
    {
        Assert.Null(CredentialStore.TryGetUsername(_host));
    }

    [Fact]
    public void Saving_and_reading_back_the_username_round_trips()
    {
        CredentialStore.Save(_host, "nas-indexer", "s3cret!");

        Assert.Equal("nas-indexer", CredentialStore.TryGetUsername(_host));
    }

    [Fact]
    public void Saving_again_overwrites_the_previous_credential()
    {
        CredentialStore.Save(_host, "first-user", "pw1");

        CredentialStore.Save(_host, "second-user", "pw2");

        Assert.Equal("second-user", CredentialStore.TryGetUsername(_host));
    }

    [Fact]
    public void Deleting_removes_the_stored_username()
    {
        CredentialStore.Save(_host, "nas-indexer", "s3cret!");

        CredentialStore.Delete(_host);

        Assert.Null(CredentialStore.TryGetUsername(_host));
    }

    [Fact]
    public void Deleting_an_unconfigured_host_does_not_throw()
    {
        CredentialStore.Delete(_host);
    }
}
