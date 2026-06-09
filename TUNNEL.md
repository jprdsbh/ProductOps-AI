# Cloudflare Tunnel — Expondo o TBot local pra o admin em produção

## Por que precisamos disso

O **admin** roda em produção (Railway, `changelog.tpay.com.br`).
O **TBot** roda na sua máquina local (Selenium + Chrome).

Pra um chamar o outro com HTTPS e sem CORS quebrado, expomos o TBot via
**Cloudflare Tunnel** num subdomínio (`tbot.tpay.com.br`). É grátis, dá HTTPS
automático, URL fixa, sem abrir porta no roteador.

```
[ Browser do João ]
       │ https://changelog.tpay.com.br/admin
       ▼
[ Admin (Railway)     ]   ─── server-side fetch + X-TBot-Token ───►   [ Cloudflare Tunnel ]
[ /api/tbot/* proxy   ]                                                          │
                                                                                  ▼
                                                                       [ TBot local (PC) :8000 ]
```

## Setup (1 vez)

### 1. Instalar `cloudflared`
- Windows: baixe em https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/ (msi)
- Ou via winget: `winget install --id Cloudflare.cloudflared`

### 2. Autenticar com a conta Cloudflare da TPay
```powershell
cloudflared tunnel login
```
Abre o navegador → seleciona o domínio `tpay.com.br` → autoriza.

### 3. Criar o tunnel
```powershell
cloudflared tunnel create tbot
```
Anote o `Tunnel ID` que aparecer.

### 4. Configurar o tunnel
Crie/edite `C:\Users\<seu_usuario>\.cloudflared\config.yml`:
```yaml
tunnel: <Tunnel ID do passo 3>
credentials-file: C:\Users\<seu_usuario>\.cloudflared\<Tunnel ID>.json

ingress:
  - hostname: tbot.tpay.com.br
    service: http://localhost:8000
  - service: http_status:404
```

### 5. Apontar o DNS pro tunnel
```powershell
cloudflared tunnel route dns tbot tbot.tpay.com.br
```
Cria o CNAME `tbot.tpay.com.br` → `<Tunnel ID>.cfargotunnel.com` automaticamente.

### 6. Rodar o tunnel
```powershell
cloudflared tunnel run tbot
```
Ou instalar como serviço Windows pra iniciar com a máquina:
```powershell
cloudflared service install
```

### 7. Configurar variáveis no Railway (admin)
No serviço `web` do Railway:
- `TBOT_URL=https://tbot.tpay.com.br`
- `TBOT_TOKEN=<mesmo valor de apps/tbot/.env>`

E redeploy.

## Sanidade

Com o tunnel rodando, teste:
```powershell
# Direto no tunnel (deve dar 200 — o /health é livre)
curl https://tbot.tpay.com.br/health
# Tentando endpoint protegido SEM token (deve dar 401)
curl https://tbot.tpay.com.br/runs
# Com token (deve dar 200)
curl -H "X-TBot-Token: <seu token>" https://tbot.tpay.com.br/runs
```

## O que muda no fluxo do admin

- Botões "Capturar via TBot", "Rodar teste", "Postar no ClickUp" etc. **continuam funcionando** em produção.
- Por trás, eles vão pra `/api/tbot/*` (mesma origem) → proxy server-side adiciona o token → tunnel → TBot local.
- **Se o TBot estiver desligado**, o admin mostra erro 502 claro ("TBot inacessível"). Acenda o TBot + tunnel pra voltar.

## Segurança

- O **token nunca sai do server**. O navegador do usuário não vê `TBOT_TOKEN`.
- Sem token válido → 401 do TBot (não dispara nada).
- `/health` fica livre pra checagem; tudo mais exige token.
- CORS limitado: só `changelog.tpay.com.br` + localhost por padrão.
