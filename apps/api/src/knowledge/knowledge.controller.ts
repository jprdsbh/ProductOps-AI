import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { KnowledgeService, UpsertKnowledgeInput } from './knowledge.service';
import { InternalTokenGuard } from './internal-token.guard';

@Controller('knowledge')
@UseGuards(InternalTokenGuard)
export class KnowledgeController {
  constructor(private service: KnowledgeService) {}

  @Get()
  query(
    @Query('category') category?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.query({ category, q, limit: limit ? +limit : undefined });
  }

  @Post()
  upsert(@Body() body: UpsertKnowledgeInput) {
    return this.service.upsert(body);
  }
}
