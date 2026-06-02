import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.config.get<number>('SMTP_PORT') ?? 587,
        secure: this.config.get<boolean>('SMTP_SECURE') ?? false,
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: this.config.get<string>('SMTP_PASS'),
        },
      });
    }
  }

  async sendNewReleaseNotification(opts: {
    subscribers: { email: string; unsubToken: string }[];
    note: { customId: string | null; rawTitle: string; finalText: string; category: string | null };
    webUrl: string;
  }) {
    if (!this.transporter) {
      this.logger.warn('SMTP not configured — skipping email notification');
      return;
    }

    const from = this.config.get<string>('SMTP_FROM') ?? 'noreply@tamboretemay.com.br';
    const categoryEmoji: Record<string, string> = {
      feature: '🚀', improvement: '🛠️', performance: '🛠️',
      bugfix: '🐛', bug: '🐛', security: '🔒',
    };
    const emoji = categoryEmoji[(opts.note.category ?? '').toLowerCase()] ?? '📦';
    const subject = `${emoji} ${opts.note.customId ? `[${opts.note.customId}] ` : ''}Nova atualização TamboretePay: ${opts.note.rawTitle}`;

    const results = await Promise.allSettled(
      opts.subscribers.map((sub) =>
        this.transporter!.sendMail({
          from: `"TamboretePay Changelog" <${from}>`,
          to: sub.email,
          subject,
          html: this.buildHtml(opts.note, opts.webUrl, sub.unsubToken),
        })
      )
    );

    const sent = results.filter((r) => r.status === 'fulfilled').length;
    this.logger.log(`Sent release notification to ${sent}/${opts.subscribers.length} subscribers`);
  }

  async sendSubscribeConfirmation(email: string, unsubToken: string, webUrl: string) {
    if (!this.transporter) return;
    const from = this.config.get<string>('SMTP_FROM') ?? 'noreply@tamboretemay.com.br';
    await this.transporter.sendMail({
      from: `"TamboretePay Changelog" <${from}>`,
      to: email,
      subject: '✅ Inscrição confirmada no TamboretePay Changelog',
      html: `
        <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
          <div style="border-top:4px solid #DDC444;padding-top:24px;">
            <h2 style="font-size:20px;font-weight:700;color:#111;margin:0 0 12px;">
              Inscrição confirmada!
            </h2>
            <p style="color:#555;line-height:1.6;margin:0 0 20px;">
              A partir de agora você receberá notificações sempre que uma nova atualização for publicada no changelog da TamboretePay.
            </p>
            <a href="${webUrl}/changelog" style="display:inline-block;background:#DDC444;color:#111;font-weight:600;padding:10px 20px;border-radius:6px;text-decoration:none;">
              Ver Changelog
            </a>
            <p style="margin-top:24px;font-size:12px;color:#999;">
              Para cancelar a inscrição: <a href="${webUrl}/unsubscribe?token=${unsubToken}" style="color:#999;">clique aqui</a>
            </p>
          </div>
        </div>`,
    });
  }

  private buildHtml(
    note: { customId: string | null; rawTitle: string; finalText: string; category: string | null },
    webUrl: string,
    unsubToken: string,
  ) {
    const safeText = note.finalText
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/^---$/m, '<hr style="border:none;border-top:1px solid #eee;margin:16px 0;">')
      .replace(/^- (.+)$/gm, '<li style="margin:6px 0;">$1</li>')
      .replace(/(<li[^>]*>.*<\/li>\n?)+/g, (m) => `<ul style="padding-left:18px;margin:8px 0;">${m}</ul>`)
      .replace(/\n\n/g, '</p><p style="color:#555;line-height:1.6;margin:0 0 12px;">')
      .replace(/\n/g, '<br>');

    return `
      <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
        <div style="border-top:4px solid #DDC444;padding-top:24px;">
          ${note.customId ? `<span style="font-family:monospace;font-size:12px;background:#FFF8D6;color:#8B7A0A;border:1px solid #DDC444;padding:2px 8px;border-radius:4px;">${note.customId}</span>` : ''}
          <h2 style="font-size:20px;font-weight:700;color:#111;margin:16px 0 12px;">${note.rawTitle}</h2>
          <div style="color:#555;line-height:1.7;">
            <p style="margin:0 0 12px;">${safeText}</p>
          </div>
          <div style="margin-top:24px;">
            <a href="${webUrl}/changelog" style="display:inline-block;background:#DDC444;color:#111;font-weight:600;padding:10px 20px;border-radius:6px;text-decoration:none;">
              Ver no Changelog
            </a>
          </div>
          <p style="margin-top:32px;font-size:11px;color:#bbb;">
            TamboretePay · <a href="${webUrl}/unsubscribe?token=${unsubToken}" style="color:#bbb;">Cancelar inscrição</a>
          </p>
        </div>
      </div>`;
  }
}
