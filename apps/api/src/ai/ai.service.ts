import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { KnowledgeService } from '../knowledge/knowledge.service';

export interface GenerateReleaseNoteInput {
  title: string;
  description: string;
  category?: string;
  version?: string;
}

export interface GenerateReleaseNoteOutput {
  text: string;
  suggestedCapture: string;
  suggestedRoute: string;
  fromCache?: boolean;
}

const ROUTE_MAP = `
Rotas disponíveis no gateway TamboretePay (https://gateway.tamborete.com.br):
- /               → Dashboard principal
- /transactions   → Transações e pagamentos recebidos
- /payment-link   → Links de pagamento
- /payment-link/create → Criar link de pagamento
- /products       → Produtos e catálogo
- /templates      → Templates de checkout
- /balance        → Extrato e saldo
- /receipts       → Recibos
- /coupons        → Cupons de desconto
- /sales-funnel   → Funil de vendas
- /integrations   → Integrações
- /pixels         → Pixels de rastreamento
- /order-bump     → Order bump
- /sales          → Vendas
- /pix-agent      → Agente PIX
- /my-company     → Configurações da empresa
- /perfil         → Perfil do usuário
`.trim();

// System prompt com cache_control — cacheado pela Anthropic por 5min
// Reduz ~90% do custo de input em chamadas consecutivas
const SYSTEM_PROMPT = `Você é um Product Manager Especialista em Comunicação de Produto da TamboretePay, \
uma fintech de pagamentos B2B brasileira. Sua missão é transformar descrições técnicas de tarefas em \
Release Notes atraentes, claros e focados no valor para o usuário.

Tom de Voz:
- Profissional, direto e humano (estilo Fintech moderna)
- Entusiasmo moderado para novas funcionalidades
- Público: clientes B2B e parceiros da TamboretePay
- Foco no VALOR: não só o que mudou, mas por que é bom para o cliente

REGRAS DE ESCRITA OBRIGATÓRIAS:
- NUNCA use travessão (—) ou hífen como pontuação em meio de frase
- NUNCA escreva construções como "X — facilitando Y" ou "X — ideal para Y"
- Substitua por vírgulas, ponto final ou reescreva: "X. Isso facilita Y." ou "X, o que facilita Y."
- NUNCA use "sem X e com Y" após travessão
- Escreva frases curtas e diretas, como um humano falaria
- Sem jargões técnicos, sem nomes de arquivos, sem referências de banco de dados

Use emojis para categorizar (apenas um no título):
- 🚀 para feature (nova funcionalidade)
- 🛠️ para improvement ou performance (melhoria)
- 🐛 para bugfix (correção)
- 🔒 para security (segurança)

Estrutura OBRIGATÓRIA do campo "text":
1. Linha com emoji + título curto que transmite o benefício
2. Linha em branco
3. Resumo de 1 a 2 frases explicando o valor para o cliente
4. Linha em branco
5. **O que mudou**
6. Bullets com detalhes, usando **negrito** para destacar benefícios
7. Linha em branco
8. **Próximos Passos**
9. Frase curta indicando o que o usuário pode fazer agora
10. Linha em branco
11. ---
12. João Ribeiro - Product Manager
13. joao.ribeiro@tpay.com.br

Além do "text", gere dois campos extras:

"suggestedCapture": instrução curta de qual tela capturar para ilustrar o changelog (ex: "Abra Transações e tire um print da nova coluna Origem").

"suggestedRoute": a rota do gateway que corresponde à funcionalidade descrita, escolhida desta lista:
${ROUTE_MAP}
Retorne apenas o caminho, como "/transactions" ou "/products". Se nenhuma rota se encaixar, retorne "".

Responda SOMENTE em JSON válido, sem markdown externo, sem prefixos. Formato exato:
{"text":"...","suggestedCapture":"...","suggestedRoute":"..."}`;

