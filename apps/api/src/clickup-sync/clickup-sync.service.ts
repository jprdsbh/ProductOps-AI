import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

const SCOPE_FIELD_ID = 'd5652494-7db4-483f-ad60-b237d05a01c2';
const PRODUCT_SCOPES = ['frontend', 'backend', 'fullstack'];

// Valores do campo "Epic" que significam "sem épico"
const EMPTY_EPICS = new Set(['nenhum', 'none', 'n/a', '-', '']);

/**
 * Unidade de release: conjunto de tasks que juntas representam UMA mudança publicável.
 * - 'single': uma task de produto sem subtarefas
 * - 'family': pai + subtarefas colapsados (ex.: UX&UI pai + Frontend filho)
 * - 'epic':   famílias diferentes do mesmo épico real combinadas (FE+BE)
 */
interface ReleaseUnit {
  members: any[];
  anchor: any;
  epicName: string | null;
  kind: 'single' | 'family' | 'epic';
}

@Injectable()
export class ClickupSyncService {
  private readonly logger = new Logger(ClickupSyncService.name);

  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    private config: ConfigService,
  ) {}

  private get apiKey(): string {
    return this.config.get<string>('CLICKUP_API_KEY') ?? '';
  }

  private get spaceId(): string {
    return this.config.get<string>('CLICKUP_SPACE_ID') ?? '901313179251';
  }

  private syncing = false;

  @Cron('0 9 * * *')
  async syncTasks(): Promise<{ created: number; skipped: number; errors: number }> {
    if (!this.apiKey) {
      this.logger.warn('CLICKUP_API_KEY not set — skipping ClickUp sync');
      return { created: 0, skipped: 0, errors: 0 };
    }

    // Evita execuções concorrentes (ex.: clicar "Buscar do ClickUp" duas vezes)
    if (this.syncing) {
      this.logger.warn('Sync já em andamento — ignorando disparo concorrente');
      return { created: 0, skipped: 0, errors: 0 };
    }
    this.syncing = true;

    this.logger.log('Starting daily ClickUp sync...');
    let created = 0, skipped = 0, errors = 0;

    try {
      const folders = await this.getFolders();
      const sprintsFolder = folders.find((f: any) => f.name?.toLowerCase().includes('sprint'));

      if (!sprintsFolder) {
        this.logger.warn(`No Sprints folder found. Available: ${folders.map((f: any) => f.name).join(', ')}`);
        return { created, skipped, errors };
      }

      this.logger.log(`Found folder: "${sprintsFolder.name}" (${sprintsFolder.id})`);
      const lists = await this.getLists(sprintsFolder.id);
      this.logger.log(`Found ${lists.length} sprint lists`);

      for (const list of lists) {
        const allTasks = await this.getTasks(list.id);
        this.logger.log(`[${list.name}] ${allTasks.length} tasks fetched`);

        // Agrupa em "unidades de release": colapsa pai/subtarefa numa família,
        // junta UX&UI com a implementação Frontend e combina FE+BE do mesmo épico.
        const units = this.buildReleaseUnits(allTasks);
        this.logger.log(`[${list.name}] ${units.length} unidades de release após agrupamento`);

        for (const unit of units) {
          try {
            const result = await this.processUnit(unit, list.name);
            if (result === 'created') created++;
            else skipped++;
          } catch (err) {
            this.logger.error(`Failed unit "${unit.anchor?.name ?? '?'}": ${err}`);
            errors++;
          }
        }
      }
    } catch (err) {
      this.logger.error('ClickUp sync failed', err);
      errors++;
    } finally {
      this.syncing = false;
    }

    this.logger.log(`Sync done: ${created} created, ${skipped} skipped, ${errors} errors`);
    return { created, skipped, errors };
  }

  // ─── Scope helpers ────────────────────────────────────────────────────────────

  private normalizeScope(scope: string | null | undefined): string {
    return (scope ?? '').toString().trim().toLowerCase();
  }

  /** Scopes que representam mudança de produto e podem virar release. */
  private isProductScope(scope: string | null | undefined): boolean {
    return PRODUCT_SCOPES.includes(this.normalizeScope(scope));
  }

  private statusClosed(task: any): boolean {
    return (task?.status?.status ?? '').toLowerCase().includes('closed');
  }

  // ─── Agrupamento em unidades de release ─────────────────────────────────────────

  /**
   * Constrói "unidades de release" a partir das tasks cruas do ClickUp:
   *
   *  1. Famílias: tasks são agrupadas pelo pai de topo (top_level_parent). Assim uma
   *     subtarefa NUNCA gera nota própria — ela é dobrada no contexto do pai. Isso resolve
   *     o caso UX&UI (pai) + Frontend (subtarefa): viram uma única nota com os dois scopes.
   *  2. Elegibilidade: uma família só vira release se tiver ≥1 task fechada E ao menos um
   *     scope de produto (frontend/backend/fullstack), ou for uma task avulsa sem scope.
   *     UX&UI/Analise/Mobile/Dados/Documentação sozinhas são descartadas.
   *  3. Épico: famílias que compartilham um épico REAL (≠ "Nenhum") e juntas têm BE + FE/FS
   *     são combinadas numa só nota (comportamento antigo, agora no nível de família).
   */
  private buildReleaseUnits(tasks: any[]): ReleaseUnit[] {
    // 1) Famílias por pai de topo (colapsa subtarefas no pai)
    const families = new Map<string, any[]>();
    for (const t of tasks) {
      const key = t.top_level_parent || t.parent || t.id;
      if (!families.has(key)) families.set(key, []);
      families.get(key)!.push(t);
    }

    // 2) Cada família elegível vira uma unidade candidata
    const candidates: ReleaseUnit[] = [];
    for (const [key, members] of families) {
      if (!this.familyEligible(members)) continue;
      const anchor =
        members.find((m) => m.id === key) ??
        members.find((m) => !m.parent) ??
        members[0];
      candidates.push({
        members,
        anchor,
        epicName: this.extractEpic(anchor.custom_fields ?? []),
        kind: members.length > 1 ? 'family' : 'single',
      });
    }

    // 3) Combina unidades do mesmo épico real quando há BE + FE/FS
    const byEpic = new Map<string, ReleaseUnit[]>();
    const finalUnits: ReleaseUnit[] = [];
    for (const u of candidates) {
      if (u.epicName) {
        if (!byEpic.has(u.epicName)) byEpic.set(u.epicName, []);
        byEpic.get(u.epicName)!.push(u);
      } else {
        finalUnits.push(u);
      }
    }

    for (const [epic, group] of byEpic) {
      if (group.length >= 2 && this.groupHasMixedScopes(group)) {
        const members = group.flatMap((g) => g.members);
        const anchor =
          group.map((g) => g.anchor).find((a) => this.isProductScope(this.extractScope(a.custom_fields ?? []))) ??
          group[0].anchor;
        this.logger.log(`Épico "${epic}": ${group.length} unidades (FE+BE) → combinadas`);
        finalUnits.push({ members, anchor, epicName: epic, kind: 'epic' });
      } else {
        finalUnits.push(...group);
      }
    }

    return finalUnits;
  }

  /** Uma família é elegível se tem task fechada + scope de produto (ou task avulsa sem scope). */
  private familyEligible(members: any[]): boolean {
    if (!members.some((m) => this.statusClosed(m))) return false;

    const scopes = members.map((m) => this.normalizeScope(this.extractScope(m.custom_fields ?? [])));
    if (scopes.some((s) => this.isProductScope(s))) return true;

    // Sem nenhum scope marcado: permite task avulsa substancial (legado p/ tasks sem scope).
    const allUntagged = scopes.every((s) => !s);
    const anchorName = (members.find((m) => !m.parent) ?? members[0])?.name ?? '';
    return allUntagged && anchorName.trim().length >= 10;
  }

  /** O conjunto de scopes da união das famílias tem Backend E (Frontend ou Fullstack)? */
  private groupHasMixedScopes(group: ReleaseUnit[]): boolean {
    const scopes = group
      .flatMap((g) => g.members)
      .map((m) => this.normalizeScope(this.extractScope(m.custom_fields ?? [])));
    const hasBackend = scopes.includes('backend');
    const hasFrontend = scopes.includes('frontend') || scopes.includes('fullstack');
    return hasBackend && hasFrontend;
  }

  // ─── Processamento de uma unidade de release ───────────────────────────────────

  private async processUnit(unit: ReleaseUnit, sprintName?: string): Promise<'created' | 'skipped'> {
    const isEpic = unit.kind === 'epic';
    const clickupTaskId = isEpic
      ? this.buildCompositeId(sprintName ?? '', unit.epicName ?? 'epic')
      : unit.anchor.id;

    // Idempotência + backfill da data de release
    const existing = await this.prisma.releaseNote.findUnique({ where: { clickupTaskId } });
    if (existing) {
      if (!existing.releasedAt) {
        const closedAt = this.latestClosedDate(unit.members);
        if (closedAt) {
          await this.prisma.releaseNote.update({ where: { id: existing.id }, data: { releasedAt: closedAt } });
        }
      }
      return 'skipped';
    }

    // Busca detalhes completos de cada membro (descrições reais)
    const fullTasks = (await Promise.all(unit.members.map((m) => this.fetchTask(m.id)))).filter(Boolean);
    if (!fullTasks.length) return 'skipped';

    // Assignees de todos os membros + subtarefas
    const allAssignees = fullTasks.flatMap((ft: any) => [
      ...(ft.assignees ?? []),
      ...(ft.subtasks ?? []).flatMap((st: any) => st.assignees ?? []),
    ]);
    const assigneeName =
      [...new Set(allAssignees.map((a: any) => a.username ?? a.email ?? '').filter(Boolean))].join(', ') || null;

    // Descrição: simples para 1 membro, combinada e rotulada por scope para vários
    const rawDescription =
      fullTasks.length === 1
        ? this.buildDescription(fullTasks[0])
        : fullTasks
            .map((ft: any) => {
              const scope = this.extractScope(ft.custom_fields ?? []) ?? 'task';
              const desc = ft.description?.trim() || ft.text_content?.trim() || '';
              const subtaskDescs = (ft.subtasks ?? [])
                .map((st: any) => st.description?.trim() || st.text_content?.trim())
                .filter(Boolean)
                .join('\n');
              const body = [desc, subtaskDescs].filter(Boolean).join('\n');
              return `[${scope}] ${ft.name}${body ? '\n' + body : ''}`;
            })
            .join('\n\n---\n\n');

    // Lead = membro com scope de produto (melhor categoria); âncora = título público
    const lead =
      fullTasks.find((ft: any) => this.isProductScope(this.extractScope(ft.custom_fields ?? []))) ??
      fullTasks.find((ft: any) => ft.id === unit.anchor.id) ??
      fullTasks[0];
    const anchorFull = fullTasks.find((ft: any) => ft.id === unit.anchor.id) ?? lead;

    const category =
      this.extractCategory(lead.custom_fields ?? []) ?? this.extractScope(lead.custom_fields ?? []) ?? 'feature';
    const version = this.extractVersion(lead.custom_fields ?? []);
    const rawTitle = isEpic ? unit.epicName ?? anchorFull.name : anchorFull.name;

    const note = await this.prisma.releaseNote.create({
      data: {
        clickupTaskId,
        clickupTaskUrl: (lead.url ?? anchorFull.url) ?? null,
        rawTitle,
        rawDescription: rawDescription || rawTitle,
        aiGenerated: '',
        status: 'DRAFT',
        category,
        version,
        assigneeName,
        sprintName: sprintName ?? null,
        epicName: unit.epicName ?? null,
        releasedAt: this.latestClosedDate(fullTasks),
      },
    });

    await this.generateAndUpdate(note.id, rawTitle, rawDescription || rawTitle, category, version);
    const scopesStr = fullTasks.map((ft: any) => this.extractScope(ft.custom_fields ?? []) ?? '-').join('+');
    this.logger.log(`Created ${unit.kind} note: "${rawTitle}" (${fullTasks.length} task(s): ${scopesStr}) — assignees: ${assigneeName ?? 'none'}`);
    return 'created';
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Converte o timestamp de fechamento do ClickUp (date_closed, em ms como string)
   * para Date. Cai para date_done se date_closed não existir.
   */
  private parseClosedDate(task: any): Date | null {
    const raw = task?.date_closed ?? task?.date_done;
    if (!raw) return null;
    const ms = Number(raw);
    if (!Number.isFinite(ms) || ms <= 0) return null;
    return new Date(ms);
  }

  /** Retorna a data de closed mais recente entre várias tasks (grupo de épico). */
  private latestClosedDate(tasks: any[]): Date | null {
    const dates = tasks.map((t) => this.parseClosedDate(t)).filter((d): d is Date => d !== null);
    if (!dates.length) return null;
    return new Date(Math.max(...dates.map((d) => d.getTime())));
  }

  private buildCompositeId(sprintName: string, epicName: string): string {
    return `epic:${sprintName}:${epicName}`.replace(/\s+/g, '-').toLowerCase().slice(0, 250);
  }

  private collectAssignees(fullTask: any): string | null {
    const subtasks: any[] = fullTask.subtasks ?? [];
    const all = [...(fullTask.assignees ?? []), ...subtasks.flatMap((st: any) => st.assignees ?? [])];
    const names = [...new Set(all.map((a: any) => a.username ?? a.email ?? '').filter(Boolean))];
    return names.join(', ') || null;
  }

  private buildDescription(fullTask: any): string {
    const subtasks: any[] = fullTask.subtasks ?? [];
    return [
      fullTask.description?.trim() || fullTask.text_content?.trim() || fullTask.name,
      ...subtasks.map((st: any) => st.description?.trim() || st.text_content?.trim()).filter(Boolean),
    ].filter(Boolean).join('\n\n');
  }

  private async generateAndUpdate(
    noteId: string,
    title: string,
    description: string,
    category: string | null,
    version: string | null,
  ): Promise<void> {
    try {
      const result = await this.ai.generateReleaseNote({
        title,
        description,
        category: category ?? undefined,
        version: version ?? undefined,
      });
      await this.prisma.releaseNote.update({
        where: { id: noteId },
        data: {
          aiGenerated: result.text,
          suggestedCapture: result.suggestedCapture || null,
          suggestedRoute: result.suggestedRoute || null,
          status: 'PENDING_APPROVAL',
        },
      });
    } catch (err) {
      this.logger.error(`AI generation failed for note ${noteId}`, err);
      // Stays DRAFT — admin can regenerate manually
    }
  }

  // ─── ClickUp API ─────────────────────────────────────────────────────────────

  private async getFolders(): Promise<any[]> {
    const res = await this.clickupFetch(`/space/${this.spaceId}/folder?archived=false`);
    return res.folders ?? [];
  }

  private async getLists(folderId: string): Promise<any[]> {
    const res = await this.clickupFetch(`/folder/${folderId}/list?archived=false`);
    return res.lists ?? [];
  }

  private async getTasks(listId: string): Promise<any[]> {
    const results: any[] = [];
    let page = 0;
    while (true) {
      const res = await this.clickupFetch(
        `/list/${listId}/task?include_closed=true&subtasks=true&page=${page}`,
      );
      const batch: any[] = res.tasks ?? [];
      results.push(...batch);
      if (batch.length < 100) break;
      page++;
    }
    return results;
  }

  private async fetchTask(taskId: string): Promise<any | null> {
    try {
      return await this.clickupFetch(`/task/${taskId}?include_subtasks=true`);
    } catch {
      return null;
    }
  }

  private async clickupFetch(path: string): Promise<any> {
    const res = await fetch(`https://api.clickup.com/api/v2${path}`, {
      headers: { Authorization: this.apiKey },
    });
    if (!res.ok) throw new Error(`ClickUp API ${res.status} for ${path}`);
    return res.json();
  }

  // ─── Custom field extractors ─────────────────────────────────────────────────

  private extractScope(customFields: any[]): string | null {
    const field = customFields.find((f) => f.id === SCOPE_FIELD_ID);
    if (!field) return null;
    const value = field.value;
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') {
      const opt = (field.type_config?.options ?? []).find((o: any) => o.orderindex === value);
      return opt?.name ?? null;
    }
    if (typeof value === 'string') return value;
    return null;
  }

  private extractCategory(customFields: any[]): string | null {
    const field = customFields.find(
      (f) =>
        f.name?.toLowerCase().includes('categor') ||
        f.name?.toLowerCase().includes('type') ||
        f.name?.toLowerCase().includes('tipo'),
    );
    if (!field) return null;
    const value = field.value;
    if (typeof value === 'string') return value;
    if (typeof value === 'number')
      return field.type_config?.options?.[value]?.name ?? String(value);
    return null;
  }

  private extractVersion(customFields: any[]): string | null {
    const field = customFields.find(
      (f) =>
        f.name?.toLowerCase().includes('version') ||
        f.name?.toLowerCase().includes('versão') ||
        f.name?.toLowerCase().includes('release'),
    );
    if (!field) return null;
    return field.value ? String(field.value) : null;
  }

  private extractEpic(customFields: any[]): string | null {
    const field = customFields.find(
      (f) =>
        f.name?.toLowerCase().includes('epic') ||
        f.name?.toLowerCase().includes('épico') ||
        f.name?.toLowerCase().includes('epico'),
    );
    if (!field) return null;
    const value = field.value;
    if (value === null || value === undefined) return null;

    let name: string | null = null;
    if (Array.isArray(value)) {
      name = value.map((v: any) => v.name ?? v.title ?? '').filter(Boolean).join(', ') || null;
    } else if (typeof value === 'string') {
      name = value || null;
    } else if (typeof value === 'number') {
      const opt = field.type_config?.options?.find((o: any) => o.orderindex === value);
      name = opt?.name ?? null;
    }

    // "Nenhum"/None/vazio → tratado como SEM épico (não agrupa)
    if (!name || EMPTY_EPICS.has(name.trim().toLowerCase())) return null;
    return name;
  }
}
