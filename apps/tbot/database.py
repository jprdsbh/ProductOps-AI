import json
import uuid
from datetime import datetime
from pathlib import Path

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker

DB_PATH = Path(__file__).parent / "tbot.db"
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
Base = declarative_base()
SessionLocal = sessionmaker(bind=engine)


class TestRun(Base):
    __tablename__ = "test_runs"

    id                = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id           = Column(String, nullable=False, index=True)
    task_name         = Column(String, nullable=False, default="")
    status            = Column(String, nullable=False, default="running")  # running | passed | failed | error
    steps_json        = Column(Text, nullable=False, default="[]")
    report            = Column(Text, nullable=False, default="")
    error             = Column(Text, nullable=True)
    screenshots_json  = Column(Text, nullable=False, default="[]")  # list of "/screenshots/filename.png"
    posted_to_clickup = Column(Boolean, default=False)
    current_action    = Column(Text, nullable=True)  # o que o bot está fazendo AGORA (live)
    live_shot         = Column(Text, nullable=True)   # URL da captura ao vivo da tela atual
    created_at        = Column(DateTime, default=datetime.utcnow)

    def to_dict(self, include_screenshots: bool = True) -> dict:
        return {
            "id":                self.id,
            "task_id":           self.task_id,
            "task_name":         self.task_name,
            "status":            self.status,
            "steps":             json.loads(self.steps_json or "[]"),
            "report":            self.report,
            "error":             self.error,
            "screenshots":       json.loads(self.screenshots_json or "[]") if include_screenshots else [],
            "posted_to_clickup": self.posted_to_clickup,
            "current_action":    self.current_action,
            "live_shot":         self.live_shot,
            "created_at":        self.created_at.isoformat() if self.created_at else None,
        }


class TestPlan(Base):
    """
    Plano de teste persistido por task — reaproveitado em execuções futuras da
    MESMA task pra não gastar IA gerando os passos a cada loop. Gerado uma vez
    (ou editado pelo QA) e reutilizado até ser regenerado explicitamente.
    """
    __tablename__ = "test_plans"

    task_id            = Column(String, primary_key=True)
    steps_json         = Column(Text, nullable=False, default="[]")
    route_hint         = Column(Text, nullable=True)
    extra_instructions = Column(Text, nullable=True)
    source             = Column(String, default="ai")  # 'ai' | 'qa' (editado/confirmado)
    use_count          = Column(Integer, default=0)
    updated_at         = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


Base.metadata.create_all(engine)

# Migração leve: adiciona colunas em bancos já existentes
with engine.connect() as conn:
    cols = [r[1] for r in conn.execute(text("PRAGMA table_info(test_runs)"))]
    if "current_action" not in cols:
        conn.execute(text("ALTER TABLE test_runs ADD COLUMN current_action TEXT"))
    if "live_shot" not in cols:
        conn.execute(text("ALTER TABLE test_runs ADD COLUMN live_shot TEXT"))
    conn.commit()


# ─── Plano de teste: persistência (economia de IA) ───────────────────────────

def get_test_plan(task_id: str) -> dict | None:
    """Retorna o plano salvo da task (ou None). Incrementa o contador de uso."""
    db = SessionLocal()
    try:
        p = db.query(TestPlan).filter(TestPlan.task_id == task_id).first()
        if not p:
            return None
        steps = json.loads(p.steps_json or "[]")
        if not steps:
            return None
        p.use_count = (p.use_count or 0) + 1
        db.commit()
        return {
            "task_id": p.task_id,
            "steps": steps,
            "route_hint": p.route_hint,
            "extra_instructions": p.extra_instructions,
            "source": p.source,
            "use_count": p.use_count,
        }
    finally:
        db.close()


def recover_orphaned_runs() -> int:
    """
    Chamado no boot do TBot: qualquer run preso em 'running' é órfão (o processo
    que o executava morreu, ex.: restart). Marca como erro/interrompido pra não
    ficar 'Rodando...' pra sempre no admin. Retorna quantos foram recuperados.
    """
    db = SessionLocal()
    try:
        orphans = db.query(TestRun).filter(TestRun.status == "running").all()
        for r in orphans:
            r.status = "error"
            r.error = "Interrompido: o serviço reiniciou durante a execução do teste."
            r.current_action = None
        db.commit()
        return len(orphans)
    finally:
        db.close()


def save_test_plan(task_id: str, steps: list[str], route_hint: str | None = None,
                   extra_instructions: str | None = None, source: str = "ai") -> None:
    """Salva/atualiza o plano da task (upsert)."""
    if not steps:
        return
    db = SessionLocal()
    try:
        p = db.query(TestPlan).filter(TestPlan.task_id == task_id).first()
        if p:
            p.steps_json = json.dumps(steps, ensure_ascii=False)
            p.route_hint = route_hint
            p.extra_instructions = extra_instructions
            p.source = source
        else:
            db.add(TestPlan(
                task_id=task_id,
                steps_json=json.dumps(steps, ensure_ascii=False),
                route_hint=route_hint,
                extra_instructions=extra_instructions,
                source=source,
            ))
        db.commit()
    finally:
        db.close()
