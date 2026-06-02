"""
Análise de segurança do front durante o teste do TBot.

Enquanto testa a feature do dev, o TBot também inspeciona a tela em busca de
problemas de segurança comuns (OWASP-ish), ajudando a achar falhas no código
produzido pelos devs ANTES de ir pra produção:

- Erros/warnings no console do browser (inclui exceções JS, CSP, mixed content)
- Segredos/tokens vazados em respostas de API ou no storage (JWT, API keys, chaves)
- PII exposta indevidamente (CPF, cartão) em respostas
- Cookies inseguros (sem HttpOnly/Secure/SameSite)
- Storage local guardando tokens de sessão (risco de XSS roubar)

Cada achado tem severidade (high/medium/low). Tudo best-effort: nunca quebra o teste.
"""
import re

# ─── Padrões de detecção ──────────────────────────────────────────────────────

# JWT (header.payload.signature em base64url)
_JWT = re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")
# Chaves de provedores comuns
_SECRET_PATTERNS = [
    ("AWS Access Key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("Anthropic API Key", re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}")),
    ("OpenAI API Key", re.compile(r"\bsk-[A-Za-z0-9]{32,}\b")),
    ("Google API Key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("Stripe Secret Key", re.compile(r"\b(sk|rk)_(live|test)_[0-9A-Za-z]{16,}\b")),
    ("Chave privada", re.compile(r"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----")),
    ("ClickUp Token", re.compile(r"\bpk_\d+_[A-Z0-9]{20,}\b")),
]
# PII brasileira
_CPF = re.compile(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b")
_CARD = re.compile(r"\b(?:\d[ -]?){13,16}\b")
# Senha em texto plano em payload JSON
_PASSWORD_FIELD = re.compile(r'"(?:password|senha|secret|pwd)"\s*:\s*"[^"]{3,}"', re.IGNORECASE)


def _scan_text_for_secrets(text: str, where: str) -> list[dict]:
    findings = []
    if not text:
        return findings

    if _JWT.search(text):
        findings.append({"severity": "high", "type": "Token JWT exposto",
                         "detail": f"JWT encontrado em {where}. Tokens não devem trafegar/ficar visíveis fora de headers/cookies seguros."})
    for name, pat in _SECRET_PATTERNS:
        if pat.search(text):
            findings.append({"severity": "high", "type": f"Segredo exposto ({name})",
                             "detail": f"Padrão de {name} encontrado em {where}. Credenciais nunca devem ir ao front."})
    if _PASSWORD_FIELD.search(text):
        findings.append({"severity": "high", "type": "Senha em texto plano",
                         "detail": f"Campo de senha/segredo em texto plano em {where}."})
    if _CPF.search(text):
        findings.append({"severity": "medium", "type": "PII exposta (CPF)",
                         "detail": f"CPF em {where}. Confirme se a exposição é necessária e se há mascaramento."})
    return findings


def analyze(driver, network_lines: list[str]) -> list[dict]:
    """Roda a varredura de segurança na sessão atual e retorna lista de achados."""
    findings: list[dict] = []

    # 1) Console do browser (erros JS, CSP, mixed content)
    try:
        logs = driver.get_log("browser")
        errors = [l for l in logs if l.get("level") == "SEVERE"]
        warnings = [l for l in logs if l.get("level") == "WARNING"]
        for l in errors[:10]:
            msg = (l.get("message") or "")[:200]
            sev = "high" if ("mixed content" in msg.lower() or "content security policy" in msg.lower()) else "medium"
            findings.append({"severity": sev, "type": "Erro no console", "detail": msg})
        for l in warnings[:5]:
            msg = (l.get("message") or "")[:160]
            if any(k in msg.lower() for k in ("deprecat", "csp", "insecure", "cookie", "cors")):
                findings.append({"severity": "low", "type": "Aviso no console", "detail": msg})
    except Exception:
        pass

    # 2) Segredos/PII em respostas de API capturadas
    for line in (network_lines or []):
        findings.extend(_scan_text_for_secrets(line, "resposta de API"))

    # 3) Storage local guardando tokens (risco de XSS)
    try:
        store = driver.execute_script(
            "try { return JSON.stringify(Object.assign({}, window.localStorage)); } catch(e){ return '{}'; }"
        ) or "{}"
        if _JWT.search(store) or re.search(r'"(access_?token|refresh_?token|jwt|auth)"', store, re.IGNORECASE):
            findings.append({"severity": "medium", "type": "Token em localStorage",
                             "detail": "Token de sessão guardado em localStorage — vulnerável a roubo via XSS. Prefira cookie HttpOnly."})
        findings.extend(_scan_text_for_secrets(store[:2000], "localStorage"))
    except Exception:
        pass

    # 4) Cookies inseguros
    try:
        for c in driver.get_cookies():
            name = c.get("name", "")
            flags = []
            if not c.get("secure"):
                flags.append("sem Secure")
            if not c.get("httpOnly"):
                flags.append("sem HttpOnly")
            # Só alerta para cookies que parecem de sessão/auth
            if flags and re.search(r"(session|token|auth|jwt|sid)", name, re.IGNORECASE):
                findings.append({"severity": "medium", "type": "Cookie de sessão inseguro",
                                 "detail": f"Cookie '{name}' {' e '.join(flags)}. Cookies de autenticação devem ser Secure + HttpOnly."})
    except Exception:
        pass

    # Dedup simples por (type, detail)
    seen = set()
    unique = []
    for f in findings:
        k = (f["type"], f["detail"][:80])
        if k not in seen:
            seen.add(k)
            unique.append(f)
    return unique


def summarize(findings: list[dict]) -> str:
    """Resumo textual pra entrar no parecer de QA."""
    if not findings:
        return "Nenhum problema de segurança evidente detectado no front durante o teste."
    order = {"high": 0, "medium": 1, "low": 2}
    findings = sorted(findings, key=lambda f: order.get(f["severity"], 3))
    icon = {"high": "🔴", "medium": "🟠", "low": "🟡"}
    lines = [f"{icon.get(f['severity'], '⚪')} [{f['severity'].upper()}] {f['type']}: {f['detail']}" for f in findings]
    return "\n".join(lines)
