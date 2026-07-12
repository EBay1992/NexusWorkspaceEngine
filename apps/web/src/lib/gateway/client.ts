const TOKEN_KEY = 'orbit.accessToken';

export interface LoginResponse {
  accessToken: string;
  expiresAt: string;
}

export interface WsTicketResponse {
  ticket: string;
  expiresAt: string;
  relayUrl: string;
}

export interface AuthUser {
  userId: string;
  email: string;
}

export interface WorkspaceListItem {
  id: string;
  title: string;
  role: 'owner' | 'editor' | 'viewer';
}

function gatewayUrl(): string | null {
  if (process.env.NEXT_PUBLIC_GATEWAY_URL) {
    return process.env.NEXT_PUBLIC_GATEWAY_URL;
  }
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:5080';
  }
  return null;
}

export function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function storeAccessToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export async function login(
  email: string,
  password: string,
): Promise<{ ok: true; data: LoginResponse } | { ok: false; error: string }> {
  const base = gatewayUrl();
  if (!base) {
    return { ok: false, error: 'Gateway URL is not configured.' };
  }

  try {
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (response.status === 401) {
      return { ok: false, error: 'Invalid email or password.' };
    }

    if (!response.ok) {
      return { ok: false, error: 'Login failed. Please try again.' };
    }

    const data = (await response.json()) as LoginResponse;
    storeAccessToken(data.accessToken);
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Cannot reach the gateway. Is it running?' };
  }
}

export async function fetchCurrentUser(accessToken: string): Promise<AuthUser | null> {
  const base = gatewayUrl();
  if (!base) return null;

  try {
    const response = await fetch(`${base}/api/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) return null;
    return (await response.json()) as AuthUser;
  } catch {
    return null;
  }
}

export async function fetchWorkspace(
  workspaceId: string,
  accessToken: string,
): Promise<WorkspaceListItem | null> {
  const base = gatewayUrl();
  if (!base) return null;

  try {
    const response = await fetch(`${base}/api/workspaces/${encodeURIComponent(workspaceId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) return null;
    return (await response.json()) as WorkspaceListItem;
  } catch {
    return null;
  }
}

export async function listWorkspaces(accessToken: string): Promise<WorkspaceListItem[]> {
  const base = gatewayUrl();
  if (!base) return [];

  try {
    const response = await fetch(`${base}/api/workspaces`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) return [];
    return (await response.json()) as WorkspaceListItem[];
  } catch {
    return [];
  }
}

export async function fetchWsTicket(
  workspaceId: string,
  accessToken: string,
): Promise<WsTicketResponse | null> {
  const base = gatewayUrl();
  if (!base) return null;

  try {
    const response = await fetch(`${base}/api/workspaces/${encodeURIComponent(workspaceId)}/ws-ticket`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) return null;
    return (await response.json()) as WsTicketResponse;
  } catch {
    return null;
  }
}

export async function fetchFreshWsTicket(workspaceId: string): Promise<string | undefined> {
  const accessToken = getStoredAccessToken();
  if (!accessToken) return undefined;

  const ticketResponse = await fetchWsTicket(workspaceId, accessToken);
  return ticketResponse?.ticket;
}

export async function uploadSnapshot(
  workspaceId: string,
  accessToken: string,
  gzipPayload: Uint8Array,
): Promise<boolean> {
  const base = gatewayUrl();
  if (!base) return false;

  try {
    const response = await fetch(`${base}/api/workspaces/${encodeURIComponent(workspaceId)}/snapshots`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Encoding': 'gzip',
      },
      body: new Uint8Array(gzipPayload),
    });

    return response.status === 202;
  } catch {
    return false;
  }
}
