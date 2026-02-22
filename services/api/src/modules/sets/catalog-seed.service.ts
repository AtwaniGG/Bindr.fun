import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PokemonTcgService } from '../pokemon-tcg/pokemon-tcg.service';
import { POKELLECTOR_LOGOS, SET_TOTAL_CARDS } from '../../data/jp-sets';

// Skip re-seed if data was seeded within this window
const STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

@Injectable()
export class CatalogSeedService implements OnModuleInit {
  private readonly logger = new Logger(CatalogSeedService.name);

  constructor(
    private prisma: PrismaService,
    private pokemonTcgService: PokemonTcgService,
  ) {}

  async onModuleInit() {
    this.seed().catch((e) => this.logger.error(`Catalog seed failed: ${e}`));
    this.backfillTotalCards().catch((e) =>
      this.logger.error(`TotalCards backfill failed: ${e}`),
    );
    this.backfillSortMetadata().catch((e) =>
      this.logger.error(`Sort metadata backfill failed: ${e}`),
    );
  }

  async seed() {
    // Check staleness: if we already have sets with ptcgSetId, check the most
    // recently created CardReference to decide if we need to re-seed
    const recentCard = await this.prisma.cardReference.findFirst({
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    const setCount = await this.prisma.setReference.count({
      where: { ptcgSetId: { not: null } },
    });

    if (recentCard && setCount > 195) {
      this.logger.log(
        `Catalog already seeded (${setCount} sets, cards present). Skipping.`,
      );
      await this.backfillLogos();
      return;
    }

    this.logger.log('Seeding EN catalog from TCGdex API...');

    // --- Seed sets ---
    const sets = await this.pokemonTcgService.getAllSets();
    if (sets.length === 0) {
      this.logger.warn('TCGdex API returned no sets, aborting seed');
      return;
    }

    let seededSets = 0;
    for (const set of sets) {
      const releaseYear = set.releaseDate
        ? parseInt(set.releaseDate.split('-')[0], 10) || null
        : null;

      try {
        await this.prisma.setReference.upsert({
          where: { setName: set.name },
          create: {
            setName: set.name,
            ptcgSetId: set.id,
            series: set.series,
            totalCards: set.total,
            releaseYear,
            logoUrl: set.images?.logo ? `${set.images.logo}.png` : null,
            symbolUrl: set.images?.symbol ? `${set.images.symbol}.png` : null,
          },
          update: {
            ptcgSetId: set.id,
            series: set.series,
            totalCards: set.total,
            releaseYear,
            logoUrl: set.images?.logo ? `${set.images.logo}.png` : null,
            symbolUrl: set.images?.symbol ? `${set.images.symbol}.png` : null,
          },
        });
        seededSets++;
      } catch (e) {
        this.logger.debug(`Skipped set "${set.name}": ${e}`);
      }
    }
    this.logger.log(`Seeded ${seededSets} sets`);

    // Build a map from ptcgSetId → setReference for card seeding
    const setRefs = await this.prisma.setReference.findMany({
      where: { ptcgSetId: { not: null } },
      select: { id: true, ptcgSetId: true, setName: true },
    });
    const setRefMap = new Map(
      setRefs.map((r) => [r.ptcgSetId!, { id: r.id, setName: r.setName }]),
    );

    // --- Seed cards per set (more reliable than bulk fetch) ---
    let seededCards = 0;
    let setsProcessed = 0;
    for (const set of sets) {
      const ref = setRefMap.get(set.id);
      if (!ref) continue;

      // Skip sets we already have cards for
      const existingCount = await this.prisma.cardReference.count({
        where: { setRefId: ref.id },
      });
      if (existingCount >= set.total) {
        setsProcessed++;
        seededCards += existingCount;
        continue;
      }

      const cards = await this.pokemonTcgService.getCardsForSet(set.id);
      if (cards.length === 0) {
        setsProcessed++;
        continue;
      }

      const upserts = cards.map((card) =>
        this.prisma.cardReference.upsert({
          where: { ptcgCardId: card.id },
          create: {
            ptcgCardId: card.id,
            cardName: card.name,
            cardNumber: card.number,
            setRefId: ref.id,
            setName: ref.setName,
            imageSmall: card.images?.small ?? null,
            imageLarge: card.images?.large ?? null,
          },
          update: {
            cardName: card.name,
            cardNumber: card.number,
            setName: ref.setName,
            imageSmall: card.images?.small ?? null,
            imageLarge: card.images?.large ?? null,
          },
        }),
      );

      // Batch upserts in chunks to avoid overwhelming the DB
      const CHUNK = 50;
      for (let i = 0; i < upserts.length; i += CHUNK) {
        await Promise.all(upserts.slice(i, i + CHUNK));
      }
      seededCards += cards.length;
      setsProcessed++;

      if (setsProcessed % 25 === 0) {
        this.logger.log(
          `  ... ${setsProcessed}/${sets.length} sets, ${seededCards} cards`,
        );
      }
    }

    this.logger.log(
      `Catalog seed complete: ${seededSets} sets, ${seededCards} cards`,
    );
  }

  /** Backfill totalCards for sets with 0 using static SET_TOTAL_CARDS map. */
  private async backfillTotalCards() {
    const setsWithZero = await this.prisma.setReference.findMany({
      where: { totalCards: 0 },
      select: { id: true, setName: true },
    });

    if (setsWithZero.length === 0) return;

    this.logger.log(`Backfilling totalCards for ${setsWithZero.length} sets...`);

    let updated = 0;
    for (const dbSet of setsWithZero) {
      const total = SET_TOTAL_CARDS[dbSet.setName.toLowerCase()];
      if (total && total > 0) {
        try {
          await this.prisma.setReference.update({
            where: { id: dbSet.id },
            data: { totalCards: total },
          });
          updated++;
        } catch {
          // Skip conflicts
        }
      }
    }

    this.logger.log(`TotalCards backfill complete (${updated}/${setsWithZero.length} sets updated)`);
  }

  /** Backfill logoUrl for sets missing logos or with incorrect URLs (no .png extension). */
  private async backfillLogos() {
    const missing = await this.prisma.setReference.count({
      where: {
        OR: [
          { logoUrl: null },
          { logoUrl: { not: { endsWith: '.png' } } },
        ],
      },
    });
    if (missing === 0) return;

    this.logger.log(`Backfilling logos for ${missing} sets...`);

    // Use fast list endpoint (1 request) instead of fetching each set detail
    const setLogos = await this.pokemonTcgService.getAllSetLogos();

    // Build lookup maps by both id and name for maximum matching
    const logoById = new Map<string, typeof setLogos[0]>();
    const logoByName = new Map<string, typeof setLogos[0]>();
    for (const s of setLogos) {
      logoById.set(s.id, s);
      logoByName.set(s.name.toLowerCase(), s);
    }

    // Fetch all sets that need logos
    const setsNeedingLogos = await this.prisma.setReference.findMany({
      where: {
        OR: [
          { logoUrl: null },
          { logoUrl: { not: { endsWith: '.png' } } },
        ],
      },
      select: { id: true, setName: true, ptcgSetId: true },
    });

    // Also create SetReference records for slab set names that don't exist yet
    // (JP/specialty sets referenced by slabs but never seeded from TCGdex)
    const orphanSetNames: { set_name: string; language: string }[] = await this.prisma.$queryRaw`
      SELECT DISTINCT s.set_name, s.language
      FROM slabs s
      LEFT JOIN set_references sr ON sr.set_name = s.set_name
      WHERE s.set_name IS NOT NULL AND sr.id IS NULL
    `;
    if (orphanSetNames.length > 0) {
      this.logger.log(`Creating ${orphanSetNames.length} missing SetReference records...`);
      for (const row of orphanSetNames) {
        const name = row.set_name;
        const nameKey = name.toLowerCase();
        const pkLogo = POKELLECTOR_LOGOS[nameKey] ?? null;
        const totalCards = SET_TOTAL_CARDS[nameKey] ?? 0;
        try {
          await this.prisma.setReference.create({
            data: {
              setName: name,
              totalCards,
              logoUrl: pkLogo,
              language: row.language || 'en',
            },
          });
        } catch {
          // Already exists or other constraint
        }
      }
    }

    // Re-fetch after creating new records
    const allNeedingLogos = await this.prisma.setReference.findMany({
      where: {
        OR: [
          { logoUrl: null },
          { logoUrl: { not: { endsWith: '.png' } } },
        ],
      },
      select: { id: true, setName: true, ptcgSetId: true },
    });

    let updated = 0;
    for (const dbSet of allNeedingLogos) {
      // 1) Try TCGdex EN: match by ptcgSetId first, then by name
      const match =
        (dbSet.ptcgSetId ? logoById.get(dbSet.ptcgSetId) : null) ??
        logoByName.get(dbSet.setName.toLowerCase());

      if (match?.logo) {
        try {
          await this.prisma.setReference.update({
            where: { id: dbSet.id },
            data: {
              logoUrl: `${match.logo}.png`,
              symbolUrl: match.symbol ? `${match.symbol}.png` : null,
            },
          });
          updated++;
          continue;
        } catch {
          // Skip conflicts
        }
      }

      // 2) Fallback: Pokellector static mapping for JP/specialty sets
      const pokellectorLogo = POKELLECTOR_LOGOS[dbSet.setName.toLowerCase()];
      if (pokellectorLogo) {
        try {
          await this.prisma.setReference.update({
            where: { id: dbSet.id },
            data: { logoUrl: pokellectorLogo },
          });
          updated++;
        } catch {
          // Skip conflicts
        }
      }
    }
    this.logger.log(`Logo backfill complete (${updated} sets updated)`);
  }

  /**
   * Backfill dexId, rarity, and cardType on slabs using TCGdex EN + JP.
   * Matches by CardReference (ptcgCardId) first, then by name search.
   */
  private async backfillSortMetadata() {
    const slabsNeedingMeta = await this.prisma.slab.count({
      where: {
        cardName: { not: null },
        dexId: null,
      },
    });

    if (slabsNeedingMeta === 0) return;

    this.logger.log(
      `Backfilling sort metadata for ${slabsNeedingMeta} slabs...`,
    );

    // Load all CardReferences to map slab → ptcgCardId
    const cardRefs = await this.prisma.cardReference.findMany({
      select: { ptcgCardId: true, cardName: true, cardNumber: true, setName: true },
    });
    const refByNameSet = new Map<string, string>();
    const refByNumSet = new Map<string, string>();
    for (const ref of cardRefs) {
      refByNameSet.set(
        `${ref.cardName.toLowerCase()}|${ref.setName.toLowerCase()}`,
        ref.ptcgCardId,
      );
      refByNumSet.set(
        `${ref.cardNumber}|${ref.setName.toLowerCase()}`,
        ref.ptcgCardId,
      );
    }

    // Process slabs in batches
    const BATCH = 50;
    let offset = 0;
    let filled = 0;

    while (true) {
      const slabs = await this.prisma.slab.findMany({
        where: { cardName: { not: null }, dexId: null },
        select: { id: true, cardName: true, cardNumber: true, setName: true },
        take: BATCH,
        skip: offset,
      });
      if (slabs.length === 0) break;

      for (const slab of slabs) {
        const setKey = (slab.setName ?? '').toLowerCase();

        // Try matching via CardReference first (fast, uses cached TCGdex EN data)
        const ptcgCardId =
          refByNameSet.get(`${slab.cardName!.toLowerCase()}|${setKey}`) ??
          (slab.cardNumber ? refByNumSet.get(`${slab.cardNumber}|${setKey}`) : null);

        let meta: { dexId: number | null; rarity: string | null; cardType: string | null } | null = null;

        if (ptcgCardId) {
          const detail = await this.pokemonTcgService.getCardDetail(ptcgCardId);
          if (detail) {
            meta = {
              dexId: detail.dexId?.[0] ?? null,
              rarity: detail.rarity ?? null,
              cardType: detail.types?.[0] ?? null,
            };
          }
        }

        // Fallback: search TCGdex EN by name
        if (!meta) {
          meta = await this.pokemonTcgService.searchCardMetadata(
            slab.cardName!,
            slab.setName ?? undefined,
            slab.cardNumber ?? undefined,
          );
        }

        if (meta && (meta.dexId || meta.rarity || meta.cardType)) {
          await this.prisma.slab.update({
            where: { id: slab.id },
            data: {
              dexId: meta.dexId,
              rarity: meta.rarity,
              cardType: meta.cardType,
            },
          });
          filled++;
        } else {
          // Set dexId to 0 so we don't retry this slab
          await this.prisma.slab.update({
            where: { id: slab.id },
            data: { dexId: 0 },
          });
        }

        // Rate limit: TCGdex is free but be polite
        await new Promise((r) => setTimeout(r, 200));
      }

      this.logger.log(`  Sort metadata: ${filled} slabs filled so far...`);
      // Don't increment offset - we always query where dexId is null
    }

    this.logger.log(`Sort metadata backfill complete: ${filled} slabs filled`);
  }
}
