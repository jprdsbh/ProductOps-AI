import { Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClickupSyncService } from './clickup-sync.service';

@Controller('clickup-sync')
@UseGuards(JwtAuthGuard)
export class ClickupSyncController {
  constructor(private sync: ClickupSyncService) {}

  @Post('trigger')
  async triggerSync() {
    const result = await this.sync.syncTasks();
    return { message: 'Sync triggered', ...result };
  }
}
