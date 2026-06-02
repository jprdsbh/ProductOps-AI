import { Module } from '@nestjs/common';
import { ClickupSyncService } from './clickup-sync.service';
import { ClickupSyncController } from './clickup-sync.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [PrismaModule, AiModule],
  providers: [ClickupSyncService],
  controllers: [ClickupSyncController],
  exports: [ClickupSyncService],
})
export class ClickupSyncModule {}
