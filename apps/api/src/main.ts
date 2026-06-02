import * as path from 'path';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
// Load .env before anything else — works regardless of process.cwd()
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

async function bootstrap() {
  // rawBody: true preserves the raw buffer needed for HMAC webhook verification
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Atrás de proxy (Railway/Render/etc.): confia no X-Forwarded-* para o
  // rate-limit identificar o IP real e o cookie Secure funcionar sob HTTPS.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // ── Segurança: headers de proteção (HSTS, no-sniff, frame-deny, etc.) ──
  // CORP em 'cross-origin' pra o web (3001) conseguir carregar imagens de /uploads (3002).
  // CSP desligado aqui: a API serve JSON/imagens, não HTML — quem renderiza é o Next.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // ── Rate limiting: mitiga brute-force / abuso (ex.: login) ──
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 min
      max: 300,                 // 300 req/IP/janela para a API em geral
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  // Limite mais rígido no login (anti brute-force)
  app.use(
    '/api/auth/login',
    rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false }),
  );

  app.use(cookieParser());

  app.enableCors({
    origin: process.env.WEB_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  // ── Validação global: remove campos não esperados (anti mass-assignment) ──
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );

  // Serve uploaded images (screenshots from TBot, etc.)
  const uploadsDir = path.resolve(__dirname, '../../uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  app.use('/uploads', express.static(uploadsDir));

  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`API running on http://localhost:${port}/api`);
}

bootstrap();
