using System.IO.Compression;
using System.Text;
using Orbit.Gateway.Services;
using Xunit;

namespace Orbit.Gateway.Tests;

public class SnapshotWorkerTests
{
  [Fact]
  public void Decompress_roundtrips_gzip_payload()
  {
    const string text = "yjs snapshot bytes";
    var raw = Encoding.UTF8.GetBytes(text);

    using var output = new MemoryStream();
    using (var gzip = new GZipStream(output, CompressionLevel.Fastest, leaveOpen: true))
    {
      gzip.Write(raw, 0, raw.Length);
    }

    var restored = SnapshotCompression.Decompress(output.ToArray());
    Assert.Equal(text, Encoding.UTF8.GetString(restored));
  }
}
