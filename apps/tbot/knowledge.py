"""
Cliente da Base de Conhecimento compartilhada (vive na API NestJS / Postgres).

O TBot grava aqui o que aprende ao testar (rotas reais, navegação que funcionou,
insights de API) e lê antes de planejar um teste — assim ele e o Release-Agent
evoluem juntos sobre a MESMA base de conhecimento, reduzindo alucinação de URL.

Tudo é best-effort: se a API estiver fora, o TBot continua funcionando normalmente.
"""
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env", override=True)

API_URL = os.getenv("API_URL", "http://localhost:3002").rstrip("/")
INTERNAL_TOKEN = os.getenv("INTERNAL_API_TOKEN", "")


def _headers() -> dict:
    return {"x-internal-token": INTERNAL_TOKEN, "Content-Type": "application/json"}


def kb_query(category: str | None = None, q: str | None = None, limit: int = 10) -> list[dict]:
    """Busca conhecimento relevante. Retorna [] em qualquer falha."""
    if not INTERNAL_TOKEN:
        return []
    try:
        params = {"limit": limit}
        if category:
            params["category"] = category
        if q:
            params["q"] = q
        r = httpx.get(f"{API_URL}/api/knowledge", headers=_headers(), params=params, timeout=10)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"[TBot][KB] query falhou (ignorado): {e}")
        return []


def kb_upsert(category: str, key: str, content: str, *,
              title: str | None = None, data: dict | None = None,
              source: str = "tbot", confidence: float | None = None) -> bool:
    """Grava/atualiza um aprendizado. Retorna True se ok."""
    if not INTERNAL_TOKEN or not key or not content:
        return False
    try:
        payload = {
            "category": category,
            "key": key,
            "content": content,
            "source": source,
        }
        if title:
            payload["title"] = title
        if data is not None:
            payload["data"] = data
        if confidence is not None:
            payload["confidence"] = confidence
        r = httpx.post(f"{API_URL}/api/knowledge", headers=_headers(), json=payload, timeout=10)
        r.raise_for_status()
        return True
    except Exception as e:
        print(f"[TBot][KB] upsert falhou (ignorado): {e}")
        return False


def format_knowledge_for_prompt(entries: list[dict]) -> str:
    """Formata entradas da KB para injetar no prompt de interpretação."""
    if not entries:
        return ""
    lines = []
    for e in entries[:8]:
        cat = e.get("category", "")
        key = e.get("key", "")
        content = (e.get("content", "") or "")[:200]
        lines.append(f"- [{cat}] {key}: {content}")
    return "\n".join(lines)
