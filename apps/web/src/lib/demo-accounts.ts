export type WorkspaceRole = 'owner' | 'editor' | 'viewer';

export interface DemoAccount {
  label: string;
  email: string;
  password: string;
  role: WorkspaceRole;
  description: string;
}

/** Seeded demo accounts (password: demo) — always available for try-out. */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    label: 'Owner',
    email: 'owner@orbit.local',
    password: 'demo',
    role: 'owner',
    description: 'Full access, share & member management',
  },
  {
    label: 'Editor',
    email: 'editor@orbit.local',
    password: 'demo',
    role: 'editor',
    description: 'Can edit the canvas',
  },
  {
    label: 'Viewer',
    email: 'viewer@orbit.local',
    password: 'demo',
    role: 'viewer',
    description: 'Read-only canvas',
  },
];
