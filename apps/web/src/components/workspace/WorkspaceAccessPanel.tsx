'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createShareLink,
  createWorkspaceMember,
  listShareLinks,
  listWorkspaceMembers,
  revokeShareLink,
  type CreatedShareLink,
  type ShareLinkMeta,
  type WorkspaceMemberItem,
} from '@/lib/gateway/client';
import { useAuthStore } from '@/stores/auth-store';

interface WorkspaceAccessPanelProps {
  workspaceId: string;
}

export function WorkspaceAccessPanel({ workspaceId }: WorkspaceAccessPanelProps) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<WorkspaceMemberItem[]>([]);
  const [links, setLinks] = useState<ShareLinkMeta[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [memberRole, setMemberRole] = useState<'editor' | 'viewer'>('editor');
  const [shareRole, setShareRole] = useState<'editor' | 'viewer'>('editor');
  const [latestLink, setLatestLink] = useState<CreatedShareLink | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!accessToken) return;
    const [memberList, linkList] = await Promise.all([
      listWorkspaceMembers(workspaceId, accessToken),
      listShareLinks(workspaceId, accessToken),
    ]);
    setMembers(memberList);
    setLinks(linkList);
  }, [accessToken, workspaceId]);

  useEffect(() => {
    if (!open || !accessToken) return;
    let cancelled = false;
    void (async () => {
      const [memberList, linkList] = await Promise.all([
        listWorkspaceMembers(workspaceId, accessToken),
        listShareLinks(workspaceId, accessToken),
      ]);
      if (cancelled) return;
      setMembers(memberList);
      setLinks(linkList);
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, open, workspaceId]);

  async function handleCreateMember(event: React.FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await createWorkspaceMember(workspaceId, accessToken, {
      email: email.trim(),
      password,
      role: memberRole,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEmail('');
    setPassword('');
    setMessage(`Added ${result.data.email} as ${result.data.role}.`);
    await refresh();
  }

  async function handleCreateShareLink() {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await createShareLink(workspaceId, accessToken, shareRole);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLatestLink(result.data);
    setMessage(result.data.note);
    await refresh();
    try {
      await navigator.clipboard.writeText(result.data.url);
      setMessage(`${result.data.note} Link copied.`);
    } catch {
      // ignore clipboard errors
    }
  }

  async function handleRevoke(role: 'editor' | 'viewer') {
    if (!accessToken) return;
    setBusy(true);
    await revokeShareLink(workspaceId, accessToken, role);
    if (latestLink?.role === role) setLatestLink(null);
    setMessage(`Revoked ${role} share link.`);
    setBusy(false);
    await refresh();
  }

  return (
    <div className="border-b border-border bg-muted/20">
      <div className="flex items-center justify-between px-4 py-2">
        <div>
          <p className="text-xs font-medium">Access & sharing</p>
          <p className="text-[11px] text-muted-foreground">
            Create users, share role-based invite URLs, regenerate to lock out old links.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((value) => !value)}>
          {open ? 'Hide' : 'Manage'}
        </Button>
      </div>

      {open && (
        <div className="grid gap-4 border-t border-border px-4 py-4 md:grid-cols-2">
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Members
            </h2>
            <ul className="space-y-1 text-xs">
              {members.map((member) => (
                <li
                  key={member.userId}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-2 py-1.5"
                >
                  <span className="truncate">{member.email}</span>
                  <span className="ml-2 shrink-0 font-medium capitalize text-muted-foreground">
                    {member.role}
                  </span>
                </li>
              ))}
            </ul>

            <form onSubmit={(event) => void handleCreateMember(event)} className="space-y-2 rounded-xl border border-border bg-card p-3">
              <p className="text-xs font-medium">Create or invite user</p>
              <div className="space-y-1">
                <Label htmlFor="member-email" className="text-[11px]">
                  Email
                </Label>
                <Input
                  id="member-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="member-password" className="text-[11px]">
                  Password
                </Label>
                <Input
                  id="member-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="member-role" className="text-[11px]">
                  Role
                </Label>
                <select
                  id="member-role"
                  className="flex h-8 w-full rounded-lg border border-border bg-background px-2 text-sm"
                  value={memberRole}
                  onChange={(event) => setMemberRole(event.target.value as 'editor' | 'viewer')}
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <Button type="submit" size="sm" disabled={busy} className="w-full">
                Add member
              </Button>
            </form>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Share links
            </h2>
            <p className="text-[11px] text-muted-foreground">
              URL shape: <span className="font-mono">/join/{'{workspace}'}/{'{role}'}/{'{token}'}</span>
              . Regenerating replaces the token so previous invites stop working.
            </p>

            <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
              <div className="min-w-[8rem] flex-1 space-y-1">
                <Label htmlFor="share-role" className="text-[11px]">
                  Access level
                </Label>
                <select
                  id="share-role"
                  className="flex h-8 w-full rounded-lg border border-border bg-background px-2 text-sm"
                  value={shareRole}
                  onChange={(event) => setShareRole(event.target.value as 'editor' | 'viewer')}
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <Button size="sm" disabled={busy} onClick={() => void handleCreateShareLink()}>
                Create / regenerate
              </Button>
            </div>

            {latestLink && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
                <p className="font-medium capitalize text-emerald-800 dark:text-emerald-200">
                  {latestLink.role} invite ready
                </p>
                <p className="mt-1 break-all font-mono text-[11px] text-foreground">{latestLink.url}</p>
              </div>
            )}

            <ul className="space-y-1 text-xs">
              {links.length === 0 ? (
                <li className="text-muted-foreground">No active share links.</li>
              ) : (
                links.map((link) => (
                  <li
                    key={link.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-2 py-1.5"
                  >
                    <span className="capitalize">{link.role}</span>
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy || (link.role !== 'editor' && link.role !== 'viewer')}
                      onClick={() => {
                        if (link.role === 'editor' || link.role === 'viewer') {
                          void handleRevoke(link.role);
                        }
                      }}
                    >
                      Revoke
                    </Button>
                  </li>
                ))
              )}
            </ul>
          </section>

          {(message || error) && (
            <div className="md:col-span-2">
              {message && <p className="text-xs text-muted-foreground">{message}</p>}
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
