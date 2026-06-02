import httpx
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env", override=True)

BASE_URL = "https://api.clickup.com/api/v2"

SCOPE_FIELD_ID = "d5652494-7db4-483f-ad60-b237d05a01c2"
ALLOWED_SCOPES = {
    "ad69edce-1ad9-41a7-bf11-c28eaa0bcd2b": "Frontend",
    "edd13c4d-d4bf-415b-b4c8-f7fdda62eca0": "Backend",
    "6da607dd-92f5-4f09-87bf-4f1d7fee4998": "Fullstack",
}
TESTABLE_SCOPES = {"Frontend", "Fullstack"}


def _headers():
    token = os.getenv("CLICKUP_TOKEN")
    if not token:
        raise RuntimeError("CLICKUP_TOKEN not set in environment")
    return {"Authorization": token}


def get_task(task_id: str) -> dict:
    r = httpx.get(f"{BASE_URL}/task/{task_id}", headers=_headers(), timeout=15)
    r.raise_for_status()
    return r.json()


def get_task_comments(task_id: str) -> list[dict]:
    """
    Retorna os comentários da task (mais antigos primeiro), com autor e texto.
    Usado para captar direcionamentos de teste deixados pelos devs.
    """
    try:
        r = httpx.get(f"{BASE_URL}/task/{task_id}/comment", headers=_headers(), timeout=15)
        r.raise_for_status()
        comments = r.json().get("comments", [])
    except Exception:
        return []

    result = []
    for c in comments:
        # comment_text é o texto plano; comment é a versão estruturada (fallback)
        text = (c.get("comment_text") or "").strip()
        if not text and isinstance(c.get("comment"), list):
            text = "".join(seg.get("text", "") for seg in c["comment"]).strip()
        if not text:
            continue
        user = c.get("user", {}) or {}
        result.append({
            "author": user.get("username") or user.get("email") or "desconhecido",
            "text": text,
        })
    # ClickUp retorna mais recentes primeiro; inverte para ordem cronológica
    result.reverse()
    return result


def post_comment(task_id: str, comment: str):
    r = httpx.post(
        f"{BASE_URL}/task/{task_id}/comment",
        headers=_headers(),
        json={"comment_text": comment},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


def _extract_scope(custom_fields: list) -> str | None:
    for field in custom_fields:
        if field.get("id") != SCOPE_FIELD_ID:
            continue
        value = field.get("value")
        if value is None:
            return None
        if isinstance(value, int):
            for opt in field.get("type_config", {}).get("options", []):
                if opt.get("orderindex") == value:
                    return opt.get("name")
        if isinstance(value, str):
            return ALLOWED_SCOPES.get(value, value)
    return None


def get_pending_test_tasks() -> list[dict]:
    """
    Retorna tasks com status 'test (in sandbox)' e escopo Frontend ou Fullstack,
    buscando em todos os sprints da pasta Sprints do espaço configurado.
    """
    space_id = os.getenv("CLICKUP_SPACE_ID", "901313179251")
    target_status = os.getenv("TARGET_STATUS", "test (in sandbox)").lower()

    # Busca pastas do espaço
    r = httpx.get(f"{BASE_URL}/space/{space_id}/folder?archived=false", headers=_headers(), timeout=15)
    r.raise_for_status()
    folders = r.json().get("folders", [])

    sprints_folder = next(
        (f for f in folders if "sprint" in f.get("name", "").lower()), None
    )
    if not sprints_folder:
        return []

    # Busca listas (sprints)
    r = httpx.get(f"{BASE_URL}/folder/{sprints_folder['id']}/list?archived=false", headers=_headers(), timeout=15)
    r.raise_for_status()
    lists = r.json().get("lists", [])

    results = []
    for lst in lists:
        page = 0
        while True:
            r = httpx.get(
                f"{BASE_URL}/list/{lst['id']}/task",
                headers=_headers(),
                params={"include_closed": "false", "subtasks": "false", "page": page},
                timeout=15,
            )
            r.raise_for_status()
            tasks = r.json().get("tasks", [])

            for task in tasks:
                status = (task.get("status", {}).get("status") or "").lower()
                if target_status not in status:
                    continue
                scope = _extract_scope(task.get("custom_fields", []))
                if scope not in TESTABLE_SCOPES:
                    continue
                results.append({
                    "id":         task["id"],
                    "name":       task.get("name", ""),
                    "url":        task.get("url", ""),
                    "status":     task.get("status", {}).get("status", ""),
                    "scope":      scope,
                    "sprint":     lst.get("name", ""),
                    "custom_id":  task.get("custom_id") or task.get("id"),
                    "assignees":  [a.get("username") or a.get("email", "") for a in task.get("assignees", [])],
                })

            if len(tasks) < 100:
                break
            page += 1

    return results
