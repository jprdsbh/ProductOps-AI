import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { ReleaseNotesModule } from './release-notes/release-notes.module';
import { AiModule } from './ai/ai.module';
import { SubscribersModule } from './subscribers/subscribers.module';
import { ClickupSyncModule } from './clickup-sync/clickup-sync.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { FileUploadModule } from './file-upload/file-upload.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    AiModule,
    WebhooksModule,
    ReleaseNotesModule,
    SubscribersModule,
    ClickupSyncModule,
    KnowledgeModule,
    FileUploadModule,
  ],
})
export class AppModule {}
