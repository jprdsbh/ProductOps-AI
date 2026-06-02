import hashlib
import hmac
import json
import os
import queue as _queue
import threading
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env", override=True)

from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from clickup_client import get_task, post_comment, get_pending_test_tasks, get_task_comments
from knowledge import kb_query, kb_upsert, format_knowledge_for_prompt
from ai_agent import interpret_task, generate_report
from tester import run_test
from screenshot import capture_screenshot
from database import SessionLocal, TestRun, get_test_plan, save_test_plan, recover_orphaned_runs

app = FastAPI(title="TBot - QA Automation Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://localhost:3003", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve screenshot files
SCREENSHOTS_DIR = Path(__file__).parent / "screenshots"
SCREENSHOTS_DIR.mkdir(exist_ok=True)
app.mount("/screenshots", StaticFiles(directory=str(SCREENSHOTS_DIR)), name="screenshots")

WEBHOOK_SECRET = os.getenv("CLICKUP_WEBHOOK_SECRET", "")
TARGET_STATUS  = os.getenv("TARGET_STATUS", "test (in sandbox)")

SCOPE_FIELD_ID = "d5652494-7db4-483f-ad60-b237d05a01c2"
ALLOWED_SCOPES = {
    "ad69edce-1ad9-41a7-bf11-c28eaa0bcd2b": "Frontend",
    "edd13c4d-d4bf-415b-b4c8-f7fdda62eca0": "Backend",
    "6da607dd-92f5-4f09-87bf-4f1d7fee4998": "Fullstack",
}


def _get_scope(task: dict) -> tuple[str, str]:
    for field in task.get("custom_fields", []):
        if field.get("id") != SCOPE_FIELD_ID:
            continue
        value = field.get("value")
        if value is None:
            return "", ""
        if isinstance(value, int):
            options = field.get("type_config", {}).get("options", [])
            for opt in options:
                if opt.get("orderindex") == value:
                    option_id = opt.get("id", "")
                    name = opt.get("name", option_id)
                    return option_id, name
        if isinstance(value, str):
            return value, ALLOWED_SCOPES.get(value, value)
    return "", ""


def verify_signature(body: bytes, signature: str) -> bool:
    if not WEBHOOK_SECRET:
        return True
    expected = hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.replace("sha256=", ""))


def _save_screenshots(run_id: str, screenshots: list) -> list[str]:
    """Salva screenshots em disco e retorna lista de URLs relativas."""
    urls = []
    for name, png_bytes in screenshots:
        filename = f"{run_id}_{name}.png"
        path = SCREENSHOTS_DIR / filename
        path.write_bytes(png_bytes)
        urls.append(f"/screenshots/{filename}")
    return urls


# Scopes testáveis no browser (têm UI). Backend/Dados/Doc/etc. não fazem sentido aqui.
TESTABLE_SCOPES = {"frontend", "fullstack"}


def _slug(text: str) -> str:
    import re
    s = re.sub(r"[^\w\s-]", "", (text or "").lower()).strip()
    return re.sub(r"[\s_-]+", "-", s)[:120] or "task"


