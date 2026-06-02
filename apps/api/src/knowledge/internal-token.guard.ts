import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Guard server-to-server: libera se o header x-internal-token bate com
 * INTERNAL_API_TOKEN. Usado pelo TBot (FastAPI) pra ler/escrever na KB sem JWT.
 * Se o token não estiver configurado no ambiente, o acesso é negado por segurança.
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('INTERNAL_API_TOKEN');
    if (!expected) throw new UnauthorizedException('Internal token not configured');

    const req = context.switchToHttp().getRequest();
    const provided = req.headers['x-internal-token'];
    if (provided !== expected) throw new UnauthorizedException('Invalid internal token');
    return true;
  }
}
