'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DEMO_ACCOUNTS } from '@/lib/demo-accounts';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';

export function LoginForm() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await login(email.trim(), password);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.replace('/workspaces');
  }

  async function signInWithDemo(demoEmail: string, demoPassword: string) {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError(null);
    setSubmitting(true);
    const result = await login(demoEmail, demoPassword);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace('/workspaces');
  }

  return (
    <div className="w-full max-w-sm space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="text-xs font-medium text-foreground">Try a role</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Three seeded accounts — click to sign in instantly.
        </p>
        <div className="mt-3 grid gap-2">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              disabled={submitting}
              onClick={() => void signInWithDemo(account.email, account.password)}
              className={cn(
                'flex w-full items-start justify-between gap-3 rounded-xl border border-border px-3 py-2 text-left transition-colors',
                'hover:bg-muted/50 disabled:opacity-50',
              )}
            >
              <div>
                <p className="text-sm font-medium">{account.label}</p>
                <p className="text-[11px] text-muted-foreground">{account.description}</p>
              </div>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{account.email}</span>
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>

        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}
