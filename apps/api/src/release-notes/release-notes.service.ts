import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { EmailService } from '../email/email.service';
import { SubscribersService } from '../subscribers/subscribers.service';

@Injectable()
export class ReleaseNotesService {
  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    private email: EmailService,
    private subscribers: SubscribersService,
    private config: ConfigService,
  ) {}

  async createManual(data: {
    clickupTaskId: string;
    clickupTaskUrl?: string;
    customId?: string;
    assigneeName?: string;
    rawTitle: string;
    rawDescription: string;
    category?: string;
    version?: string;
  }) {
    const existing = await this.prisma.releaseNote.findUnique({
      where: { clickupTaskId: data.clickupTaskId },
    });
    if (existing) return existing;

    const note = await this.prisma.releaseNote.create({
      data: {
        clickupTaskId: data.clickupTaskId,
        clickupTaskUrl: data.clickupTaskUrl ?? null,
        customId: data.customId ?? null,
        assigneeName: data.assigneeName ?? null,
        rawTitle: data.rawTitle,
        rawDescription: data.rawDescription,
        aiGenerated: '',
        status: 'DRAFT',
        category: data.category ?? null,
        version: data.version ?? null,
      },
    });

    try {
      const result = await this.ai.generateReleaseNote({
        title: data.rawTitle,
        description: data.rawDescription,
        category: data.category,
        version: data.version,
      });
      return this.prisma.releaseNote.update({
        where: { id: note.id },
        data: {
          aiGenerated: result.text,
          suggestedCapture: result.suggestedCapture || null,
          suggestedRoute: result.suggestedRoute || null,
          status: 'PENDING_APPROVAL',
        },
      });
    } catch {
      return note;
    }
  }

  async findPending(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.releaseNote.findMany({
        where: { status: 'PENDING_APPROVAL' },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.releaseNote.count({ where: { status: 'PENDING_APPROVAL' } }),
    ]);
    return { data, total, page, limit };
  }

  async findPublished(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.releaseNote.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: [
          { releasedAt: { sort: 'desc', nulls: 'last' } },
          { publishedAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      this.prisma.releaseNote.count({ where: { status: 'PUBLISHED' } }),
    ]);
    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const note = await this.prisma.releaseNote.findUnique({ where: { id } });
    if (!note) throw new NotFoundException('Release note not found');
    return note;
  }

  async approve(id: string, finalText: string, imageUrl?: string) {
    const note = await this.findOne(id);
    if (note.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(`Cannot approve a note with status: ${note.status}`);
    }
    const published = await this.prisma.releaseNote.update({
      where: { id },
      data: {
        finalText: finalText.trim(),
        status: 'PUBLISHED',
        publishedAt: new Date(),
        ...(imageUrl !== undefined ? { imageUrl } : {}),
      },
    });

    // Notify subscribers in background (don't await)
    this.notifySubscribers(published).catch(() => {});

    return published;
  }

  private async notifySubscribers(note: any) {
    const activeSubscribers = await this.subscribers.getActiveSubscribers();
    if (!activeSubscribers.length) return;
    const webUrl = this.config.get<string>('WEB_URL') ?? 'http://localhost:3003';
    await this.email.sendNewReleaseNotification({
      subscribers: activeSubscribers,
      note: {
        customId: note.customId,
        rawTitle: note.rawTitle,
        finalText: note.finalText,
        category: note.category,
      },
      webUrl,
    });
  }

  async unpublish(id: string) {
    const note = await this.findOne(id);
    if (note.status !== 'PUBLISHED') {
      throw new BadRequestException(`Cannot unpublish a note with status: ${note.status}`);
    }
    return this.prisma.releaseNote.update({
      where: { id },
      data: { status: 'PENDING_APPROVAL', publishedAt: null },
    });
  }

  async reject(id: string) {
    const note = await this.findOne(id);
    if (!['PENDING_APPROVAL', 'DRAFT'].includes(note.status)) {
      throw new BadRequestException(`Cannot reject a note with status: ${note.status}`);
    }
    return this.prisma.releaseNote.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
  }

  async updateText(id: string, aiGenerated: string) {
    await this.findOne(id);
    return this.prisma.releaseNote.update({
      where: { id },
      data: { aiGenerated },
    });
  }

  async updateImage(id: string, imageUrl: string) {
    await this.findOne(id);
    return this.prisma.releaseNote.update({
      where: { id },
      data: { imageUrl: imageUrl || null },
    });
  }

  async updateCustomId(id: string, customId: string) {
    await this.findOne(id);
    return this.prisma.releaseNote.update({
      where: { id },
      data: { customId: customId || null },
    });
  }

  async updateAssigneeName(id: string, assigneeName: string) {
    await this.findOne(id);
    return this.prisma.releaseNote.update({
      where: { id },
      data: { assigneeName: assigneeName || null },
    });
  }

  async regenerate(id: string, force = false) {
    const note = await this.findOne(id);
    const result = await this.ai.generateReleaseNote({
      title: note.rawTitle,
      description: note.rawDescription,
      category: note.category ?? undefined,
      version: note.version ?? undefined,
    }, { force });
    return this.prisma.releaseNote.update({
      where: { id },
      data: {
        aiGenerated: result.text,
        suggestedCapture: result.suggestedCapture || null,
        suggestedRoute: result.suggestedRoute || null,
        status: 'PENDING_APPROVAL',
      },
    });
  }

  async regenerateDrafts() {
    return this.ai.regenerateDrafts();
  }

  async getAiStats() {
    return this.ai.getUsageStats();
  }
}
