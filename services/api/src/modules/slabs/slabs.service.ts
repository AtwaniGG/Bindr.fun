import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@pokedex-slabs/shared';

export type SortOption =
  | 'price_asc'
  | 'price_desc'
  | 'card_number'
  | 'name_asc'
  | 'name_desc'
  | 'pokedex'
  | 'rarity';

export interface SlabsQuery {
  ownerAddress: string;
  set?: string;
  q?: string;
  grade?: string;
  sort?: SortOption;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class SlabsService {
  constructor(private prisma: PrismaService) {}

  async getSlabsByOwner(query: SlabsQuery) {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, query.pageSize || DEFAULT_PAGE_SIZE);
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {
      assetRaw: { ownerAddress: query.ownerAddress },
    };

    if (query.set) {
      (where as Record<string, unknown>).setName = query.set;
    }
    if (query.grade) {
      (where as Record<string, unknown>).grade = query.grade;
    }
    if (query.q) {
      (where as Record<string, unknown>).OR = [
        { cardName: { contains: query.q, mode: 'insensitive' } },
        { certNumber: { contains: query.q, mode: 'insensitive' } },
        { setName: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    // DB-level sorts that Prisma can handle directly
    const dbSortMap: Record<string, Record<string, string>[]> = {
      card_number: [{ cardNumber: 'asc' }],
      name_asc: [{ cardName: 'asc' }],
      name_desc: [{ cardName: 'desc' }],
      pokedex: [{ dexId: 'asc' }],
    };

    const inMemorySort = query.sort === 'price_asc' || query.sort === 'price_desc' || query.sort === 'rarity';
    const dbSort = query.sort && dbSortMap[query.sort];

    const [allSlabs, total] = await Promise.all([
      this.prisma.slab.findMany({
        where,
        include: {
          slabPrice: true,
        },
        orderBy: inMemorySort
          ? undefined
          : dbSort ?? [{ createdAt: 'desc' }],
        skip: inMemorySort ? undefined : skip,
        take: inMemorySort ? undefined : pageSize,
      }),
      this.prisma.slab.count({ where }),
    ]);

    const mapped = allSlabs.map((slab) => ({
      id: slab.id,
      certNumber: slab.certNumber,
      grader: slab.grader,
      grade: slab.grade,
      setName: slab.setName,
      cardName: slab.cardName,
      cardNumber: slab.cardNumber,
      variant: slab.variant,
      imageUrl: slab.imageUrl,
      parseStatus: slab.parseStatus,
      platform: slab.platform,
      dexId: slab.dexId,
      rarity: slab.rarity,
      cardType: slab.cardType,
      marketPrice: slab.slabPrice?.priceUsd ? Number(slab.slabPrice.priceUsd) : null,
      priceCurrency: slab.slabPrice?.priceUsd ? 'USD' : null,
      priceRetrievedAt: slab.slabPrice?.updatedAt ?? null,
    }));

    if (inMemorySort) {
      if (query.sort === 'price_asc' || query.sort === 'price_desc') {
        mapped.sort((a: any, b: any) => {
          const aPrice = a.marketPrice ?? (query.sort === 'price_asc' ? Infinity : -1);
          const bPrice = b.marketPrice ?? (query.sort === 'price_asc' ? Infinity : -1);
          return query.sort === 'price_asc' ? aPrice - bPrice : bPrice - aPrice;
        });
      } else if (query.sort === 'rarity') {
        const rarityOrder: Record<string, number> = {
          'Secret Rare': 0, 'Illustration Rare': 1, 'Special Art Rare': 2,
          'Ultra Rare': 3, 'Rare Holo VMAX': 4, 'Rare Holo V': 5,
          'Double Rare': 6, 'Rare Holo': 7, 'Rare': 8,
          'Uncommon': 9, 'Common': 10, 'None': 11,
        };
        mapped.sort((a: any, b: any) => {
          const aR = a.rarity ? (rarityOrder[a.rarity] ?? 8) : 99;
          const bR = b.rarity ? (rarityOrder[b.rarity] ?? 8) : 99;
          return aR - bR;
        });
      }
    }

    const data = inMemorySort ? mapped.slice(skip, skip + pageSize) : mapped;

    return {
      data,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getSlabsGroupedBySets(ownerAddress: string) {
    // Fetch all slabs for this owner in one query
    const slabs = await this.prisma.slab.findMany({
      where: { assetRaw: { ownerAddress } },
      include: {
        slabPrice: true,
      },
      orderBy: [{ setName: 'asc' }, { cardNumber: 'asc' }],
    });

    // Get set reference data for totalCards
    const setNames = [...new Set(
      slabs.map((s: any) => s.setName).filter((n: any): n is string => n !== null),
    )];
    const setRefs = await this.prisma.setReference.findMany({
      where: { setName: { in: setNames } },
    });
    const refMap = new Map(setRefs.map((r: any) => [r.setName, r]));

    // Group slabs by setName
    const groupMap = new Map<string | null, typeof slabs>();
    for (const slab of slabs) {
      const key = slab.setName;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(slab);
    }

    const mapSlab = (slab: (typeof slabs)[0]) => ({
      id: slab.id,
      certNumber: slab.certNumber,
      grader: slab.grader,
      grade: slab.grade,
      setName: slab.setName,
      cardName: slab.cardName,
      cardNumber: slab.cardNumber,
      variant: slab.variant,
      imageUrl: slab.imageUrl,
      parseStatus: slab.parseStatus,
      platform: slab.platform,
      marketPrice: slab.slabPrice?.priceUsd ? Number(slab.slabPrice.priceUsd) : null,
      priceCurrency: slab.slabPrice?.priceUsd ? 'USD' : null,
      priceRetrievedAt: slab.slabPrice?.updatedAt ?? null,
    });

    const groups: {
      setName: string | null;
      ownedCount: number;
      totalCards: number;
      completionPct: number;
      slabs: ReturnType<typeof mapSlab>[];
    }[] = [];

    for (const [setName, setSlabs] of groupMap) {
      if (setName === null) continue; // handle uncategorized separately
      const ref: any = refMap.get(setName);
      const totalCards = ref?.totalCards ?? 0;
      // Count unique cards by cardNumber (duplicate graded copies shouldn't inflate completion)
      const uniqueCards = new Set(
        setSlabs.map((s: any) => s.cardNumber).filter((n: any): n is string => n !== null),
      );
      const ownedCount = uniqueCards.size > 0 ? uniqueCards.size : setSlabs.length;
      groups.push({
        setName,
        ownedCount,
        totalCards,
        completionPct: totalCards > 0 ? Math.round((ownedCount / totalCards) * 10000) / 100 : 0,
        slabs: setSlabs.map(mapSlab),
      });
    }

    // Sort: completed first, then by completionPct DESC
    groups.sort((a, b) => {
      const aComplete = a.completionPct === 100 ? 1 : 0;
      const bComplete = b.completionPct === 100 ? 1 : 0;
      if (aComplete !== bComplete) return bComplete - aComplete;
      return b.completionPct - a.completionPct;
    });

    // Append uncategorized at the end
    const uncategorized = groupMap.get(null);
    if (uncategorized && uncategorized.length > 0) {
      groups.push({
        setName: null,
        ownedCount: uncategorized.length,
        totalCards: 0,
        completionPct: 0,
        slabs: uncategorized.map(mapSlab),
      });
    }

    return groups;
  }

  async getSlabById(id: string) {
    return this.prisma.slab.findUnique({
      where: { id },
      include: {
        assetRaw: true,
        slabPrice: true,
      },
    });
  }
}
