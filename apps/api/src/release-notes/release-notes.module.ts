import { Module } from '@nestjs/common';
import { ReleaseNotesController } from './release-notes.controller';
import { ReleaseNotesService } from './release-notes.service';
import { AiModule } from '../ai/ai.module';
import { EmailModule } from '../email/email.module';
import { SubscribersModule } from '../subscribers/subscribers.module';

@Module({
  imports: [AiModule, EmailModule, SubscribersModule],
  controllers: [ReleaseNotesController],
  providers: [ReleaseNotesService],
})
export class ReleaseNotesModule {}
