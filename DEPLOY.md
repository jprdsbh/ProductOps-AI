# Deploy no Railway — Changelog + Admin

Coloca **API + Web + PostgreSQL** online (o TBot continua local). O repo já está
pronto pra isso. Você faz os passos abaixo no painel do Railway (é a sua conta).

> **Visão geral:** 3 "serviços" no mesmo projeto Railway:
> `Postgres` (banco) · `api` (NestJS) · `web` (Next.js), todos a partir deste repo.

---

## 1. Criar o projeto
1. Acesse **railway.app** → **New Project** → **Deploy from GitHub repo**
2. Selecione **`jprdsbh/ProductOps-AI`**
3. Quando ele criar o primeiro serviço, você vai ajustá-lo (vira o `api`) e depois adiciona os outros.

## 2. Banco de dados
- No projeto → **New** → **Database** → **Add PostgreSQL**
- Isso cria a variável `DATABASE_URL` (vamos referenciar nos serviços).

## 3. Serviço `api` (NestJS)
Em **Settings** do serviço:
- **Root Directory:** `/` (raiz do repo — necessário pros workspaces)
- **Build Command:**
  ```
  npm install --include=dev && npm run build -w apps/api
  ```
  > `--include=dev` é obrigatório: o Railway usa `NODE_ENV=production`, que faria o `npm install` pular o `nest`/`prisma`/`typescript` (devDependencies) e o build falharia.
- **Start Command:**
  ```
  npm run start:prod -w apps/api
  ```
  > `start:prod` roda `prisma db push` (cria as tabelas) e sobe a API.

**Variables** (aba Variables):
| Var | Valor |
|-----|-------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | uma string longa aleatória (≥32 chars) |
| `ANTHROPIC_API_KEY` | sua chave da Anthropic |
| `CLICKUP_API_KEY` | seu token do ClickUp |
| `CLICKUP_SPACE_ID` | `901313179251` |
| `CLICKUP_TRIGGER_STATUS` | `closed` |
| `ADMIN_EMAIL` | seu e-mail de admin |
| `ADMIN_PASSWORD` | uma senha forte |
| `WEB_URL` | `https://${{web.RAILWAY_PUBLIC_DOMAIN}}` |
| `NODE_ENV` | `production` |

- Em **Settings → Networking → Generate Domain** (gera a URL pública da API).

## 4. Serviço `web` (Next.js)
- No projeto → **New** → **GitHub Repo** → mesmo repo → o serviço será o `web`.
- **Settings:**
  - **Root Directory:** `/`
  - **Build Command:**
    ```
    npm install --include=dev && npm run build -w apps/web
    ```
  - **Start Command:**
    ```
    npm run start:prod -w apps/web
    ```
- **Variables:**
  | Var | Valor |
  |-----|-------|
  | `API_URL` | `https://${{api.RAILWAY_PUBLIC_DOMAIN}}` |
  | `NODE_ENV` | `production` |
- **Generate Domain** (gera a URL pública do site).

> O `API_URL` precisa existir **no build** do web (o Next injeta no bundle). Se você
> mudar a URL da API depois, **rode o deploy do web de novo**.

## 5. Criar o usuário admin (uma vez)
Após o `api` subir, abra o serviço `api` → aba **Settings → Deploy → Run a command** (ou o terminal do serviço) e rode:
```
npm run db:seed -w apps/api
```
Isso cria o admin com `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## 6. Pronto
- **Changelog público:** `https://<web>.up.railway.app/changelog`
- **Admin:** `https://<web>.up.railway.app/admin`

---

## Notas
- **Ordem:** crie `api` e `web`, gere os domínios dos dois, e confirme que `WEB_URL` (no api) e `API_URL` (no web) apontam um pro outro. Se ajustar depois, **redeploy**.
- **Cookies/HTTPS:** em produção o cookie de sessão é `Secure` (exige HTTPS — o Railway já fornece).
- **Sync do ClickUp:** roda via cron (9h) ou pelo botão "Buscar do ClickUp" no admin.
- **Custo:** uso de IA (Anthropic) e horas de serviço no Railway são cobrados conforme uso.
- **TBot:** não vai pra nuvem aqui (precisa de Chrome + IMAP + é sessão-única no sandbox). Continua rodando local via `start.bat`.