const FEW_SHOT_EXAMPLES = `
Exemplos de entrada e saída esperada:

[ENTRADA]
Título: Split de pagamento entre múltiplos sellers em uma transação
Descrição: Implementa lógica de split para dividir automaticamente o valor de uma transação entre múltiplos lojistas cadastrados, com suporte a valores fixos ou percentuais por vendedor.
Categoria: feature
[SAÍDA]
{"text":"🚀 Divida pagamentos entre múltiplos lojistas automaticamente\\n\\nAgora uma única transação pode ser distribuída entre vários vendedores da sua plataforma. Você configura as regras de divisão e o sistema cuida do resto.\\n\\n**O que mudou**\\n- **Novo sistema de split de pagamento** disponível no fluxo de checkout\\n- Suporte a regras por **valor fixo ou percentual** por vendedor\\n- Ideal para marketplaces com múltiplos sellers operando na mesma conta\\n\\n**Próximos Passos**\\nAcesse Configurações, vá em Pagamentos e configure as regras de split para cada vendedor.\\n\\n---\\nJoão Ribeiro - Product Manager\\njoao.ribeiro@tpay.com.br","suggestedCapture":"Abra Configurações, vá em Pagamentos e tire um print do formulário de split.","suggestedRoute":"/transactions"}

[ENTRADA]
Título: Nova coluna Origem na página de transações e correção de campos
Descrição: Adicionada coluna Origem mostrando se o registro veio de Link de Pagamento, Checkout ou POS. Corrigidos campos de carteira, parcela e moeda que exibiam dados incorretos.
Categoria: feature
[SAÍDA]
{"text":"🚀 Saiba exatamente de onde veio cada transação\\n\\nA página de Transações ganhou uma nova coluna que identifica a origem de cada cobrança. Também corrigimos campos que exibiam informações erradas.\\n\\n**O que mudou**\\n- **Nova coluna Origem** indica se o registro veio de Link de Pagamento, Checkout ou Maquininha POS\\n- Campos de **carteira, parcelas e moeda** agora exibem os dados corretos\\n- Ícone PIX aparece corretamente junto da bandeira do método de pagamento\\n\\n**Próximos Passos**\\nAbra Transações e confira a nova coluna para entender melhor a distribuição dos seus canais de venda.\\n\\n---\\nJoão Ribeiro - Product Manager\\njoao.ribeiro@tpay.com.br","suggestedCapture":"Abra Transações e tire um print mostrando a nova coluna Origem.","suggestedRoute":"/transactions"}

[ENTRADA]
Título: Fix sessão derrubada ao renovar token
Descrição: Corrigido erro que forçava relogin quando o refresh token expirava inesperadamente.
Categoria: bugfix
[SAÍDA]
{"text":"🐛 Fim das desconexões inesperadas\\n\\nCorrigimos uma falha que forçava usuários a fazer login novamente sem motivo aparente. A sessão agora se renova de forma estável.\\n\\n**O que mudou**\\n- **Renovação automática de sessão** funciona sem interrupções\\n- Eliminado o erro que causava **desconexões durante o uso**\\n- Experiência mais estável, sem perda de contexto no meio do trabalho\\n\\n**Próximos Passos**\\nNenhuma ação necessária. A correção já está ativa para todos os usuários.\\n\\n---\\nJoão Ribeiro - Product Manager\\njoao.ribeiro@tpay.com.br","suggestedCapture":"Abra o sistema e tire um print da tela inicial após o login.","suggestedRoute":"/"}
`.trim();

// Estimativa de tokens do system prompt + examples (para estatísticas)
const ESTIMATED_SYSTEM_TOKENS = 1200;

