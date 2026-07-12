'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth-store';

export function AuthNav() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  if (!user) return null;

  function handleLogout() {
    logout();
    router.replace('/login');
  }

  return (
    <div className="ml-auto flex items-center gap-3">
      <span className="hidden text-xs text-muted-foreground sm:inline">{user.email}</span>
      <Link href="/workspaces">
        <Button variant="ghost" size="sm">
          Workspaces
        </Button>
      </Link>
      <Button variant="outline" size="sm" onClick={handleLogout}>
        Sign out
      </Button>
    </div>
  );
}
