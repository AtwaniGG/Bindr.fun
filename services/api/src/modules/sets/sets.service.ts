import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SetsService {
  constructor(private prisma: PrismaService) {}

  async getSetProgressByOwner(ownerAddress: string) {
    // Fetch all slabs with cardNumber + imageUrl for set previews
    const slabs = await this.prisma.slab.findMany({
      where: {
        assetRaw: { ownerAddress },
        setName: { not: null },
      },
      select: { setName: true, cardNumber: true, imageUrl: true, language: true },
    });

    // Group slabs by normalized setName (case/whitespace-insensitive) to merge duplicates
    const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    const setMap = new Map<
      string,
      { displayName: string; cardNumbers: Set<string>; totalSlabs: number; firstImage: string | null; language: string }
    >();
    for (const slab of slabs) {
      const key = normalize(slab.setName!);
      if (!setMap.has(key))
        setMap.set(key, { displayName: slab.setName!, cardNumbers: new Set(), totalSlabs: 0, firstImage: null, language: slab.language });
      const entry = setMap.get(key)!;
      entry.totalSlabs++;
      if (slab.cardNumber) entry.cardNumbers.add(slab.cardNumber);
      if (!entry.firstImage && slab.imageUrl) entry.firstImage = slab.imageUrl;
    }

    // Get total cards for each set from reference data (normalized match)
    const allRefs = await this.prisma.setReference.findMany();
    const refMap = new Map(allRefs.map((r: any) => [normalize(r.setName), r]));

    return [...setMap.entries()].map(([, entry]) => {
      const setName = entry.displayName;
      const ref: any = refMap.get(normalize(setName));
      const totalCards = ref?.totalCards ?? 0;
      // Use unique card count if available, else fall back to slab count
      const ownedCount = entry.cardNumbers.size > 0 ? entry.cardNumbers.size : entry.totalSlabs;
      return {
        setName,
        ownedCount,
        totalCards,
        completionPct: totalCards > 0 ? Math.round((ownedCount / totalCards) * 10000) / 100 : 0,
        releaseYear: ref?.releaseYear ?? null,
        generation: ref?.generation ?? null,
        logoUrl: ref?.logoUrl ?? null,
        symbolUrl: ref?.symbolUrl ?? null,
        previewImageUrl: ref?.logoUrl ? null : entry.firstImage,
        language: ref?.language ?? entry.language ?? 'en',
      };
    });
  }

  async getSetDetailForOwner(ownerAddress: string, setName: string) {
    const setRef = await this.prisma.setReference.findUnique({
      where: { setName },
      include: {
        cards: { orderBy: { cardNumber: 'asc' } },
      },
    });

    if (!setRef) return null;

    const slabs = await this.prisma.slab.findMany({
      where: {
        assetRaw: { ownerAddress },
        setName,
      },
      include: {
        prices: { orderBy: { retrievedAt: 'desc' }, take: 1 },
      },
      orderBy: { cardNumber: 'asc' },
    });

    const normalize = (n: string) => n.replace(/^0+/, '') || '0';
    const ownedCardNumbers = new Set(
      slabs
        .map((s: any) => (s.cardNumber ? normalize(s.cardNumber) : null))
        .filter((n: any): n is string => n !== null),
    );

    const ownedCards = slabs.map((slab: any) => ({
      id: slab.id,
      certNumber: slab.certNumber,
      grader: slab.grader,
      grade: slab.grade,
      cardName: slab.cardName,
      cardNumber: slab.cardNumber,
      variant: slab.variant,
      imageUrl: slab.imageUrl,
      parseStatus: slab.parseStatus,
      platform: slab.platform,
      marketPrice: slab.prices[0]?.marketPrice
        ? Number(slab.prices[0].marketPrice)
        : null,
      priceCurrency: slab.prices[0]?.currency ?? null,
      priceRetrievedAt: slab.prices[0]?.retrievedAt ?? null,
    }));

    const neededCards = setRef.cards
      .filter((card: any) => !ownedCardNumbers.has(normalize(card.cardNumber)))
      .map((card: any) => ({
        ptcgCardId: card.ptcgCardId,
        cardName: card.cardName,
        cardNumber: card.cardNumber,
        imageSmall: card.imageSmall,
        imageLarge: card.imageLarge,
      }));

    return {
      setName: setRef.setName,
      series: setRef.series,
      totalCards: setRef.totalCards,
      releaseYear: setRef.releaseYear,
      logoUrl: setRef.logoUrl,
      symbolUrl: setRef.symbolUrl,
      ownedCount: ownedCardNumbers.size,
      completionPct:
        setRef.totalCards > 0
          ? Math.round((ownedCardNumbers.size / setRef.totalCards) * 10000) / 100
          : 0,
      ownedCards,
      neededCards,
    };
  }
}
