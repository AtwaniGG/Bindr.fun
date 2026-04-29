'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[global] route error:', error);
  }, [error]);

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-5">
      <div className="glass max-w-md w-full p-8 text-center space-y-4">
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'rgba(177,210,53,0.55)',
          }}
        >
          SOMETHING_WENT_WRONG
        </p>
        <h1 className="text-xl font-bold" style={{ color: 'rgba(255,255,255,0.85)' }}>
          We hit a snag.
        </h1>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {error?.message?.slice(0, 200) || 'Unknown error.'}
        </p>
        <div className="flex gap-2 justify-center pt-2">
          <button onClick={reset} className="btn-lime">Try again</button>
          <Link href="/" className="btn-ghost">Home</Link>
        </div>
      </div>
    </div>
  );
}
