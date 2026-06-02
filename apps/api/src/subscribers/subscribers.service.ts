import { Injectable, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class SubscribersService {
  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private config: ConfigService,
  ) {}

  async subscribe(emailAddr: string) {
    const existing = await this.prisma.subscriber.findUnique({ where: { email: emailAddr } });
    if (existing) {
      if (!existing.active) {
        await this.prisma.subscriber.update({ where: { id: existing.id }, data: { active: true } });
        return { status: 'reactivated' };
      }
      throw new ConflictException('Email já cadastrado');
    }
    const sub = await this.prisma.subscriber.create({ data: { email: emailAddr } });
    const webUrl = this.config.get<string>('WEB_URL') ?? 'http://localhost:3003';
    await this.email.sendSubscribeConfirmation(emailAddr, sub.unsubToken, webUrl);
    return { status: 'subscribed' };
  }

  async unsubscribe(token: string) {
    const sub = await this.prisma.subscriber.findUnique({ where: { unsubToken: token } });
    if (!sub) return { status: 'not_found' };
    await this.prisma.subscriber.update({ where: { id: sub.id }, data: { active: false } });
    return { status: 'unsubscribed' };
  }

  async findAll(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.subscriber.findMany({ orderBy: { createdAt: 'desc' }, skip, take: limit }),
      this.prisma.subscriber.count(),
    ]);
    return { data, total, page, limit };
  }

  async getActiveSubscribers() {
    return this.prisma.subscriber.findMany({ where: { active: true } });
  }

  async delete(id: string) {
    return this.prisma.subscriber.delete({ where: { id } });
  }
}
