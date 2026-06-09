/**
 * Gerenciador do túnel TBot (self-healing).
 *
 * O que faz:
 *  1. Sobe um Cloudflare Quick Tunnel apontando pro TBot local (localhost:8000)
 *  2. Captura a URL *.trycloudflare.com gerada
 *  3. Atualiza TBOT_URL no Railway (serviço web) → admin em prod volta a achar o TBot
 *  4. Mantém o túnel vivo; se cair, o PM2 reinicia este script → nova URL → reatualiza
 *
 * Roda sob PM2 (techdirector-tunnel), então sobe junto com a máquina.
 *
 * Requisitos:
 *  - tools/cloudflared.exe (binário oficial, já baixado)
 *  - Railway CLI no PATH + token em C:\Users\<user>\.railway-token
 *
 * Nota honesta: Quick Tunnel (trycloudflare) é grátis e sem login, ideal pra
 * ferramenta interna de QA. Para algo "produção dura" o ideal é um named tunnel
 * em conta Cloudflare própria (ver TUNNEL.md) — mas isso exige login interativo.
 */
import { spawn, execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLOUDFLARED = join(__dirname, 'cloudflared.exe');
const TBOT_LOCAL = process.env.TBOT_LOCAL_URL || 'http://localhost:8000';
const RAILWAY_SERVICE = '@techdirector/web';
const TOKEN_FILE = join(homedir(), '.railway-token');

function log(msg) {
  console.log(`[tunnel-manager] ${new Date().toISOString()} ${msg}`);
}

function updateRailway(url) {
  if (!existsSync(TOKEN_FILE)) {
    log(`AVISO: ${TOKEN_FILE} não existe — não consigo atualizar o Railway. URL: ${url}`);
    return;
  }
  const token = readFileSync(TOKEN_FILE, 'utf8').trim();
  try {
    log(`Atualizando TBOT_URL no Railway → ${url}`);
    execSync(
      `railway variables --service "${RAILWAY_SERVICE}" --set "TBOT_URL=${url}"`,
      { stdio: 'pipe', env: { ...process.env, RAILWAY_TOKEN: token }, timeout: 90000 },
    );
    log('Railway atualizado (vai redeployar o web automaticamente).');
  } catch (err) {
    log(`ERRO ao atualizar Railway: ${err.message}`);
  }
}

function start() {
  if (!existsSync(CLOUDFLARED)) {
    log(`ERRO: ${CLOUDFLARED} não encontrado.`);
    process.exit(1);
  }
  log(`Subindo túnel pra ${TBOT_LOCAL} ...`);
  const cf = spawn(CLOUDFLARED, ['tunnel', '--no-autoupdate', '--url', TBOT_LOCAL]);

  let captured = false;
  const onData = (buf) => {
    const s = buf.toString();
    process.stderr.write(s); // repassa logs do cloudflared
    if (!captured) {
      const m = s.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) {
        captured = true;
        log(`URL do túnel: ${m[0]}`);
        updateRailway(m[0]);
      }
    }
  };
  cf.stdout.on('data', onData);
  cf.stderr.on('data', onData);

  cf.on('exit', (code) => {
    log(`cloudflared saiu (code ${code}). Encerrando pra o PM2 reiniciar.`);
    process.exit(code ?? 1);
  });
}

start();
