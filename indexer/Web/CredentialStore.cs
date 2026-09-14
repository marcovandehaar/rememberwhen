using System.Runtime.InteropServices;
using System.Text;

namespace Indexer.Web;

// Stores the credentials Windows needs to authenticate SMB access to a
// Source Folders-basismap that lives on a network share — the same
// mechanism `cmdkey` exposes from a terminal, done here from the settings
// UI instead. Once written, Windows applies it automatically to any
// connection to that server; File/Directory calls against \\host\... paths
// then authenticate transparently, so nothing else in this app ever touches
// SMB or a password directly. The password is write-only end to end: it is
// never read back out of here, only whether a username is configured.
public static class CredentialStore
{
    private const uint CredTypeDomainPassword = 2;
    private const uint CredPersistLocalMachine = 2;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct Credential
    {
        public uint Flags;
        public uint Type;
        public IntPtr TargetName;
        public IntPtr Comment;
        public long LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        public IntPtr TargetAlias;
        public IntPtr UserName;
    }

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CredWriteW(ref Credential credential, uint flags);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CredReadW(string targetName, uint type, uint flags, out IntPtr credentialPtr);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CredDeleteW(string targetName, uint type, uint flags);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool CredFree(IntPtr credentialPtr);

    public static void Save(string host, string username, string password)
    {
        var targetPtr = Marshal.StringToCoTaskMemUni(host);
        var userPtr = Marshal.StringToCoTaskMemUni(username);
        var passwordBytes = Encoding.Unicode.GetBytes(password);
        var blobPtr = Marshal.AllocCoTaskMem(Math.Max(passwordBytes.Length, 1));
        Marshal.Copy(passwordBytes, 0, blobPtr, passwordBytes.Length);

        try
        {
            var credential = new Credential
            {
                Type = CredTypeDomainPassword,
                TargetName = targetPtr,
                CredentialBlobSize = (uint)passwordBytes.Length,
                CredentialBlob = blobPtr,
                Persist = CredPersistLocalMachine,
                UserName = userPtr,
            };

            if (!CredWriteW(ref credential, 0))
                throw new InvalidOperationException(
                    $"Kon inloggegevens voor {host} niet opslaan (Windows-foutcode {Marshal.GetLastWin32Error()}).");
        }
        finally
        {
            Marshal.FreeCoTaskMem(targetPtr);
            Marshal.FreeCoTaskMem(userPtr);
            Marshal.FreeCoTaskMem(blobPtr);
        }
    }

    // The username only — safe to show in the UI. The password never leaves
    // Windows' own store once written.
    public static string? TryGetUsername(string host)
    {
        if (!CredReadW(host, CredTypeDomainPassword, 0, out var credentialPtr)) return null;

        try
        {
            var credential = Marshal.PtrToStructure<Credential>(credentialPtr);
            return credential.UserName == IntPtr.Zero ? null : Marshal.PtrToStringUni(credential.UserName);
        }
        finally
        {
            CredFree(credentialPtr);
        }
    }

    public static void Delete(string host) => CredDeleteW(host, CredTypeDomainPassword, 0);
}
