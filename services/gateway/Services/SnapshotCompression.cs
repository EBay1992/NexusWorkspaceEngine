using System.IO.Compression;

namespace Orbit.Gateway.Services;

public static class SnapshotCompression
{
    public static byte[] Decompress(byte[] gzipPayload)
    {
        using var input = new MemoryStream(gzipPayload);
        using var gzip = new GZipStream(input, CompressionMode.Decompress);
        using var output = new MemoryStream();
        gzip.CopyTo(output);
        return output.ToArray();
    }
}
