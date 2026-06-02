import {
  Controller,
  Post,
  Req,
  Res,
  Headers,
  HttpCode,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private webhooksService: WebhooksService) {}

  @Post('clickup')
  @HttpCode(200)
  async handleClickup(
    @Req() req: Request & { rawBody?: Buffer },
    @Res({ passthrough: true }) _res: Response,
    @Headers('x-signature') signature: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      this.logger.error('rawBody not available — ensure rawBody:true in NestFactory.create');
      return { ok: false };
    }

    const valid = this.webhooksService.verifySignature(rawBody, signature ?? '');
    if (!valid) {
      this.logger.warn('Invalid webhook signature');
      throw new UnauthorizedException('Invalid signature');
    }

    const payload = JSON.parse(rawBody.toString('utf-8'));
    this.logger.log(`Received ClickUp event: ${payload.event}`);

    // Process async — return 200 immediately to ClickUp
    this.webhooksService.processWebhook(payload).catch((err) =>
      this.logger.error('processWebhook error', err),
    );

    return { ok: true };
  }
}
