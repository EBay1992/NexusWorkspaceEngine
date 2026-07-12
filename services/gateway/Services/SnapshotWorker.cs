using System.IO.Compression;
using System.Threading.Channels;
using Orbit.Gateway.Models;

namespace Orbit.Gateway.Services;

public sealed record SnapshotRequest(
    string WorkspaceId,
    string ScopeId,
    Guid UserId,
    byte[] GzipPayload);

public interface ISnapshotIngestionService
{
    ValueTask EnqueueAsync(SnapshotRequest request, CancellationToken cancellationToken = default);
    ChannelReader<SnapshotRequest> Reader { get; }
}

public sealed class SnapshotIngestionService : ISnapshotIngestionService
{
    private readonly Channel<SnapshotRequest> channel = Channel.CreateUnbounded<SnapshotRequest>(
        new UnboundedChannelOptions { SingleReader = true });

    public ChannelReader<SnapshotRequest> Reader => channel.Reader;

    public ValueTask EnqueueAsync(SnapshotRequest request, CancellationToken cancellationToken = default) =>
        channel.Writer.WriteAsync(request, cancellationToken);
}

public sealed class SnapshotWorker(
    ISnapshotIngestionService ingestion,
    IServiceScopeFactory scopeFactory,
    ILogger<SnapshotWorker> logger) : BackgroundService
{
    private const int BatchSize = 50;
    private static readonly TimeSpan BatchInterval = TimeSpan.FromSeconds(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var batch = new List<SnapshotRequest>(BatchSize);
        var reader = ingestion.Reader;

        while (!stoppingToken.IsCancellationRequested)
        {
            batch.Clear();
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
            timeout.CancelAfter(BatchInterval);

            try
            {
                while (batch.Count < BatchSize)
                {
                    if (batch.Count == 0)
                    {
                        var first = await reader.ReadAsync(timeout.Token);
                        batch.Add(first);
                        continue;
                    }

                    if (!reader.TryRead(out var next)) break;
                    batch.Add(next);
                }
            }
            catch (OperationCanceledException) when (!stoppingToken.IsCancellationRequested)
            {
                // batch interval elapsed
            }

            if (batch.Count == 0) continue;

            try
            {
                await FlushBatchAsync(batch, stoppingToken);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "snapshot batch flush failed for {Count} items", batch.Count);
            }
        }
    }

    private async Task FlushBatchAsync(List<SnapshotRequest> batch, CancellationToken cancellationToken)
    {
        using var scope = scopeFactory.CreateScope();
        var authorization = scope.ServiceProvider.GetRequiredService<IWorkspaceAuthorizationService>();
        var repository = scope.ServiceProvider.GetRequiredService<Data.IWorkspaceRepository>();

        var inserts = new List<SnapshotInsert>(batch.Count);

        foreach (var request in batch)
        {
            if (!await authorization.CanWriteAsync(request.WorkspaceId, request.UserId, cancellationToken))
            {
                logger.LogWarning(
                    "snapshot rejected — write denied for user {UserId} workspace {WorkspaceId}",
                    request.UserId,
                    request.WorkspaceId);
                continue;
            }

            var payload = SnapshotCompression.Decompress(request.GzipPayload);
            inserts.Add(new SnapshotInsert(request.WorkspaceId, request.ScopeId, payload, request.UserId));
        }

        if (inserts.Count == 0) return;

        await repository.InsertSnapshotsAsync(inserts, cancellationToken);
        logger.LogInformation("persisted {Count} workspace snapshots", inserts.Count);
    }
}
