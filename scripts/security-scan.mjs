#!/usr/bin/env node
/**
 * Scan de segurança do projeto (boas práticas de mercado, repetível).
 *
 * Roda 3 análises e gera um relatório:
 *   1. Dependências vulneráveis    → `npm audit` (high/critical falham o scan)
 *   2. Segredos vazados no código   → regex de chaves/tokens em arquivos versionáveis
 *   3. Padrões de risco             → eval, dangerouslySetInnerHTML, exec com interpolação
 *
 * Uso:  node scripts/security-scan.mjs   (ou:  security-scan.bat)
 * Exit code != 0 se houver achados de severidade alta → serve de gate em CI.
 */
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();
const IGNORE_DIRS = new Set(['node_modules', '.next', 'dist', '.git', 'venv', '__pycache__', 'uploads', 'screenshots', '.turbo', 'coverage']);
const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.json', '.env', '.yml', '.yaml', '.bat', '.sh']);

let high = 0, medium = 0, low = 0;
const report = [];
function add(sev, category, msg) {
  if (sev === 'high') high++; else if (sev === 'medium') medium++; else low++;
  report.push({ sev, category, msg });
}

// ─── 1. Dependências vulneráveis ──────────────────────────────────────────────
function auditDeps() {
  try {
    const out = execSync('npm audit --json', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const data = JSON.parse(out);
    const v = data.metadata?.vulnerabilities ?? {};
    const crit = v.critical ?? 0, hi = v.high ?? 0, mod = v.moderate ?? 0, lo = v.low ?? 0;
    if (crit) add('high', 'deps', `${crit} dependência(s) com vulnerabilidade CRÍTICA (rode 'npm audit' p/ detalhes)`);
    if (hi)   add('high', 'deps', `${hi} dependência(s) com vulnerabilidade ALTA`);
    if (mod)  add('medium', 'deps', `${mod} dependência(s) com vulnerabilidade moderada`);
    if (lo)   add('low', 'deps', `${lo} dependência(s) com vulnerabilidade baixa`);
    if (!crit && !hi && !mod && !lo) report.push({ sev: 'ok', category: 'deps', msg: 'Nenhuma vulnerabilidade conhecida nas dependências npm.' });
  } catch (e) {
    // npm audit retorna exit !=0 quando acha vulnerabilidades; tenta parsear stdout do erro
    try {
      const data = JSON.parse(e.stdout?.toString() || '{}');
      const v = data.metadata?.vulnerabilities ?? {};
      if (v.critical) add('high', 'deps', `${v.critical} crítica(s)`);
      if (v.high) add('high', 'deps', `${v.high} alta(s)`);
      if (v.moderate) add('medium', 'deps', `${v.moderate} moderada(s)`);
      if (v.low) add('low', 'deps', `${v.low} baixa(s)`);
    } catch {
      report.push({ sev: 'ok', category: 'deps', msg: 'npm audit indisponível (sem lockfile/registro?) — pulado.' });
    }
  }
}

// ─── 2 + 3. Varredura de arquivos (segredos + padrões de risco) ────────────────
const SECRET_RULES = [
  ['AWS Access Key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Anthropic API Key', /sk-ant-[A-Za-z0-9_-]{30,}/],
  ['Google API Key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Stripe Secret', /\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{16,}\b/],
  ['ClickUp Token', /\bpk_\d+_[A-Z0-9]{24,}\b/],
  ['Chave privada', /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
];
const RISK_RULES = [
  ['eval()', /\beval\s*\(/, 'high'],
  ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/, 'medium'],
  ['child_process exec com template', /exec(?:Sync)?\s*\(\s*`[^`]*\$\{/, 'high'],
  ['document.write', /document\.write\s*\(/, 'low'],
];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (!IGNORE_DIRS.has(entry)) walk(full);
    } else if (SCAN_EXT.has(extname(entry)) || entry.startsWith('.env')) {
      scanFile(full);
    }
  }
}

function scanFile(file) {
  const rel = relative(ROOT, file);
  const isEnv = /(^|[\\/])\.env/.test(rel);
  const isScanner = rel.includes('security-scan') || rel.endsWith('security.py');
  let content;
  try { content = readFileSync(file, 'utf8'); } catch { return; }
  const lines = content.split(/\r?\n/);

  lines.forEach((line, i) => {
    for (const [name, re] of SECRET_RULES) {
      if (re.test(line)) {
        if (isScanner) continue; // ignora os próprios arquivos de detecção
        if (isEnv) add('medium', 'secret', `${name} em ${rel}:${i + 1} (em .env — confirme que está no .gitignore e nunca foi commitado)`);
        else       add('high', 'secret', `${name} HARDCODED em ${rel}:${i + 1} — mova para variável de ambiente`);
      }
    }
    if (isScanner) return;
    // Permite suprimir um achado revisado com marcador na linha ou até 3 linhas acima
    const window = [line, lines[i - 1], lines[i - 2], lines[i - 3]].join('\n');
    if (window.includes('security-scan-ignore')) return;
    for (const [name, re, sev] of RISK_RULES) {
      if (re.test(line)) add(sev, 'risk', `${name} em ${rel}:${i + 1}`);
    }
  });
}

// ─── Execução ──────────────────────────────────────────────────────────────────
console.log('\n🔒 Security Scan — release-notes-ai\n' + '─'.repeat(50));
auditDeps();
walk(ROOT);

const icon = { high: '🔴', medium: '🟠', low: '🟡', ok: '✅' };
const byCat = { deps: 'Dependências', secret: 'Segredos', risk: 'Padrões de risco' };
for (const cat of ['deps', 'secret', 'risk']) {
  const items = report.filter((r) => r.category === cat);
  if (!items.length) continue;
  console.log(`\n${byCat[cat]}:`);
  for (const r of items) console.log(`  ${icon[r.sev] ?? '•'} ${r.msg}`);
}

console.log('\n' + '─'.repeat(50));
console.log(`Resumo: 🔴 ${high} alta  ·  🟠 ${medium} média  ·  🟡 ${low} baixa`);
if (high > 0) {
  console.log('❌ Scan FALHOU — há achados de severidade alta.\n');
  process.exit(1);
}
console.log('✅ Sem achados de severidade alta.\n');