def _record_learnings(task_id, task_name, scope_name, route_hint, comments, result, final_status):
    """Grava o que o TBot aprendeu neste teste na base compartilhada."""
    success = final_status == "passed"
    # Confiança maior quando passou; aprendizado de falha vale menos
    confidence = 0.75 if success else 0.4

    # 1) Aprendizado de NAVEGAÇÃO da feature (passos que rodaram + rota usada + resultado)
    steps_ran = [r.get("step", "") for r in result.get("steps_results", []) if r.get("step")]
    dev_dirs = "; ".join(c["text"] for c in (comments or [])[:3])
    nav_content = (
        f"Feature: {task_name}. Scope: {scope_name}. Resultado: {final_status}. "
        f"Rota usada: {route_hint or '(navegação pela UI)'}. "
        f"Direcionamentos dos devs: {dev_dirs or '—'}."
    )
    kb_upsert(
        "navigation",
        _slug(task_name),
        nav_content,
        title=task_name[:120],
        data={"route": route_hint, "success": success, "steps": steps_ran[:20], "task_id": task_id},
        confidence=confidence,
    )

    # 2) Se uma rota explícita foi usada e o teste passou, reforça o mapeamento de ROTA
    if route_hint and route_hint.strip().startswith("/") and success:
        kb_upsert(
            "route",
            route_hint.strip(),
            f"Rota validada em teste para a feature: {task_name}.",
            title=task_name[:120],
            data={"route": route_hint.strip(), "feature": task_name},
            confidence=confidence,
        )

    # 3) Endpoints de API observados (contexto de chamada) — útil pra entender dados
    net = result.get("network", []) or []
    if net:
        # extrai apenas as URLs (sem corpo) pra um índice enxuto
        urls = []
        for line in net:
            first = line.split("\n")[0].strip()
            if first and first not in urls:
                urls.append(first)
        if urls:
            kb_upsert(
                "test_learning",
                f"api-context:{_slug(task_name)}",
                "Chamadas de API observadas: " + " | ".join(urls[:12]),
                title=f"API context — {task_name[:90]}",
                data={"endpoints": urls[:20], "task_id": task_id},
                confidence=0.6,
            )

    # 4) Achados de segurança → KB (category 'security') pra histórico e tendência
    sec = result.get("security", []) or []
    if sec:
        highs = [f for f in sec if f.get("severity") == "high"]
        summary = "; ".join(f"[{f['severity']}] {f['type']}" for f in sec[:8])
        kb_upsert(
            "security",
            f"sec:{_slug(task_name)}",
            f"Achados de segurança no teste de '{task_name}': {summary}",
            title=f"Segurança — {task_name[:90]}",
            data={"findings": sec[:20], "high_count": len(highs), "task_id": task_id},
            confidence=0.7,
        )


# Cancelamento de testes em andamento (chave = run_id)
_cancel_flags: set[str] = set()
_active_drivers: dict = {}


