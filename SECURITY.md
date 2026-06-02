# Segurança — release-notes-ai

Documento da postura de segurança do sistema. Atualize ao mudar dependências ou controles.

## Controles implementados

### API (NestJS)
- **Helmet** — headers de proteção (HSTS, X-Frame-Options, X-Content-Type-Options nosniff). CSP desligado (API serve JSON/imagens, não HTML); CORP em `cross-origin` para o web (3001) carregar imagens de `/uploads`.
- **Rate limiting** (`express-rate-limit`) — 300 req/15min geral; **10 req/15min no `/api/auth/login`** (anti brute-force).
- **ValidationPipe global** — `whitelist: true` remove campos não esperados (anti mass-assignment).
- **Auth** — JWT em cookie `HttpOnly` + `Secure` (prod) + `SameSite=lax`; senhas com bcrypt.
- **KB interna** — endpoints `/api/knowledge` protegidos por `INTERNAL_API_TOKEN` (server-to-server).
- **Webhook ClickUp** — verificação HMAC quando `CLICKUP_WEBHOOK_SECRET` definido.

### Web (Next.js)
- **XSS do JSON-LD corrigido** — o changelog escapa `<` ao serializar dados estruturados, evitando quebra do `<script>` via título de task malicioso.
- Conteúdo das notas renderizado via React (escapado por padrão).

### TBot (análise de segurança no front durante o teste)
`security.py` inspeciona cada tela testada e reporta (no parecer + na KB, categoria `security`):
- Erros/CSP/mixed content no console
- Segredos vazados em respostas de API (JWT, chaves AWS/Anthropic/Google/Stripe, ClickUp token, senha em texto plano)
- PII exposta (CPF/cartão)
- Cookies de sessão sem HttpOnly/Secure
- Token de sessão em `localStorage` (risco de XSS)

### Scan automático (dev / CI)
`npm run security:scan` (ou `security-scan.bat`):
- `npm audit` (deps vulneráveis)
- Segredos hardcoded no código (falha se fora de `.env`)
- Padrões de risco (eval, `dangerouslySetInnerHTML`, exec com interpolação)
- Supressão de falso-positivo revisado com marcador `security-scan-ignore` (até 3 linhas acima)
- Exit code ≠ 0 em achado de severidade alta → serve de gate de CI.

## Segredos
- `.env` está no `.gitignore` e o projeto **não é repositório git** — sem histórico para vazar.
- Chaves reais (Anthropic, ClickUp) e senha vivem só nos `.env` locais.

## Risco aceito — dependências (revisar quando houver janela)
`npm audit` aponta vulnerabilidades **transitivas** cujas correções exigem **upgrade major breaking**.
Tentativa de `npm audit fix --force` gerou árvore inconsistente (NestJS core 11 + common 10; Next 14→16) e foi **revertida**.

A maioria é **build-time / dev tooling** (`@nestjs/cli`, `@angular-devkit/*`, `webpack`) ou framework
(`next`, `@nestjs/*`), de baixo risco real neste contexto (ferramenta interna, localhost, admin atrás de JWT + rate-limit).

### Plano de remediação correto (migração deliberada, não `--force`)
1. **NestJS 10 → 11**: subir **todos** os `@nestjs/*` juntos para `^11` (core, common, platform-express, config, schedule, cli, schematics) — manter o major alinhado. Rodar testes/boot.
2. **Next 14 → 15**: migração com mudanças de código — `searchParams`/`params` viram assíncronos (ex.: `apps/web/src/app/changelog/page.tsx` usa `searchParams` síncrono). Seguir o codemod oficial (`npx @next/codemod@latest`).
3. Após cada major, rodar `npm run security:scan` e validar o boot dos 3 serviços.
4. Evitar pular dois majors de uma vez (não ir direto pro Next 16).

## Como rodar o scan
```
npm run security:scan
```
