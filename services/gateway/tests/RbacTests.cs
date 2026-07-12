using Orbit.Gateway.Data;
using Orbit.Gateway.Models;
using Orbit.Gateway.Services;
using Xunit;

namespace Orbit.Gateway.Tests;

public class RbacTests
{
  [Theory]
  [InlineData(WorkspaceRole.Owner, true, true, true)]
  [InlineData(WorkspaceRole.Editor, true, true, false)]
  [InlineData(WorkspaceRole.Viewer, true, false, false)]
  public async Task Role_permissions_match_matrix(
    WorkspaceRole role,
    bool canRead,
    bool canWrite,
    bool canAdmin)
  {
    var repository = new FakeWorkspaceRepository
    {
      Membership = new WorkspaceMemberRecord("demo", Guid.Parse("11111111-1111-1111-1111-111111111111"), role),
    };
    var authorization = new WorkspaceAuthorizationService(repository);
    var userId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    Assert.Equal(canRead, await authorization.CanReadAsync("demo", userId));
    Assert.Equal(canWrite, await authorization.CanWriteAsync("demo", userId));
    Assert.Equal(canAdmin, await authorization.CanAdminAsync("demo", userId));
  }

  [Fact]
  public async Task Unknown_member_is_denied()
  {
    var authorization = new WorkspaceAuthorizationService(new FakeWorkspaceRepository());
    var userId = Guid.Parse("11111111-1111-1111-1111-111111111111");

    Assert.False(await authorization.CanReadAsync("demo", userId));
    Assert.False(await authorization.CanWriteAsync("demo", userId));
  }

  private sealed class FakeWorkspaceRepository : IWorkspaceRepository
  {
    public WorkspaceMemberRecord? Membership { get; set; }

    public Task<UserRecord?> FindUserByEmailAsync(string email, CancellationToken cancellationToken = default) =>
      Task.FromResult<UserRecord?>(null);

    public Task<WorkspaceMemberRecord?> FindMembershipAsync(
      string workspaceId,
      Guid userId,
      CancellationToken cancellationToken = default) =>
      Task.FromResult(Membership);

    public Task<IReadOnlyList<WorkspaceSummary>> ListWorkspacesForUserAsync(
      Guid userId,
      CancellationToken cancellationToken = default) =>
      Task.FromResult<IReadOnlyList<WorkspaceSummary>>([]);

    public Task<WorkspaceSummary?> FindWorkspaceForUserAsync(
      string workspaceId,
      Guid userId,
      CancellationToken cancellationToken = default) =>
      Task.FromResult<WorkspaceSummary?>(null);

    public Task InsertSnapshotsAsync(IReadOnlyList<SnapshotInsert> snapshots, CancellationToken cancellationToken = default) =>
      Task.CompletedTask;
  }
}