def process_task(task_id: str, steps: list[str] | None = None, extra_instructions: str | None = None, route_hint: str | None = None):
    """Lê → interpreta → testa → salva no DB (sem postar no ClickUp). Roda no worker thread.

    steps:              passos confirmados/editados pelo QA (se vazio, o bot gera)
    extra_instructions: instruções adicionais do QA pra guiar a geração de passos
    route_hint:         caminho conhecido (ex.: '/sales') pra evitar o bot adivinhar URL
    """
    db = SessionLocal()
    run = None
    try:
        print(f"[TBot] Processing task {task_id}...")

        task      = get_task(task_id)
        task_name = task.get("name", task_id)
        description = task.get("description", "") or task.get("text_content", "")
        status    = task.get("status", {}).get("status", "").lower()

        scope_id, scope_name = _get_scope(task)
        print(f"[TBot] Task: {task_name} | Status: {status} | Scope: {scope_name or 'N/A'}")

        if TARGET_STATUS.lower() not in status:
            print(f"[TBot] Task {task_id} not in target status, skipping.")
            return

        # Detecção por NOME (robusto a mudança de UUIDs no ClickUp) e só scopes com UI
        if scope_name.strip().lower() not in TESTABLE_SCOPES:
            print(f"[TBot] Scope '{scope_name or scope_id}' não é testável no browser, ignorado.")
            return

        # Cria o run no DB com status "running"
        run = TestRun(task_id=task_id, task_name=task_name, status="running")
        db.add(run)
        db.commit()
        db.refresh(run)

        # Busca comentários da task — devs costumam deixar direcionamentos de teste
        comments = get_task_comments(task_id)
        if comments:
            print(f"[TBot] {len(comments)} comentário(s) encontrado(s) na task.")

        # Resolução dos passos com economia de IA:
        #   1) QA confirmou no modal → usa e salva como plano da task
        #   2) já existe plano salvo  → reutiliza (SEM custo de IA)
        #   3) nada salvo             → gera com IA (1x) e salva pra próximas execuções
        if steps:
            print(f"[TBot] Usando {len(steps)} passo(s) confirmado(s) pelo QA (salvando plano).")
            test_steps = steps
            save_test_plan(task_id, test_steps, route_hint, extra_instructions, source="qa")
        else:
            saved = get_test_plan(task_id)
            if saved:
                print(f"[TBot] ♻️ Reutilizando plano salvo ({len(saved['steps'])} passos, usado {saved['use_count']}x) — sem custo de IA.")
                test_steps = saved["steps"]
                route_hint = route_hint or saved.get("route_hint")
                extra_instructions = extra_instructions or saved.get("extra_instructions")
            else:
                kb_entries = kb_query(q=task_name, limit=8)
                knowledge_context = format_knowledge_for_prompt(kb_entries)
                if kb_entries:
                    print(f"[TBot] {len(kb_entries)} aprendizado(s) da base de conhecimento.")
                print(f"[TBot] Gerando plano com Claude (1ª vez) e salvando...")
                test_steps = interpret_task(task_name, description, comments, extra_instructions, route_hint, knowledge_context)
                save_test_plan(task_id, test_steps, route_hint, extra_instructions, source="ai")

        # Callbacks de progresso ao vivo — gravam no DB pra o admin acompanhar em tempo real
        live_steps: list[dict] = []
        live_shots: list[str] = []

        def on_status(msg: str):
            run.current_action = msg
            db.commit()

        def on_step(i: int, total: int, step: str, status: str, detail: str, png: bytes):
            fname = f"{run.id}_step_{i+1}.png"
            (SCREENSHOTS_DIR / fname).write_bytes(png)
            live_shots.append(f"/screenshots/{fname}")
            live_steps.append({"step": step, "status": status, "detail": detail})
            run.steps_json = json.dumps(live_steps, ensure_ascii=False)
            run.screenshots_json = json.dumps(live_shots)
            run.current_action = f"Concluído {i+1}/{total}: {detail[:80]}"
            db.commit()

        # Live view: sobrescreve um único arquivo com a tela atual (cache-buster no front)
        shot_seq = {"n": 0}
        def on_shot(png: bytes):
            shot_seq["n"] += 1
            fname = f"{run.id}_live_{shot_seq['n']}.png"
            (SCREENSHOTS_DIR / fname).write_bytes(png)
            run.live_shot = f"/screenshots/{fname}"
            db.commit()

        # Callbacks de cancelamento — permitem parar o teste em andamento
        def is_cancelled():
            return run.id in _cancel_flags

        def on_driver(d):
            _active_drivers[run.id] = d

        # Roda testes no sandbox (indo direto pra rota informada, se houver)
        print(f"[TBot] Rodando testes no sandbox...")
        result = run_test(task_name, test_steps, route_hint, on_step=on_step,
                          on_status=on_status, on_shot=on_shot,
                          is_cancelled=is_cancelled, on_driver=on_driver)

        # Salva screenshots em disco
        screenshot_urls = _save_screenshots(run.id, result["screenshots"])

        if result.get("cancelled"):
            # Interrompido pelo usuário — não gasta IA gerando parecer
            report = "⛔ Teste interrompido pelo usuário."
            final_status = "cancelled"
            security_findings = []
        else:
            # Gera relatório com Claude (intenção dos devs + achados de segurança)
            run.current_action = "Analisando resultados e gerando parecer..."
            db.commit()
            print(f"[TBot] Gerando relatório...")
            security_findings = result.get("security", [])
            report = generate_report(
                task_name,
                result["steps_results"],
                result["screenshots"],
                result["error"],
                comments,
                security_findings,
            )
            final_status = "passed" if result["success"] else "failed"

        # Limpa os frames transitórios do live view (os screenshots por passo ficam)
        for f in SCREENSHOTS_DIR.glob(f"{run.id}_live_*.png"):
            try: f.unlink()
            except Exception: pass

        run.status           = final_status
        run.steps_json       = json.dumps(result["steps_results"], ensure_ascii=False)
        run.report           = report
        run.error            = result.get("error")
        run.screenshots_json = json.dumps(screenshot_urls)
        run.current_action   = None  # terminou — sem ação em andamento
        run.live_shot        = None
        db.commit()

        print(f"[TBot] Run {run.id} salvo — status: {final_status}")

        # Alimenta a Base de Conhecimento compartilhada (best-effort)
        try:
            _record_learnings(task_id, task_name, scope_name, route_hint, comments, result, final_status)
        except Exception as e:
            print(f"[TBot][KB] Falha ao registrar aprendizado (ignorado): {e}")

    except Exception as e:
        print(f"[TBot] Error processing task {task_id}: {e}")
        if run:
            run.status = "error"
            run.error  = str(e)
            run.current_action = None
            db.commit()
    finally:
        if run:
            _cancel_flags.discard(run.id)
            _active_drivers.pop(run.id, None)
        db.close()


# ─── Fila sequencial de testes ────────────────────────────────────────────────
# Garante 1 teste por vez (evita vários Chromes simultâneos travando a máquina)
# e tira o trabalho pesado do Selenium do event loop do FastAPI.

