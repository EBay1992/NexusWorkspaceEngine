import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="max-w-lg space-y-3 text-center">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Orbit</p>
        <h1 className="text-3xl font-semibold tracking-tight">Local-first workspace canvas</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Y.js CRDT state with IndexedDB persistence. Sign in through the gateway for relay sync and
          server snapshots.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/login">
          <Button size="lg">Sign in</Button>
        </Link>
        <Link href="/workspaces">
          <Button size="lg" variant="outline">
            Your workspaces
          </Button>
        </Link>
      </div>
    </main>
  );
}
