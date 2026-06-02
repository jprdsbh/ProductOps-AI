import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    private config: ConfigService,
  ) {}

  verifySignature(rawBody: Buffer, signature: string): boolean {
    const secret = this.config.get<string>('CLICKUP_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.warn('CLICKUP_WEBHOOK_SECRET not set — skipping HMAC check (dev mode)');
      return true;
    }
    const computed = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    const sigBuffer = Buffer.from(signature);
    const computedBuffer = Buffer.from(computed);
    if (sigBuffer.length !== computedBuffer.length) return false;
    return crypto.timingSafeEqual(sigBuffer, computedBuffer);
  }

  async processWebhook(payload: any): Promise<void> {
    const event: string = payload.event ?? '';

    if (!['taskUpdated', 'taskStatusUpdated'].includes(event)) {
      this.logger.debug(`Ignored event: ${event}`);
      return;
    }

    const taskId: string = payload.task_id ?? payload.id;
    if (!taskId) return;

    const triggerStatus = this.config
      .get<string>('CLICKUP_TRIGGER_STATUS', 'closed')
      .toLowerCase();

    // Check status change in history_items
    const historyItems: any[] = payload.history_items ?? [];
    const statusChange = historyItems.find(
      (h) =>
        h.field === 'status' &&
        h.after?.status?.toLowerCase() === triggerStatus,
    );

    if (!statusChange) {
      this.logger.debug(`Task ${taskId} — no "${triggerStatus}" status change found`);
      return;
    }

    // Idempotency: composite key taskId:historyItemId
    const idempotencyKey = `${taskId}:${statusChange.id ?? statusChange.parent_id ?? 'x'}`;
    const already = await this.prisma.processedEvent.findUnique({ where: { id: idempotencyKey } });
    if (already) {
      this.logger.log(`Duplicate event ignored: ${idempotencyKey}`);
      return;
    }
    await this.prisma.processedEvent.create({ data: { id: idempotencyKey } });

    // Skip if we already generated a note for this task
    const existing = await this.prisma.releaseNote.findUnique({ where: { clickupTaskId: taskId } });
    if (existing) {
      this.logger.log(`ReleaseNote already exists for task ${taskId} (status: ${existing.status})`);
      return;
    }

    // Fetch full task details from ClickUp REST API for richer context
    const taskData = await this.fetchClickUpTask(taskId) ?? payload.task ?? {};

    const rawTitle: string = taskData.name ?? taskId;
    const subtasks: any[] = taskData.subtasks ?? [];

    // Collect ALL assignees from task + subtasks (no team filter)
    const allAssignees: any[] = [
      ...(taskData.assignees ?? []),
      ...subtasks.flatMap((st: any) => st.assignees ?? []),
    ];
    const names = [
      ...new Set(
        allAssignees
          .map((a: any) => a.username ?? a.email ?? '')
          .filter(Boolean),
      ),
    ];
    const assigneeName = names.join(', ') || null;

    const rawDescription: string = [
      taskData.description?.trim() || taskData.text_content?.trim() || rawTitle,
      ...subtasks
        .map((st: any) => st.description?.trim() || st.text_content?.trim())
        .filter(Boolean),
    ]
      .filter(Boolean)
      .join('\n\n');

    const category = this.extractCategory(taskData.custom_fields ?? []);
    const version = this.extractVersion(taskData.custom_fields ?? []);
    const taskUrl: string = taskData.url ?? null;

    // Create DRAFT record immediately
    const note = await this.prisma.releaseNote.create({
      data: {
        clickupTaskId: taskId,
        clickupTaskUrl: taskUrl,
        rawTitle,
        rawDescription,
        aiGenerated: '',
        status: 'DRAFT',
        category,
        version,
        assigneeName,
      },
    });

    // Generate AI release note
    try {
      const aiResult = await this.ai.generateReleaseNote({
        title: rawTitle,
        description: rawDescription,
        category,
        version,
      });

      await this.prisma.releaseNote.update({
        where: { id: note.id },
        data: {
          aiGenerated: aiResult.text,
          suggestedCapture: aiResult.suggestedCapture || null,
          suggestedRoute: aiResult.suggestedRoute || null,
          status: 'PENDING_APPROVAL',
        },
      });

      this.logger.log(`ReleaseNote PENDING_APPROVAL: ${note.id} — "${rawTitle}"`);
    } catch (err) {
      this.logger.error(`AI generation failed for note ${note.id}`, err);
      // Stays as DRAFT — admin can regenerate manually
    }
  }

  private async fetchClickUpTask(taskId: string): Promise<any | null> {
    const apiKey = this.config.get<string>('CLICKUP_API_KEY');
    if (!apiKey) return null;

    try {
      const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}?include_subtasks=true`, {
        headers: { Authorization: apiKey },
      });
      if (!res.ok) {
        this.logger.warn(`ClickUp API returned ${res.status} for task ${taskId}`);
        return null;
      }
      return res.json();
    } catch (err) {
      this.logger.warn(`Failed to fetch task ${taskId} from ClickUp API`, err);
      return null;
    }
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
    // Dropdown: value is an index into type_config.options
    if (typeof value === 'number') {
      return field.type_config?.options?.[value]?.name ?? String(value);
    }
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
}