_test_queue: "_queue.Queue[dict]" = _queue.Queue()


def enqueue_test(task_id: str, steps: list[str] | None = None,
                 extra_instructions: str | None = None, route_hint: str | None = None) -> int:
    """Enfileira um teste (com opções) e retorna a posição na fila (1 = próximo/rodando)."""
    _test_queue.put({
        "task_id": task_id,
        "steps": steps,
        "extra_instructions": extra_instructions,
        "route_hint": route_hint,
    })
    return _test_queue.qsize()


def _test_worker():
    while True:
        job = _test_queue.get()
        try:
            print(f"[TBot] Iniciando teste (fila: {_test_queue.qsize()} restantes)...")
            process_task(
                job["task_id"],
                steps=job.get("steps"),
                extra_instructions=job.get("extra_instructions"),
                route_hint=job.get("route_hint"),
            )
        except Exception as e:
            print(f"[TBot] Worker error on task {job.get('task_id')}: {e}")
        finally:
            _test_queue.task_done()


threading.Thread(target=_test_worker, daemon=True, name="tbot-test-worker").start()


@app.on_event("startup")
def _recover_on_boot():
    n = recover_orphaned_runs()
    if n:
        print(f"[TBot] Recuperados {n} run(s) órfão(s) presos em 'running' (marcados como interrompidos).")


# ─── Webhook ────────────────────────────────────────────────────────────────

