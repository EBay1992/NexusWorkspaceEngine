using Orbit.Gateway.Models;

namespace Orbit.Gateway.Services;

public interface IWorkspaceAuthorizationService
{
    Task<bool> CanReadAsync(string workspaceId, Guid userId, CancellationToken cancellationToken = default);
    Task<bool> CanWriteAsync(string workspaceId, Guid userId, CancellationToken cancellationToken = default);
    Task<bool> CanAdminAsync(string workspaceId, Guid userId, CancellationToken cancellationToken = default);
}

public sealed class WorkspaceAuthorizationService(Data.IWorkspaceRepository repository) : IWorkspaceAuthorizationService
{
    public async Task<bool> CanReadAsync(string workspaceId, Guid userId, CancellationToken cancellationToken = default)
    {
        var membership = await repository.FindMembershipAsync(workspaceId, userId, cancellationToken);
        return membership is not null;
    }

    public async Task<bool> CanWriteAsync(string workspaceId, Guid userId, CancellationToken cancellationToken = default)
    {
        var membership = await repository.FindMembershipAsync(workspaceId, userId, cancellationToken);
        return membership?.Role is WorkspaceRole.Owner or WorkspaceRole.Editor;
    }

    public async Task<bool> CanAdminAsync(string workspaceId, Guid userId, CancellationToken cancellationToken = default)
    {
        var membership = await repository.FindMembershipAsync(workspaceId, userId, cancellationToken);
        return membership?.Role is WorkspaceRole.Owner;
    }
}
