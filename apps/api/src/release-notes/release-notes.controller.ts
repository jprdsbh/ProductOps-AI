import {
  Controller, Get, Patch, Post, Body, Param, Query, UseGuards
} from '@nestjs/common';
import { ReleaseNotesService } from './release-notes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('release-notes')
export class ReleaseNotesController {
  constructor(private service: ReleaseNotesService) {}

  @UseGuards(JwtAuthGuard)
  @Post('manual')
  createManual(@Body() body: {
    clickupTaskId: string;
    clickupTaskUrl?: string;
    customId?: string;
    assigneeName?: string;
    rawTitle: string;
    rawDescription: string;
    category?: string;
    version?: string;
  }) {
    return this.service.createManual(body);
  }

  @Get('public')
  getPublished(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.service.findPublished(+page, +limit);
  }

  @UseGuards(JwtAuthGuard)
  @Get('pending')
  getPending(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.service.findPending(+page, +limit);
  }

  @UseGuards(JwtAuthGuard)
  @Get('archived')
  getArchived(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.service.findArchived(+page, +limit);
  }

  // IMPORTANTE: rotas estáticas (sem :id) precisam vir ANTES de ':id'.
  // Senão ':id' captura tudo (ex.: "ai-stats", "batches") e dá 404.
  @UseGuards(JwtAuthGuard)
  @Get('ai-stats')
  aiStats() {
    return this.service.getAiStats();
  }

  @UseGuards(JwtAuthGuard)
  @Get('batches')
  listBatches() {
    return this.service.listBatches();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.service.restore(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/approve')
  approve(
    @Param('id') id: string,
    @Body() body: { finalText: string; imageUrl?: string },
  ) {
    return this.service.approve(id, body.finalText, body.imageUrl);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/reject')
  reject(@Param('id') id: string) {
    return this.service.reject(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/text')
  updateText(
    @Param('id') id: string,
    @Body() body: { aiGenerated: string },
  ) {
    return this.service.updateText(id, body.aiGenerated);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/image')
  updateImage(
    @Param('id') id: string,
    @Body() body: { imageUrl: string },
  ) {
    return this.service.updateImage(id, body.imageUrl);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/unpublish')
  unpublish(@Param('id') id: string) {
    return this.service.unpublish(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/assignee')
  updateAssigneeName(
    @Param('id') id: string,
    @Body() body: { assigneeName: string },
  ) {
    return this.service.updateAssigneeName(id, body.assigneeName);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/custom-id')
  updateCustomId(
    @Param('id') id: string,
    @Body() body: { customId: string },
  ) {
    return this.service.updateCustomId(id, body.customId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/regenerate')
  regenerate(@Param('id') id: string) {
    return this.service.regenerate(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('regenerate-drafts')
  regenerateDrafts() {
    return this.service.regenerateDrafts();
  }

  @UseGuards(JwtAuthGuard)
  @Post('regenerate-all')
  regenerateAll() {
    return this.service.regenerateAll();
  }

  // ─── Batch API (50% off, async) ─────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Post('batch/submit')
  submitBatch(@Body() body: { includeFilled?: boolean }) {
    return this.service.submitBatch({ includeFilled: !!body?.includeFilled });
  }

  @UseGuards(JwtAuthGuard)
  @Post('batches/:id/process')
  processBatch(@Param('id') id: string) {
    return this.service.processBatch(id);
  }
}