@app.post("/webhook")
async def clickup_webhook(request: Request, background_tasks: BackgroundTasks):
    body      = await request.body()
    signature = request.headers.get("X-Signature", "")
    if signature and not verify_signature(body, signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    payload  = json.loads(body)
    event    = payload.get("event", "")
    task_id  = payload.get("task_id", "")

    print(f"[TBot] Webhook: event={event} task_id={task_id}")

    if event == "taskStatusUpdated" and task_id:
        for item in payload.get("history_items", []):
            after_status = item.get("after", {}).get("status", "").lower()
            if TARGET_STATUS.lower() in after_status:
                pos = enqueue_test(task_id)
                print(f"[TBot] Task {task_id} → '{after_status}', enfileirado (posição {pos}).")
                break

    return {"ok": True}


# ─── Test runs ──────────────────────────────────────────────────────────────

@app.get("/runs")
async def list_runs():
    """Lista todos os runs mais recentes, agrupados por task_id."""
    db = SessionLocal()
    try:
        rows = db.query(TestRun).order_by(TestRun.created_at.desc()).limit(200).all()
        runs = [r.to_dict(include_screenshots=False) for r in rows]

        # Agrupa por task_id mantendo ordem de criação do grupo (mais recente primeiro)
        groups: dict[str, dict] = {}
        for run in runs:
            tid = run["task_id"]
            if tid not in groups:
                groups[tid] = {
                    "task_id":   tid,
                    "task_name": run["task_name"],
                    "runs":      [],
                }
            groups[tid]["runs"].append(run)

        return list(groups.values())
    finally:
        db.close()


@app.get("/runs/{run_id}")
async def get_run(run_id: str):
    db = SessionLocal()
    try:
        run = db.query(TestRun).filter(TestRun.id == run_id).first()
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        return run.to_dict(include_screenshots=True)
    finally:
        db.close()


@app.post("/runs/{run_id}/post")
async def post_run_to_clickup(run_id: str):
    """Posta o relatório desta execução como comentário no ClickUp."""
    db = SessionLocal()
    try:
        run = db.query(TestRun).filter(TestRun.id == run_id).first()
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        if run.posted_to_clickup:
            return {"ok": True, "message": "Já postado anteriormente"}

        emoji   = "✅" if run.status == "passed" else "❌"
        comment = f"{emoji} **TBot — Relatório de Teste**\n\n{run.report}"
        post_comment(run.task_id, comment)

        run.posted_to_clickup = True
        db.commit()
        return {"ok": True, "message": "Comentário postado no ClickUp"}
    finally:
        db.close()


@app.post("/runs/{run_id}/cancel")
async def cancel_run(run_id: str):
    """Interrompe um teste em andamento: sinaliza cancelamento e mata o browser."""
    db = SessionLocal()
    try:
        run = db.query(TestRun).filter(TestRun.id == run_id).first()
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        if run.status != "running":
            return {"ok": True, "message": "O teste já havia terminado."}

        _cancel_flags.add(run_id)
        run.current_action = "Interrompendo a pedido do usuário..."
        db.commit()
    finally:
        db.close()

    # Mata o driver pra abortar qualquer chamada Selenium em andamento (mesmo no 2FA).
    # Em modo anexar (usa o Chrome do usuário), NÃO fecha o browser — só sinaliza.
    if not (os.getenv("TBOT_CHROME_DEBUGGER") or "").strip():
        drv = _active_drivers.get(run_id)
        if drv:
            try:
                drv.quit()
            except Exception:
                pass
    return {"ok": True, "message": "Cancelamento solicitado."}


@app.delete("/runs/{run_id}")
async def delete_run(run_id: str):
    db = SessionLocal()
    try:
        run = db.query(TestRun).filter(TestRun.id == run_id).first()
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")

        # Remove screenshots do disco
        for url in json.loads(run.screenshots_json or "[]"):
            path = SCREENSHOTS_DIR / Path(url).name
            if path.exists():
                path.unlink()

        db.delete(run)
        db.commit()
        return {"ok": True}
    finally:
        db.close()


# ─── ClickUp task list ──────────────────────────────────────────────────────

@app.get("/tasks/pending")
async def pending_tasks():
    """Tasks com status 'test (in sandbox)' e escopo Frontend/Fullstack."""
    try:
        tasks = get_pending_test_tasks()
        return {"tasks": tasks}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Plano de teste (preview antes de executar) ───────────────────────────────

@app.get("/test/{task_id}/plan")
async def test_plan(task_id: str, fresh: bool = False):
    """
    Retorna o plano de teste para o QA revisar/editar antes de rodar.
    - Se já há um plano salvo e fresh=false → reutiliza (SEM custo de IA).
    - Se fresh=true ou não há plano → gera com IA.
    """
    try:
        task = get_task(task_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Task não encontrada: {e}")

    task_name   = task.get("name", task_id)
    description = task.get("description", "") or task.get("text_content", "")
    comments    = get_task_comments(task_id)

    # Reutiliza plano salvo (economia) salvo se o QA pediu pra regenerar
    if not fresh:
        saved = get_test_plan(task_id)
        if saved:
            return {
                "task_id": task_id,
                "task_name": task_name,
                "description": description,
                "comments": comments,
                "suggested_steps": saved["steps"],
                "route_hint": saved.get("route_hint"),
                "extra_instructions": saved.get("extra_instructions"),
                "from_cache": True,
                "source": saved.get("source"),
            }

    # Gera com IA (1ª vez ou regeneração pedida)
    kb_entries = kb_query(q=task_name, limit=8)
    knowledge_context = format_knowledge_for_prompt(kb_entries)
    try:
        steps = interpret_task(task_name, description, comments, knowledge_context=knowledge_context)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha ao gerar plano: {e}")

    # Salva como plano da task pra próximas execuções reusarem
    save_test_plan(task_id, steps, source="ai")

    return {
        "task_id": task_id,
        "task_name": task_name,
        "description": description,
        "comments": comments,
        "suggested_steps": steps,
        "from_cache": False,
    }


# ─── Manual trigger ─────────────────────────────────────────────────────────

class TestRequest(BaseModel):
    steps: list[str] | None = None          # passos confirmados/editados pelo QA
    extra_instructions: str | None = None   # instruções adicionais
    route_hint: str | None = None           # caminho conhecido (ex.: "/sales")


@app.post("/test/{task_id}")
async def manual_test(task_id: str, req: TestRequest | None = None):
    req = req or TestRequest()
    steps = [s for s in (req.steps or []) if s and s.strip()] or None
    pos = enqueue_test(task_id, steps=steps, extra_instructions=req.extra_instructions, route_hint=req.route_hint)
    return {"ok": True, "message": f"Teste enfileirado para task {task_id} (posição {pos})", "queue_position": pos}


# ─── Screenshot ─────────────────────────────────────────────────────────────

class ScreenshotRequest(BaseModel):
    description: str
    suggested_capture: str = ""


@app.post("/screenshot")
async def take_screenshot(req: ScreenshotRequest):
    result = capture_screenshot(req.description, req.suggested_capture)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result


# ─── Health ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "bot": "TBot"}
