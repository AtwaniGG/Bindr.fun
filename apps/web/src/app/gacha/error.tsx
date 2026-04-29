'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function GachaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[gacha] route error:', error);
  }, [error]);

  return (
    <main className="min-h-screen pt-24 pb-16 px-4 flex items-center justify-center">
      <div className="glass max-w-md w-full p-8 text-center space-y-4">
        <p className="data-label">SOMETHING_WENT_WRONG</p>
        <h1 className="text-xl font-bold">We hit a snag loading the gacha.</h1>
        <p className="text-sm text-[var(--text-muted)]">
          {error?.message?.slice(0, 200) || 'Unknown error.'}
        </p>
        <div className="flex gap-2 justify-center pt-2">
          <button onClick={reset} className="btn-lime">Try again</button>
          <Link href="/" className="btn-ghost">Home</Link>
        </div>
      </div>
    </main>
  );
}
