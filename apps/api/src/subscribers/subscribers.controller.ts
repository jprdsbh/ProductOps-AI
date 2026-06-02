import { Controller, Post, Get, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { SubscribersService } from './subscribers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('subscribers')
export class SubscribersController {
  constructor(private service: SubscribersService) {}

  @Post()
  subscribe(@Body() body: { email: string }) {
    return this.service.subscribe(body.email);
  }

  @Post('unsubscribe')
  unsubscribeByToken(@Body() body: { token: string }) {
    return this.service.unsubscribe(body.token);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.service.findAll(+page, +limit);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
