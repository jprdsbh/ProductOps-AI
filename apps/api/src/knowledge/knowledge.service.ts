import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface UpsertKnowledgeInput {
  category: string;
  key: string;
  title?: string;
  content: string;
  data?: any;
  source: string;
  confidence?: number;
}

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(private prisma: PrismaService) {}

  private normalizeKey(key: string): string {
    return (key ?? '').trim().toLowerCase().slice(0, 250);
  }

  /**
   * Upsert por (category, key). Se já existe, mescla conteúdo, incrementa hitCount
   * e sobe a confiança gradualmente (aprendizado reforçado simples).
   */
  async upsert(input: UpsertKnowledgeInput) {
    const key = this.normalizeKey(input.key);
    if (!input.category || !key || !input.content) {
      return null;
    }

    const existing = await this.prisma.knowledgeEntry.findUnique({
      where: { category_key: { category: input.category, key } },
    });

    if (existing) {
      // Confiança sobe a cada reforço, com teto em 0.99
      const nextConfidence = Math.min(0.99, existing.confidence + 0.05);
      return this.prisma.knowledgeEntry.update({
        where: { id: existing.id },
        data: {
          title: input.title ?? existing.title,
          content: input.content || existing.content,
          data: input.data ?? (existing.data as any),
          confidence: input.confidence ?? nextConfidence,
          hitCount: { increment: 1 },
          lastUsedAt: new Date(),
        },
      });
    }

    return this.prisma.knowledgeEntry.create({
      data: {
        category: input.category,
        key,
        title: input.title ?? null,
        content: input.content,
        data: input.data ?? undefined,
        source: input.source,
        confidence: input.confidence ?? 0.5,
      },
    });
  }

  /**
   * Busca por categoria + termo (substring em key/title/content), ordenado por
   * relevância (confiança × hits). Registra uso (lastUsedAt) dos retornados.
   */
  async query(opts: { category?: string; q?: string; limit?: number }) {
    const where: any = {};
    if (opts.category) where.category = opts.category;
    if (opts.q && opts.q.trim()) {
      const q = opts.q.trim();
      where.OR = [
        { key: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
        { content: { contains: q, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.knowledgeEntry.findMany({
      where,
      orderBy: [{ confidence: 'desc' }, { hitCount: 'desc' }, { lastUsedAt: 'desc' }],
      take: Math.min(opts.limit ?? 20, 100),
    });
    return rows;
  }

  /** Atalho usado internamente (ex.: pelo AiService) para achar a melhor rota de uma feature. */
  async findBestRoute(featureText: string): Promise<{ route: string; confidence: number } | null> {
    if (!featureText?.trim()) return null;
    const terms = featureText
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 4)
      .slice(0, 6);

    if (!terms.length) return null;

    const rows = await this.prisma.knowledgeEntry.findMany({
      where: {
        category: { in: ['route', 'navigation'] },
        OR: terms.flatMap((t) => [
          { key: { contains: t, mode: 'insensitive' } },
          { title: { contains: t, mode: 'insensitive' } },
          { content: { contains: t, mode: 'insensitive' } },
        ]),
      },
      orderBy: [{ confidence: 'desc' }, { hitCount: 'desc' }],
      take: 5,
    });

    for (const r of rows) {
      const data = (r.data as any) ?? {};
      const route = data.route ?? (r.category === 'route' ? r.key : null);
      if (route && typeof route === 'string' && route.startsWith('/')) {
        return { route, confidence: r.confidence };
      }
    }
    return null;
  }
}
