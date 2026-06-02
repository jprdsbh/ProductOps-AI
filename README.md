# ProductOps-AI

> Suíte de **Product Ops**: release notes geradas com IA (com aprovação humana) + um agente autônomo de QA (**TBot**) que testa o produto, valida segurança e aprende a cada execução.

Monorepo que une duas frentes que **aprendem juntas** sobre uma base de conhecimento compartilhada:

1. **Release Notes AI** — sincroniza tarefas do ClickUp, gera o changelog com IA, passa por aprovação humana e publica num changelog público + notifica assinantes.
2. **TBot (QA Agent)** — lê a tarefa (título, descrição e comentários), monta um plano de teste, executa no browser via Selenium guiado por visão do Claude, captura chamadas de API, faz análise de segurança e gera um parecer de QA.

---

## ✨ Funcionalidades

### Release Notes AI
- **Sync com ClickUp** — agrupa tarefas relacionadas em uma única nota:
  - Pai + subtarefas colapsados (ex.: UX&UI + implementação Frontend)
  - Frontend + Backend do mesmo épico combinados
  - Filtra scopes que não viram release (UX/UI isolada, Análise, etc.)
- **Geração com IA econômica** — Claude Haiku + cache persistente + prompt caching + processamento em lote
- **Aprovação humana** antes de publicar (nada vai ao ar automaticamente)
- **Changelog público** com SEO (JSON-LD), filtros e inscrição por e-mail
- Distingue **data em que a modificação subiu** (`releasedAt`, quando foi pra "closed" no ClickUp) da **data de aprovação** (`publishedAt`)

### TBot — Agente de QA
- Disparado por **webhook do ClickUp** ou manualmente pelo admin
- Lê **título + descrição + comentários** da tarefa (capta direcionamentos dos devs)
- **Plano de teste editável** e **persistido por tarefa** (reaproveitado em loops, sem regerar com IA)
- Execução no browser (**Selenium + visão do Claude**): screenshot → decide ação → executa → aprende a página
- **Captura de rede** (requests/responses) → valida payloads (ex.: `billing_address`) via ação `inspect_api`
- **Guardrail de navegação** anti-alucinação de URL (só navega para hosts conhecidos)
- **Análise de segurança** do front: console, segredos/PII vazados, cookies inseguros, token em localStorage
- **Acompanhamento ao vivo** no admin (ação atual + screenshots em tempo real) + botão de **interromper**
- Opção de **usar sua própria sessão do Chrome** (sem novo login)

### Base de conhecimento compartilhada
TBot e o agente de release escrevem e leem a mesma KB (Postgres): rotas reais validadas, navegações que funcionaram e achados de segurança. Quanto mais roda, mais preciso fica.

### Segurança
- API com **Helmet**, **rate limiting** e **ValidationPipe**
- Scanner de segurança repetível: `npm run security:scan` (deps vulneráveis, segredos hardcoded, padrões de risco)
- Detalhes em [`SECURITY.md`](./SECURITY.md)

---

## 🏗️ Arquitetura

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Web 3001  │────▶│   API 3002   │◀───▶│ PostgreSQL  │
│  Next.js    │     │   NestJS     │     │  (Docker)   │
│ admin +     │     │ release-notes│     └─────────────┘
│ changelog   │     │ clickup sync │            ▲
└─────────────┘     │ IA / auth    │            │ KB compartilhada
                    │ knowledge    │            │
                    └──────────────┘            │
                           ▲                    │
                    webhook │                   │
                           │             ┌──────────────┐
        ClickUp ───────────┴────────────▶│  TBot 8000   │
                                         │  FastAPI     │
                                         │  Selenium +  │
                                         │  Claude      │
                                         └──────────────┘
```

| App | Stack | Porta | Papel |
|-----|-------|-------|-------|
| `apps/api` | NestJS · Prisma · PostgreSQL | 3002 | Release notes, sync ClickUp, IA, auth, KB |
| `apps/web` | Next.js 14 · Tailwind | 3001 | Admin (`/admin`) + changelog público (`/changelog`) |
| `apps/tbot` | FastAPI · Selenium · SQLAlchemy | 8000 | Agente de QA |
| `packages/shared` | TypeScript | — | Tipos compartilhados |

**IA:** Claude (Haiku para texto, Sonnet para visão) via API da Anthropic.
**Infra:** Turborepo · Docker (Postgres) · PM2 (orquestração dos serviços).

---

## 🚀 Como rodar

### Pré-requisitos
- Node.js 18+
- Python 3.11+
- Docker (para o PostgreSQL)
- PM2 (`npm i -g pm2`)

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar variáveis de ambiente
Copie os modelos e preencha com suas credenciais (nenhum segredo vai no repositório):
```bash
cp apps/api/.env.example  apps/api/.env
cp apps/tbot/.env.example apps/tbot/.env
```
Principais chaves: `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`, `CLICKUP_API_KEY` (API);
`SANDBOX_URL/USER/PASS`, `ANTHROPIC_API_KEY`, `EMAIL_APP_PASSWORD` (TBot).

### 3. Subir o banco e aplicar o schema
```bash
docker compose up -d
npm run db:push --workspace=apps/api
```

### 4. Subir tudo
No Windows, um clique no **`start.bat`** sobe Docker + PostgreSQL + API + Web + TBot via PM2.
Ou manualmente:
```bash
npm run build
pm2 start ecosystem.config.js
```

### Acessos
- Admin: http://localhost:3001/admin
- Changelog: http://localhost:3001/changelog
- API: http://localhost:3002/api
- TBot (docs): http://localhost:8000/docs

---

## 🔒 Segurança

```bash
npm run security:scan   # deps vulneráveis + segredos hardcoded + padrões de risco
```

Segredos vivem apenas nos `.env` locais (ignorados pelo git). Veja [`SECURITY.md`](./SECURITY.md) para a postura completa e o plano de upgrade de dependências.

---

## 📦 Scripts úteis

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Sobe tudo em modo desenvolvimento (Turborepo) |
| `npm run build` | Build de todos os apps |
| `npm run db:push` | Aplica o schema Prisma no banco |
| `npm run security:scan` | Scan de segurança |
| `pm2 status` / `pm2 logs` | Status / logs dos serviços |

---

## ⚠️ Observações

- Projeto interno de uma fintech (TamboretePay). Datas, contas e domínios nos exemplos são de **sandbox**.
- O changelog gera conteúdo via IA, mas **nada é publicado sem aprovação humana**.
- O TBot opera apenas em **ambiente de sandbox** para testes.
