import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme/theme-toggle';

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ThemeToggle size="icon" />
      </div>
      <div className="max-w-lg space-y-3 text-center">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Orbit</p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          Local-first workspace canvas
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
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
