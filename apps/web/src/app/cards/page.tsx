'use client';

import dynamic from 'next/dynamic';

const CardsClient = dynamic(() => import('./cards-client'), {
  ssr: false,
  loading: () => (
    <main className="min-h-screen pt-24 pb-16 px-4 flex items-center justify-center">
      <div className="text-[var(--text-muted)] text-sm">Loading...</div>
    </main>
  ),
});

export default function CardsPage() {
  return <CardsClient />;
}