@Injectable()
export class AiService {
  private readonly client: Anthropic;
  private readonly logger = new Logger(AiService.name);
  private readonly model = 'claude-haiku-4-5-20251001';

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private knowledge: KnowledgeService,
  ) {
    this.client = new Anthropic({
      apiKey: this.config.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  /**
   * Cruza a sugestão da IA com a Base de Conhecimento compartilhada:
   * - Se o TBot/uso anterior já descobriu uma rota REAL pra essa feature, prefere ela.
   * - Grava o mapeamento feature→rota de volta na KB (reforço), pro TBot reusar.
   * Best-effort: nunca derruba a geração.
   */
  private async reconcileRouteWithKB(
    input: GenerateReleaseNoteInput,
    result: GenerateReleaseNoteOutput,
  ): Promise<GenerateReleaseNoteOutput> {
    try {
      const featureText = `${input.title} ${input.description}`.trim();
      const learned = await this.knowledge.findBestRoute(featureText);

      // Rota aprendida (de teste real) tem prioridade sobre o chute da IA
      if (learned?.route && learned.confidence >= 0.6) {
        result = { ...result, suggestedRoute: learned.route };
      }

      // Reforça/registra o mapeamento feature→rota na KB
      if (result.suggestedRoute && result.suggestedRoute.startsWith('/')) {
        await this.knowledge.upsert({
          category: 'route',
          key: result.suggestedRoute,
          title: input.title.slice(0, 120),
          content: `Feature: ${input.title}. Rota sugerida para changelog/captura: ${result.suggestedRoute}.`,
          data: { route: result.suggestedRoute, feature: input.title },
          source: 'release-agent',
        });
      }
    } catch (err) {
      this.logger.warn(`KB reconcile falhou (ignorado): ${err}`);
    }
    return result;
  }

  // ─── Hash do input para cache ───────────────────────────────────────────────

  buildInputHash(input: GenerateReleaseNoteInput): string {
    const normalized = [
      input.title.trim().toLowerCase(),
      input.description.trim().toLowerCase(),
      (input.category ?? '').trim().toLowerCase(),
      (input.version ?? '').trim().toLowerCase(),
    ].join('|');
    return createHash('sha256').update(normalized).digest('hex');
  }

  // ─── Geração com cache ──────────────────────────────────────────────────────

  async generateReleaseNote(
    input: GenerateReleaseNoteInput,
    opts: { force?: boolean } = {},
  ): Promise<GenerateReleaseNoteOutput> {
    const hash = this.buildInputHash(input);

    // 1. Verifica cache persistente no BD
    if (!opts.force) {
      const cached = await this.prisma.aiCache.findUnique({ where: { inputHash: hash } });
      if (cached) {
        this.logger.log(`Cache HIT: "${input.title.slice(0, 50)}" (usado ${cached.usageCount}x)`);

        // Incrementa contador e timestamp de uso
        await this.prisma.aiCache.update({
          where: { id: cached.id },
          data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
        });

        // Registra estatística
        await this.recordStat({ cacheHits: 1, tokensSaved: ESTIMATED_SYSTEM_TOKENS });

        return {
          text: cached.text,
          suggestedCapture: cached.suggestedCapture,
          suggestedRoute: cached.suggestedRoute,
          fromCache: true,
        };
      }
    }

    // 2. Cache miss → chama a API com prompt caching
    this.logger.log(`Cache MISS → API: "${input.title.slice(0, 50)}"`);
    let result = await this.callApi(input);

    // 2b. Cruza com a Base de Conhecimento (prefere rota real aprendida pelo TBot)
    result = await this.reconcileRouteWithKB(input, result);

    // 3. Armazena no cache para uso futuro
    await this.prisma.aiCache.upsert({
      where: { inputHash: hash },
      update: { text: result.text, suggestedCapture: result.suggestedCapture, suggestedRoute: result.suggestedRoute, lastUsedAt: new Date() },
      create: { inputHash: hash, text: result.text, suggestedCapture: result.suggestedCapture, suggestedRoute: result.suggestedRoute, model: this.model },
    });

    // 4. Registra estatística de chamada real
    await this.recordStat({ apiCalls: 1 });

    return { ...result, fromCache: false };
  }

  // ─── Bulk regenerate em batches (muito mais barato) ──────────────────────────
  //
  // Em vez de 1 chamada por nota (paga system prompt N vezes),
  // envia BATCH_SIZE notas por chamada → system prompt pago 1 vez por batch.
  // 223 notas = ~23 chamadas em vez de 223 → ~90% mais barato.

  private readonly BATCH_SIZE = 10;

  async regenerateDrafts(): Promise<{ processed: number; fromCache: number; fromApi: number; errors: number }> {
    const drafts = await this.prisma.releaseNote.findMany({
      where: { status: 'DRAFT', aiGenerated: '' },
      select: { id: true, rawTitle: true, rawDescription: true, category: true, version: true },
    });

    this.logger.log(`Bulk regenerate: ${drafts.length} DRAFTs — batch de ${this.BATCH_SIZE}`);

    let fromCache = 0, fromApi = 0, errors = 0;

    // Separa os que estão no cache dos que precisam de API
    const needsApi: typeof drafts = [];
    for (const draft of drafts) {
      const hash = this.buildInputHash({ title: draft.rawTitle, description: draft.rawDescription, category: draft.category ?? undefined, version: draft.version ?? undefined });
      const cached = await this.prisma.aiCache.findUnique({ where: { inputHash: hash } });
      if (cached) {
        await this.prisma.releaseNote.update({
          where: { id: draft.id },
          data: { aiGenerated: cached.text, suggestedCapture: cached.suggestedCapture || null, suggestedRoute: cached.suggestedRoute || null, status: 'PENDING_APPROVAL' },
        });
        await this.prisma.aiCache.update({ where: { id: cached.id }, data: { usageCount: { increment: 1 }, lastUsedAt: new Date() } });
        await this.recordStat({ cacheHits: 1, tokensSaved: ESTIMATED_SYSTEM_TOKENS });
        fromCache++;
      } else {
        needsApi.push(draft);
      }
    }

    this.logger.log(`Cache: ${fromCache} hits | API: ${needsApi.length} notas em ${Math.ceil(needsApi.length / this.BATCH_SIZE)} batches`);

    // Processa o restante em batches
    for (let i = 0; i < needsApi.length; i += this.BATCH_SIZE) {
      const batch = needsApi.slice(i, i + this.BATCH_SIZE);
      try {
        const results = await this.callApiBatch(batch.map(d => ({
          title: d.rawTitle,
          description: d.rawDescription,
          category: d.category ?? undefined,
          version: d.version ?? undefined,
        })));

        for (let j = 0; j < batch.length; j++) {
          const draft  = batch[j];
          const result = results[j];
          if (!result) { errors++; continue; }

          await this.prisma.releaseNote.update({
            where: { id: draft.id },
            data: { aiGenerated: result.text, suggestedCapture: result.suggestedCapture || null, suggestedRoute: result.suggestedRoute || null, status: 'PENDING_APPROVAL' },
          });

          // Salva no cache
          const hash = this.buildInputHash({ title: draft.rawTitle, description: draft.rawDescription, category: draft.category ?? undefined, version: draft.version ?? undefined });
          await this.prisma.aiCache.upsert({
            where: { inputHash: hash },
            update: { text: result.text, suggestedCapture: result.suggestedCapture, suggestedRoute: result.suggestedRoute, lastUsedAt: new Date() },
            create: { inputHash: hash, text: result.text, suggestedCapture: result.suggestedCapture, suggestedRoute: result.suggestedRoute, model: this.model },
          });

          fromApi++;
        }

        await this.recordStat({ apiCalls: 1 }); // 1 chamada por batch
      } catch (err) {
        this.logger.error(`Falha no batch ${i / this.BATCH_SIZE + 1}: ${err}`);
        errors += batch.length;
      }
    }

    this.logger.log(`Bulk done: ${fromCache} cache, ${fromApi} API, ${errors} erros`);
    return { processed: drafts.length, fromCache, fromApi, errors };
  }

  // ─── Regerar TUDO (limpa o cache e força nova geração) ───────────────────────
  // Apaga o AiCache e regenera todas as notas pendentes/rascunho via API (sem cache).
  // Usar quando o prompt/regras mudaram e você quer conteúdo fresco em todas.

  async regenerateAll(): Promise<{ processed: number; fromApi: number; errors: number; cacheCleared: number }> {
    const cacheCleared = await this.prisma.aiCache.count();
    await this.prisma.aiCache.deleteMany({});
    this.logger.log(`Regerar TUDO: cache limpo (${cacheCleared} entradas).`);

    const notes = await this.prisma.releaseNote.findMany({
      where: { status: { in: ['PENDING_APPROVAL', 'DRAFT'] } },
      select: { id: true, rawTitle: true, rawDescription: true, category: true, version: true },
    });
    this.logger.log(`Regerar TUDO: ${notes.length} notas em batches de ${this.BATCH_SIZE}`);

    let fromApi = 0, errors = 0;
    for (let i = 0; i < notes.length; i += this.BATCH_SIZE) {
      const batch = notes.slice(i, i + this.BATCH_SIZE);
      try {
        const results = await this.callApiBatch(batch.map(d => ({
          title: d.rawTitle, description: d.rawDescription,
          category: d.category ?? undefined, version: d.version ?? undefined,
        })));
        for (let j = 0; j < batch.length; j++) {
          const note = batch[j];
          const result = results[j];
          if (!result) { errors++; continue; }
          await this.prisma.releaseNote.update({
            where: { id: note.id },
            data: { aiGenerated: result.text, suggestedCapture: result.suggestedCapture || null, suggestedRoute: result.suggestedRoute || null, status: 'PENDING_APPROVAL' },
          });
          const hash = this.buildInputHash({ title: note.rawTitle, description: note.rawDescription, category: note.category ?? undefined, version: note.version ?? undefined });
          await this.prisma.aiCache.upsert({
            where: { inputHash: hash },
            update: { text: result.text, suggestedCapture: result.suggestedCapture, suggestedRoute: result.suggestedRoute, lastUsedAt: new Date() },
            create: { inputHash: hash, text: result.text, suggestedCapture: result.suggestedCapture, suggestedRoute: result.suggestedRoute, model: this.model },
          });
          fromApi++;
        }
        await this.recordStat({ apiCalls: 1 });
      } catch (err) {
        this.logger.error(`Falha no batch ${i / this.BATCH_SIZE + 1}: ${err}`);
        errors += batch.length;
      }
    }

    this.logger.log(`Regerar TUDO done: ${fromApi} regeradas, ${errors} erros`);
    return { processed: notes.length, fromApi, errors, cacheCleared };
  }

  // ─── Estatísticas de uso ────────────────────────────────────────────────────

  async getUsageStats() {
    const stats = await this.prisma.aiUsageStat.findMany({
      orderBy: { date: 'desc' },
      take: 30,
    });

    const totals = await this.prisma.aiUsageStat.aggregate({
      _sum: { apiCalls: true, cacheHits: true, tokensSaved: true },
    });

    const cacheSize = await this.prisma.aiCache.count();

    return {
      daily: stats,
      totals: {
        apiCalls:    totals._sum.apiCalls    ?? 0,
        cacheHits:   totals._sum.cacheHits   ?? 0,
        tokensSaved: totals._sum.tokensSaved ?? 0,
        cacheEntries: cacheSize,
        hitRate: totals._sum.cacheHits
          ? Math.round((totals._sum.cacheHits / ((totals._sum.apiCalls ?? 0) + totals._sum.cacheHits)) * 100)
          : 0,
      },
    };
  }

  private async recordStat(data: { apiCalls?: number; cacheHits?: number; tokensSaved?: number }) {
    const date = new Date().toISOString().slice(0, 10);
    try {
      await this.prisma.aiUsageStat.upsert({
        where: { date },
        update: {
          apiCalls:    { increment: data.apiCalls    ?? 0 },
          cacheHits:   { increment: data.cacheHits   ?? 0 },
          tokensSaved: { increment: data.tokensSaved ?? 0 },
        },
        create: { date, apiCalls: data.apiCalls ?? 0, cacheHits: data.cacheHits ?? 0, tokensSaved: data.tokensSaved ?? 0 },
      });
    } catch { /* silencioso — estatísticas não podem derrubar a geração */ }
  }

  // ─── Batch: várias notas numa única chamada ─────────────────────────────────
  //
  // Envia N entradas numeradas, pede um JSON array de N objetos de volta.
  // System prompt + examples pagos 1 vez por batch (não por nota).

  private async callApiBatch(inputs: GenerateReleaseNoteInput[]): Promise<GenerateReleaseNoteOutput[]> {
    const entriesText = inputs
      .map((inp, idx) =>
        `[ENTRADA ${idx + 1}]\nTítulo: ${inp.title}\nDescrição: ${inp.description}\nCategoria: ${inp.category ?? 'geral'}${inp.version ? `\nVersão: ${inp.version}` : ''}`,
      )
      .join('\n\n');

    const userMessage = `${FEW_SHOT_EXAMPLES}

Agora processe as seguintes ${inputs.length} tarefas e retorne um array JSON com exatamente ${inputs.length} objetos na mesma ordem, cada um com os campos "text", "suggestedCapture" e "suggestedRoute".

IMPORTANTE: responda SOMENTE com o array JSON, sem texto antes ou depois, sem markdown.

${entriesText}

[SAÍDA — array com ${inputs.length} objetos]`.trim();

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        } as any,
      ],
      messages: [{ role: 'user', content: userMessage }],
    });

    const raw = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')
      .trim();

    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned) as GenerateReleaseNoteOutput[];
      if (!Array.isArray(parsed)) throw new Error('Resposta não é array');
      return parsed;
    } catch (err) {
      this.logger.warn(`callApiBatch: falha ao parsear JSON (${err}). Fallback: 1 chamada por item.`);
      // Fallback: chama individualmente para não perder o batch inteiro
      return Promise.all(inputs.map((inp) => this.callApi(inp)));
    }
  }

  // ─── Anthropic Message Batches API (50% off, async) ─────────────────────────
  // Submete várias notas como UM batch. A Anthropic processa em background
  // (até 24h; normalmente minutos) e cobra metade. Ideal para regenerar todas
  // de uma vez quando o prompt/regras mudam — não bloqueia a API NestJS.

  /** Monta o prompt user de UMA nota (mesmo formato do callApi sync). */
  private buildUserMessage(input: GenerateReleaseNoteInput): string {
    return `${FEW_SHOT_EXAMPLES}

Agora processe a seguinte tarefa:

[ENTRADA]
Título: ${input.title}
Descrição: ${input.description}
Categoria: ${input.category ?? 'geral'}
${input.version ? `Versão: ${input.version}` : ''}
[SAÍDA]`.trim();
  }

  /**
   * Submete um batch para a Anthropic e cria o registro local.
   * - Filtra notas que já têm aiGenerated (não regenera nada que já tem conteúdo)
   *   a menos que opts.includeFilled = true (re-geração completa, com limpa de cache).
   * - Retorna { batchId, total } imediatamente; processamento é assíncrono.
   */
  async submitBatch(opts: { includeFilled?: boolean } = {}): Promise<{ batchId: string; total: number; skippedCached: number }> {
    const where: any = opts.includeFilled
      ? { status: { in: ['PENDING_APPROVAL', 'DRAFT'] as any[] } }
      : { OR: [{ status: 'DRAFT', aiGenerated: '' }, { status: 'PENDING_APPROVAL', aiGenerated: '' }] };

    const notes = await this.prisma.releaseNote.findMany({
      where,
      select: { id: true, rawTitle: true, rawDescription: true, category: true, version: true },
    });

    if (opts.includeFilled) {
      // re-geração completa: limpa o cache pra forçar conteúdo novo
      await this.prisma.aiCache.deleteMany({});
    }

    // Aproveita cache para o que já estiver lá (não vai pro batch — economiza ainda mais)
    const needsApi: typeof notes = [];
    let skippedCached = 0;
    for (const n of notes) {
      const hash = this.buildInputHash({
        title: n.rawTitle, description: n.rawDescription,
        category: n.category ?? undefined, version: n.version ?? undefined,
      });
      const cached = opts.includeFilled ? null : await this.prisma.aiCache.findUnique({ where: { inputHash: hash } });
      if (cached) {
        await this.prisma.releaseNote.update({
          where: { id: n.id },
          data: {
            aiGenerated: cached.text,
            suggestedCapture: cached.suggestedCapture || null,
            suggestedRoute: cached.suggestedRoute || null,
            status: 'PENDING_APPROVAL',
          },
        });
        skippedCached++;
      } else {
        needsApi.push(n);
      }
    }

    if (needsApi.length === 0) {
      this.logger.log(`submitBatch: nada a enviar (todas em cache: ${skippedCached}).`);
      return { batchId: '', total: 0, skippedCached };
    }

    // Monta requests no formato do Batches API
    // Importante: cada request tem um custom_id (= note.id) pra mapear resposta → nota.
    const requests = needsApi.map((n) => ({
      custom_id: n.id,
      params: {
        model: this.model,
        max_tokens: 1024,
        system: [
          { type: 'text' as const, text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' as const } } as any,
        ],
        messages: [{ role: 'user' as const, content: this.buildUserMessage({
          title: n.rawTitle, description: n.rawDescription,
          category: n.category ?? undefined, version: n.version ?? undefined,
        }) }],
      },
    }));

    this.logger.log(`Submetendo batch Anthropic: ${requests.length} requests (${skippedCached} já em cache).`);
    const batch: any = await (this.client.messages as any).batches.create({ requests });

    await this.prisma.aiBatch.create({
      data: {
        batchId: batch.id,
        status: batch.processing_status ?? 'submitted',
        noteIds: needsApi.map((n) => n.id),
        total: needsApi.length,
        model: this.model,
      },
    });

    return { batchId: batch.id, total: needsApi.length, skippedCached };
  }

  /** Lista batches locais com status atualizado da Anthropic. */
  async listBatches() {
    return this.prisma.aiBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
  }

  /**
   * Verifica um batch pendente: se a Anthropic terminou, baixa os resultados
   * e aplica em cada nota (gravando no cache também). Idempotente.
   */
  async processBatch(localId: string): Promise<{ status: string; succeeded: number; errored: number }> {
    const local = await this.prisma.aiBatch.findUnique({ where: { id: localId } });
    if (!local) throw new Error('Batch não encontrado');
    if (local.processedAt) {
      return { status: local.status, succeeded: local.succeeded, errored: local.errored };
    }

    const remote: any = await (this.client.messages as any).batches.retrieve(local.batchId);
    const remoteStatus: string = remote.processing_status ?? 'unknown';

    // Ainda processando → só atualiza o status local
    if (remoteStatus !== 'ended') {
      await this.prisma.aiBatch.update({ where: { id: localId }, data: { status: remoteStatus } });
      this.logger.log(`Batch ${local.batchId}: ${remoteStatus} (aguardando).`);
      return { status: remoteStatus, succeeded: 0, errored: 0 };
    }

    // Acabou — baixa resultados (NDJSON) e aplica
    let succeeded = 0, errored = 0;
    const noteIds = local.noteIds as string[];

    const results: AsyncIterable<any> = await (this.client.messages as any).batches.results(local.batchId);
    for await (const item of results) {
      const noteId: string | undefined = item.custom_id;
      if (!noteId || !noteIds.includes(noteId)) continue;

      const r = item.result;
      if (r?.type !== 'succeeded' || !r.message) { errored++; continue; }

      // Extrai texto e parseia JSON
      const raw = (r.message.content ?? [])
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('')
        .trim();
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
      let parsed: GenerateReleaseNoteOutput;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = { text: cleaned, suggestedCapture: '', suggestedRoute: '' };
      }

      // Reconcilia rota com a KB (mesma lógica do fluxo sync)
      const note = await this.prisma.releaseNote.findUnique({ where: { id: noteId } });
      if (!note) { errored++; continue; }
      const final = await this.reconcileRouteWithKB(
        { title: note.rawTitle, description: note.rawDescription, category: note.category ?? undefined, version: note.version ?? undefined },
        parsed,
      );

      await this.prisma.releaseNote.update({
        where: { id: noteId },
        data: {
          aiGenerated: final.text,
          suggestedCapture: final.suggestedCapture || null,
          suggestedRoute: final.suggestedRoute || null,
          status: 'PENDING_APPROVAL',
        },
      });

      // Cacheia para futuras gerações
      const hash = this.buildInputHash({
        title: note.rawTitle, description: note.rawDescription,
        category: note.category ?? undefined, version: note.version ?? undefined,
      });
      await this.prisma.aiCache.upsert({
        where: { inputHash: hash },
        update: { text: final.text, suggestedCapture: final.suggestedCapture, suggestedRoute: final.suggestedRoute, lastUsedAt: new Date() },
        create: { inputHash: hash, text: final.text, suggestedCapture: final.suggestedCapture, suggestedRoute: final.suggestedRoute, model: this.model },
      });
      succeeded++;
    }

    await this.prisma.aiBatch.update({
      where: { id: localId },
      data: {
        status: 'ended',
        succeeded,
        errored,
        endedAt: remote.ended_at ? new Date(remote.ended_at) : new Date(),
        processedAt: new Date(),
      },
    });

    // Registra como 1 chamada de API (o batch contou como 1, com 50% de desconto)
    await this.recordStat({ apiCalls: 1 });

    this.logger.log(`Batch ${local.batchId} processado: ${succeeded} ok, ${errored} erros.`);
    return { status: 'ended', succeeded, errored };
  }

  /** Processa todos os batches pendentes (chamado pelo cron). */
  async processPendingBatches() {
    const pending = await this.prisma.aiBatch.findMany({
      where: { processedAt: null },
      select: { id: true },
    });
    for (const b of pending) {
      try { await this.processBatch(b.id); } catch (err) {
        this.logger.error(`processBatch ${b.id}: ${err}`);
      }
    }
  }

  /** Cron a cada 5 minutos verifica batches em andamento e aplica os prontos. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async cronProcessBatches() {
    const pending = await this.prisma.aiBatch.count({ where: { processedAt: null } });
    if (pending === 0) return;
    this.logger.log(`Cron: ${pending} batch(es) pendentes — verificando...`);
    await this.processPendingBatches();
  }

  // ─── Chamada real à API com prompt caching ──────────────────────────────────

  private async callApi(input: GenerateReleaseNoteInput): Promise<GenerateReleaseNoteOutput> {
    const userMessage = `${FEW_SHOT_EXAMPLES}

Agora processe a seguinte tarefa:

[ENTRADA]
Título: ${input.title}
Descrição: ${input.description}
Categoria: ${input.category ?? 'geral'}
${input.version ? `Versão: ${input.version}` : ''}
[SAÍDA]`.trim();

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      // cache_control no system prompt — cacheado pela Anthropic por 5 min
      // Economiza ~90% dos tokens de input em chamadas consecutivas
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        } as any,
      ],
      messages: [{ role: 'user', content: userMessage }],
    });

    const raw = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')
      .trim();

    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

    try {
      const parsed = JSON.parse(cleaned) as GenerateReleaseNoteOutput;
      return parsed;
    } catch {
      this.logger.warn('Resposta da IA não é JSON válido, usando texto bruto');
      return { text: cleaned, suggestedCapture: '', suggestedRoute: '' };
    }
  }
}
