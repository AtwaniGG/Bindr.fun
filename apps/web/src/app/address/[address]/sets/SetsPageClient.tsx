'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import type { SetProgressItem } from '@/lib/api';
import SetCard from '@/components/SetCard';

interface Props {
  sets: SetProgressItem[];
  address: string;
}

type LangTab = 'all' | 'en' | 'ja';

export default function SetsPageClient({ sets, address }: Props) {
  const [activeTab, setActiveTab] = useState<LangTab>('all');

  const enCount = sets.filter((s) => s.language === 'en').length;
  const jaCount = sets.filter((s) => s.language !== 'en').length;
  const hasMultipleLangs = enCount > 0 && jaCount > 0;

  const filtered = useMemo(() => {
    if (activeTab === 'en') return sets.filter((s) => s.language === 'en');
    if (activeTab === 'ja') return sets.filter((s) => s.language !== 'en');
    return sets;
  }, [sets, activeTab]);

  const sortByCompletion = (arr: SetProgressItem[]) =>
    [...arr].sort((a, b) => {
      const aComplete = a.completionPct === 100 ? 1 : 0;
      const bComplete = b.completionPct === 100 ? 1 : 0;
      if (aComplete !== bComplete) return bComplete - aComplete;
      return b.completionPct - a.completionPct;
    });

  const mainSets = useMemo(() => sortByCompletion(filtered.filter((s) => !!s.logoUrl)), [filtered]);
  const otherSets = useMemo(() => sortByCompletion(filtered.filter((s) => !s.logoUrl)), [filtered]);

  const completedSets = filtered.filter((s) => s.completionPct === 100).length;
  const totalOwned = filtered.reduce((acc, s) => acc + s.ownedCount, 0);
  const totalCards = filtered.reduce((acc, s) => acc + s.totalCards, 0);
  const overallPct = totalCards > 0 ? Math.round((totalOwned / totalCards) * 100) : 0;

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 animate-fade-in">
      {/* Back */}
      <Link
        href={`/address/${address}`}
        className="inline-flex items-center gap-1.5 mb-8 transition-all duration-200 hover:gap-2.5"
        style={{ color: 'rgba(255,255,255,0.35)', fontSize: '13px' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to dashboard
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-4xl sm:text-5xl font-black"
          style={{ letterSpacing: '-0.04em', color: 'rgba(255,255,255,0.95)' }}
        >
          Set <span className="text-gradient">Dex</span>
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.35)', marginTop: '6px', fontSize: '14px' }}>
          Your Pokemon set collection tracker
        </p>
      </div>

      {/* Language Toggle */}
      {hasMultipleLangs && (
        <div className="mb-8">
          <div className="lang-toggle">
            <button
              className={activeTab === 'all' ? 'active' : ''}
              onClick={() => setActiveTab('all')}
            >
              All ({sets.length})
            </button>
            <button
              className={activeTab === 'en' ? 'active' : ''}
              onClick={() => setActiveTab('en')}
            >
              English ({enCount})
            </button>
            <button
              className={activeTab === 'ja' ? 'active' : ''}
              onClick={() => setActiveTab('ja')}
            >
              Japanese ({jaCount})
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-12">
        <div className="stat-card text-center">
          <p className="text-3xl sm:text-4xl font-black tabular-nums" style={{ color: 'rgba(255,255,255,0.92)' }}>{filtered.length}</p>
          <p style={{ color: 'rgba(255,255,255,0.30)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '4px' }}>Sets</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-3xl sm:text-4xl font-black tabular-nums" style={{ color: '#22c55e' }}>{completedSets}</p>
          <p style={{ color: 'rgba(255,255,255,0.30)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '4px' }}>Completed Sets</p>
        </div>
        <div className="stat-card text-center">
          <p className="text-3xl sm:text-4xl font-black tabular-nums" style={{ color: '#F5B94B' }}>{overallPct}%</p>
          <p style={{ color: 'rgba(255,255,255,0.30)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '4px' }}>Overall</p>
        </div>
      </div>

      {/* Main Sets Grid */}
      {mainSets.length === 0 && otherSets.length === 0 ? (
        <div className="glass-card text-center py-16 px-8">
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '16px' }}>No sets found</p>
          <p style={{ color: 'rgba(255,255,255,0.22)', fontSize: '13px', marginTop: '8px' }}>
            Set data will appear once slabs are indexed and parsed.
          </p>
        </div>
      ) : (
        <>
          {mainSets.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
              {mainSets.map((set, i) => (
                <div
                  key={set.setName}
                  className="stagger-item"
                  style={{ animationDelay: `${Math.min(i * 60, 600)}ms` }}
                >
                  <SetCard set={set} address={address} />
                </div>
              ))}
            </div>
          )}

          {/* Other Sets */}
          {otherSets.length > 0 && (
            <div className="mt-14">
              <h2 className="section-header mb-6">
                Other
                <span style={{ color: 'rgba(255,255,255,0.30)', fontSize: '14px', fontWeight: 500, marginLeft: '10px' }}>
                  {otherSets.length}
                </span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
                {otherSets.map((set, i) => (
                  <div
                    key={set.setName}
                    className="stagger-item"
                    style={{ animationDelay: `${Math.min(i * 60, 600)}ms` }}
                  >
                    <SetCard set={set} address={address} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
