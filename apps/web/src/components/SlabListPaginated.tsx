'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SlabItem, PaginatedSlabs } from '@/lib/api';
import SlabCard from './SlabCard';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

type SortOption = '' | 'price_desc' | 'price_asc' | 'card_number' | 'name_asc' | 'name_desc' | 'pokedex' | 'rarity';

interface SlabListPaginatedProps {
  address: string;
  initialData: PaginatedSlabs;
}

export default function SlabListPaginated({ address, initialData }: SlabListPaginatedProps) {
  const [slabs, setSlabs] = useState<SlabItem[]>(initialData.data);
  const [page, setPage] = useState(initialData.pagination.page);
  const [total, setTotal] = useState(initialData.pagination.total);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<SortOption>('');
  const hasMore = slabs.length < total;

  async function fetchSlabs(sortVal: SortOption, pageNum: number, append: boolean) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(pageNum));
      if (sortVal) params.set('sort', sortVal);
      const res = await fetch(`${API_BASE}/public/address/${address}/slabs?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data: PaginatedSlabs = await res.json();
      setSlabs((prev) => append ? [...prev, ...data.data] : data.data);
      setPage(pageNum);
      setTotal(data.pagination.total);
    } catch (e) {
      console.error('Failed to load slabs:', e);
    } finally {
      setLoading(false);
    }
  }

  function handleSortChange(newSort: SortOption) {
    setSort(newSort);
    fetchSlabs(newSort, 1, false);
  }

  function loadMore() {
    fetchSlabs(sort, page + 1, true);
  }

  if (slabs.length === 0 && !loading) {
    return (
      <div className="glass-card text-center py-16 px-8">
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '16px' }}>No slabs found</p>
        <p style={{ color: 'rgba(255,255,255,0.22)', fontSize: '13px', marginTop: '8px' }}>
          This address may not own any Courtyard slabs, or indexing is still in progress.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Sort & count bar */}
      <div className="flex items-center justify-between mb-6">
        <p className="tabular-nums" style={{ color: 'rgba(255,255,255,0.25)', fontSize: '13px' }}>
          {total} {total === 1 ? 'slab' : 'slabs'}
        </p>
        <select
          value={sort}
          onChange={(e) => handleSortChange(e.target.value as SortOption)}
          className="glass-select"
        >
          <option value="">Newest First</option>
          <option value="price_desc">Price: High to Low</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="card_number">Card Number</option>
          <option value="name_asc">Name: A to Z</option>
          <option value="name_desc">Name: Z to A</option>
          <option value="pokedex">Pokedex Number</option>
          <option value="rarity">Rarity</option>
        </select>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {slabs.map((slab, i) => (
          <Link
            key={slab.id}
            href={`/address/${address}/slabs/${slab.id}`}
            className="stagger-item block"
            style={{ animationDelay: `${Math.min(i * 50, 500)}ms` }}
          >
            <SlabCard slab={slab} />
          </Link>
        ))}
      </div>

      {/* Pagination */}
      <div className="text-center mt-10">
        <p className="mb-4 tabular-nums" style={{ color: 'rgba(255,255,255,0.25)', fontSize: '13px' }}>
          Showing {slabs.length} of {total}
        </p>
        {hasMore && (
          <button
            onClick={loadMore}
            disabled={loading}
            className="explore-btn disabled:opacity-40"
          >
            <span>{loading ? 'Loading...' : 'Load More'}</span>
            {!loading && (
              <span className="arrow-circle">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12l7 7 7-7" />
                </svg>
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
