'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// Caminhos RELATIVOS — passam pelo proxy server-side (/api/tbot/*) que adiciona
// o X-TBot-Token e valida a sessão de admin. O TBot pode estar em localhost ou
// num tunnel (https://tbot.tpay.com.br); o cliente não precisa saber a URL.
const TBOT_URL = '/api/tbot';
const TBOT_IMG = '/api/tbot-img';

type BotStatus = 'checking' | 'online' | 'offline';

interface PendingTask {
  id: string;
  name: string;
  url: string;
  status: string;
  scope: string;
  sprint: string;
  custom_id: string;
  assignees: string[];
}

interface StepResult {
  step: string;
  status: 'ok' | 'error';
  detail?: string;
}

interface Run {
  id: string;
  task_id: string;
  task_name: string;
  status: 'running' | 'passed' | 'failed' | 'error' | 'cancelled';
  steps: StepResult[];
  report: string;
  error: string | null;
  screenshots: string[];
  posted_to_clickup: boolean;
  current_action: string | null;
  live_shot: string | null;
  created_at: string;
}

interface TaskGroup {
  task_id: string;
  task_name: string;
  runs: Run[];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}m atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  return `${Math.floor(hours / 24)}d atrás`;
}

function StatusDot({ status }: { status: Run['status'] }) {
  const map: Record<string, string> = {
    running:   'bg-yellow-400 animate-pulse',
    passed:    'bg-green-500',
    failed:    'bg-red-500',
    error:     'bg-orange-500',
    cancelled: 'bg-gray-400',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${map[status] ?? 'bg-gray-400'}`} />;
}

function StatusLabel({ status }: { status: Run['status'] }) {
  const map: Record<string, string> = {
    running:   'Rodando...',
    passed:    'Aprovado',
    failed:    'Falhou',
    error:     'Erro',
    cancelled: 'Interrompido',
  };
  return <>{map[status] ?? status}</>;
}

function RunDetail({ runId, onClose }: { runId: string; onClose: () => void }) {
  const [run, setRun] = useState<Run | null>(null);
  const [posting, setPosting] = useState(false);
  const [postMsg, setPostMsg] = useState('');
  const [cancelling, setCancelling] = useState(false);

  async function handleCancel() {
    setCancelling(true);
    try {
      await fetch(`${TBOT_URL}/runs/${runId}/cancel`, { method: 'POST' });
    } catch {}
    // o polling vai refletir o status; mantém o botão desabilitado até virar terminal
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`${TBOT_URL}/runs/${runId}`);
        const data = await r.json();
        if (!alive) return;
        setRun(data);
        // Enquanto está rodando, atualiza a cada 2s pra mostrar o progresso ao vivo
        if (data?.status === 'running') timer = setTimeout(load, 2000);
      } catch {
        if (alive) timer = setTimeout(load, 3000);
      }
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [runId]);

  async function handlePost() {
    setPosting(true);
    setPostMsg('');
    try {
      const res = await fetch(`${TBOT_URL}/runs/${runId}/post`, { method: 'POST' });
      const data = await res.json();
      setPostMsg(data.message ?? 'Postado!');
      if (run) setRun({ ...run, posted_to_clickup: true });
    } catch {
      setPostMsg('Erro ao postar.');
    } finally {
      setPosting(false);
    }
  }

  if (!run) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 text-sm text-gray-500">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-6 border-b border-gray-100 dark:border-gray-800">
          <div>
            <p className="text-xs text-gray-400 mb-0.5 font-mono">{run.task_id}</p>
            <h3 className="font-semibold text-sm leading-snug">{run.task_name}</h3>
            <div className="flex items-center gap-2 mt-1.5">
              <StatusDot status={run.status} />
              <span className="text-xs text-gray-500"><StatusLabel status={run.status} /></span>
              <span className="text-xs text-gray-400">· {timeAgo(run.created_at)}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none mt-0.5">×</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Ação ao vivo + LIVE VIEW da tela (enquanto roda) */}
          {run.status === 'running' && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3">
                <svg className="w-4 h-4 animate-spin text-yellow-600 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                <p className="flex-1 text-xs text-yellow-800 dark:text-yellow-300 font-medium">
                  {run.current_action ?? 'Executando teste...'}
                </p>
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-medium transition disabled:opacity-50"
                  title="Interromper o teste"
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                  {cancelling ? 'Interrompendo...' : 'Interromper'}
                </button>
              </div>

              {/* Live view: a tela que o bot está vendo agora */}
              <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-black/5">
                <span className="absolute top-2 left-2 z-10 flex items-center gap-1.5 text-[10px] font-semibold text-white bg-red-600/90 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> AO VIVO
                </span>
                {run.live_shot ? (
                  <img
                    src={`${TBOT_IMG}${run.live_shot}`}
                    alt="tela ao vivo"
                    className="w-full object-contain max-h-[420px]"
                  />
                ) : (
                  <div className="h-48 flex items-center justify-center text-xs text-gray-400">
                    Aguardando primeira captura da tela...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Steps */}
          {run.steps.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Passos</p>
              <div className="space-y-1.5">
                {run.steps.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="mt-0.5">{s.status === 'ok' ? '✅' : '❌'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-700 dark:text-gray-300">{s.step}</p>
                      {s.detail && (
                        <p className="text-gray-400 mt-0.5 font-mono text-[11px] truncate">{s.detail}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Report */}
          {run.report && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Relatório Claude</p>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                {run.report}
              </div>
            </div>
          )}

          {/* Error */}
          {run.error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
              <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">Erro</p>
              <pre className="text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap font-mono">{run.error}</pre>
            </div>
          )}

          {/* Screenshots */}
          {run.screenshots.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Screenshots ({run.screenshots.length})
              </p>
              <div className="grid grid-cols-2 gap-2">
                {run.screenshots.map((url, i) => (
                  <a key={i} href={`${TBOT_IMG}${url}`} target="_blank" rel="noopener noreferrer">
                    <img
                      src={`${TBOT_IMG}${url}`}
                      alt={`step ${i + 1}`}
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-700 object-cover max-h-40 hover:opacity-90 transition"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Post to ClickUp */}
          <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-3">
            {run.posted_to_clickup ? (
              <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                ✓ Já postado no ClickUp
              </span>
            ) : (
              <button
                onClick={handlePost}
                disabled={posting || run.status === 'running'}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition disabled:opacity-40"
              >
                {posting ? 'Postando...' : '📤 Postar no ClickUp'}
              </button>
            )}
            {postMsg && <span className="text-xs text-gray-500">{postMsg}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskGroupCard({
  group,
  onOpenRun,
  onDeleteRun,
}: {
  group: TaskGroup;
  onOpenRun: (id: string) => void;
  onDeleteRun: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const latest = group.runs[0];
  const passedCount = group.runs.filter((r) => r.status === 'passed').length;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Group header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition"
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-mono text-gray-400 mb-0.5 truncate">{group.task_id}</p>
          <p className="text-sm font-medium leading-snug truncate">{group.task_name || group.task_id}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs text-gray-400">
            {passedCount}/{group.runs.length} ✅
          </span>
          <StatusDot status={latest.status} />
          <span className="text-xs text-gray-400">{timeAgo(latest.created_at)}</span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Runs list */}
      {open && (
        <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
          {group.runs.map((run) => (
            <div key={run.id} className="flex items-center gap-3 px-5 py-3">
              <StatusDot status={run.status} />
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300 w-20 flex-shrink-0">
                <StatusLabel status={run.status} />
              </span>
              <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(run.created_at)}</span>
              {run.steps.length > 0 && (
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {run.steps.filter((s) => s.status === 'ok').length}/{run.steps.length} passos
                </span>
              )}
              {run.posted_to_clickup && (
                <span className="text-xs text-green-600 dark:text-green-400 flex-shrink-0">✓ Postado</span>
              )}
              <div className="flex-1" />
              <button
                onClick={() => onOpenRun(run.id)}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex-shrink-0"
              >
                Ver detalhes
              </button>
              <button
                onClick={() => onDeleteRun(run.id)}
                className="text-xs text-gray-400 hover:text-red-500 transition flex-shrink-0 ml-2"
                title="Excluir run"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface PlanBody {
  steps: string[];
  route_hint: string | null;
  extra_instructions: string | null;
}

function TestPlanModal({
  task,
  onClose,
  onConfirm,
}: {
  task: PendingTask;
  onClose: () => void;
  onConfirm: (body: PlanBody) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState('');
  const [route, setRoute] = useState('');
  const [extra, setExtra] = useState('');
  const [comments, setComments] = useState<{ author: string; text: string }[]>([]);
  const [fromCache, setFromCache] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [err, setErr] = useState('');

  async function loadPlan(fresh = false) {
    if (fresh) setRegenerating(true); else setLoading(true);
    setErr('');
    try {
      const res = await fetch(`${TBOT_URL}/test/${task.id}/plan${fresh ? '?fresh=true' : ''}`);
      if (!res.ok) throw new Error('Falha ao gerar o plano de teste');
      const data = await res.json();
      setSteps((data.suggested_steps ?? []).join('\n'));
      setComments(data.comments ?? []);
      setFromCache(!!data.from_cache);
      if (data.route_hint) setRoute(data.route_hint);
      if (data.extra_instructions) setExtra(data.extra_instructions);
    } catch (e: any) {
      setErr(e.message ?? 'Erro');
    } finally {
      setLoading(false);
      setRegenerating(false);
    }
  }

  useEffect(() => { loadPlan(false); /* eslint-disable-next-line */ }, [task.id]);

  function confirm() {
    const stepList = steps.split('\n').map((s) => s.trim()).filter(Boolean);
    onConfirm({
      steps: stepList,
      route_hint: route.trim() || null,
      extra_instructions: extra.trim() || null,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm">Revisar plano de teste</h3>
            <p className="text-xs text-gray-400 mt-0.5 truncate" title={task.name}>{task.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {loading ? (
            <div className="py-10 text-center text-xs text-gray-400">Gerando sugestão de passos com o Claude...</div>
          ) : err ? (
            <div className="py-6 text-center text-xs text-red-500">{err}</div>
          ) : (
            <>
              {/* Comentários dos devs (contexto) */}
              {comments.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Comentários dos devs na task</label>
                  <div className="mt-1 space-y-1 max-h-28 overflow-y-auto bg-gray-50 dark:bg-gray-800 rounded-lg p-2.5 text-[11px] text-gray-600 dark:text-gray-300">
                    {comments.map((c, i) => (
                      <p key={i}><span className="font-semibold">{c.author}:</span> {c.text}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Caminho conhecido */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Caminho conhecido <span className="text-gray-400 font-normal">(opcional — evita o bot adivinhar a URL)</span>
                </label>
                <input
                  value={route}
                  onChange={(e) => setRoute(e.target.value)}
                  placeholder="ex.: /sales  ·  ou descreva: abrir Vendas, clicar numa transação, aba Dados do Cliente"
                  className="mt-1 w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2"
                />
              </div>

              {/* Instruções extras */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Instruções adicionais <span className="text-gray-400 font-normal">(opcional — guie o bot pra não alucinar)</span>
                </label>
                <textarea
                  value={extra}
                  onChange={(e) => setExtra(e.target.value)}
                  rows={2}
                  placeholder="ex.: a venda digital é a que tem product_type=digital na resposta da API; abrir o modal e conferir a aba Dados do Cliente"
                  className="mt-1 w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2"
                />
              </div>

              {/* Aviso de plano reaproveitado (economia de IA) */}
              {fromCache && (
                <div className="flex items-center gap-2 text-[11px] text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-2.5 py-1.5">
                  ♻️ Plano salvo reaproveitado — sem custo de IA. Edite se quiser, ou gere de novo.
                </div>
              )}

              {/* Passos sugeridos (editáveis) */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Passos de teste <span className="text-gray-400 font-normal">(edite à vontade — 1 por linha)</span>
                  </label>
                  <button
                    onClick={() => loadPlan(true)}
                    disabled={regenerating}
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-40"
                    title="Descarta o plano salvo e gera um novo com IA"
                  >
                    {regenerating ? 'Gerando...' : '↻ Gerar de novo (IA)'}
                  </button>
                </div>
                <textarea
                  value={steps}
                  onChange={(e) => setSteps(e.target.value)}
                  rows={10}
                  className="mt-1 w-full text-xs font-mono rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 leading-relaxed"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-800 sticky bottom-0 bg-white dark:bg-gray-900">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-400 transition">
            Cancelar
          </button>
          <button
            onClick={confirm}
            disabled={loading || !!err}
            className="px-4 py-1.5 text-sm rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-80 transition disabled:opacity-30 flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            Confirmar e executar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TBotClient() {
  const [botStatus, setBotStatus] = useState<BotStatus>('checking');
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [taskId, setTaskId] = useState('');
  const [triggering, setTriggering] = useState(false);
  const [triggerMsg, setTriggerMsg] = useState('');
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [queuedIds, setQueuedIds] = useState<Set<string>>(new Set());
  const [planTask, setPlanTask] = useState<PendingTask | null>(null);
  const [error, setError] = useState('');
  // Guarda o id do último run de cada task no momento do clique, pra saber
  // quando um run NOVO apareceu e então parar o spinner do botão ▶.
  const queuedBaseline = useRef<Map<string, string | null>>(new Map());

  const hasRunning = groups.some((g) => g.runs.some((r) => r.status === 'running'));

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${TBOT_URL}/health`, { signal: AbortSignal.timeout(3000) });
      setBotStatus(res.ok ? 'online' : 'offline');
    } catch {
      setBotStatus('offline');
    }
  }, []);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch(`${TBOT_URL}/runs`);
      if (res.ok) setGroups(await res.json());
    } catch {}
  }, []);

  const fetchPendingTasks = useCallback(async () => {
    setLoadingTasks(true);
    try {
      const res = await fetch(`${TBOT_URL}/tasks/pending`);
      if (res.ok) {
        const data = await res.json();
        setPendingTasks(data.tasks ?? []);
      }
    } catch {}
    finally { setLoadingTasks(false); }
  }, []);

  useEffect(() => {
    checkHealth();
    fetchRuns();
    const healthInterval = setInterval(checkHealth, 15000);
    return () => clearInterval(healthInterval);
  }, [checkHealth, fetchRuns]);

  // Busca tasks pendentes quando TBot fica online
  useEffect(() => {
    if (botStatus === 'online') fetchPendingTasks();
  }, [botStatus, fetchPendingTasks]);

  // Poll mais frequente quando tem teste rodando
  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(fetchRuns, 4000);
    return () => clearInterval(id);
  }, [hasRunning, fetchRuns]);

  // Para o spinner do ▶ assim que um run NOVO aparece (ou após timeout de segurança)
  useEffect(() => {
    if (queuedIds.size === 0) return;
    setQueuedIds((prev) => {
      const next = new Set(prev);
      for (const id of prev) {
        const latestId = groups.find((g) => g.task_id === id)?.runs[0]?.id ?? null;
        const baseline = queuedBaseline.current.get(id) ?? null;
        if (latestId && latestId !== baseline) {
          next.delete(id);
          queuedBaseline.current.delete(id);
          // Abre o painel de progresso ao vivo do teste que acabou de iniciar
          setOpenRunId((cur) => cur ?? latestId);
        }
      }
      return next.size === prev.size ? prev : next;
    });
  }, [groups, queuedIds]);

  async function runWithPlan(id: string, body: PlanBody) {
    const latestId = groups.find((g) => g.task_id === id)?.runs[0]?.id ?? null;
    queuedBaseline.current.set(id, latestId);
    setQueuedIds((prev) => new Set(prev).add(id));
    setPlanTask(null);
    setError('');
    // Rede de segurança: se nenhum run aparecer (task pulada), limpa o spinner
    setTimeout(() => {
      setQueuedIds((prev) => {
        if (!prev.has(id)) return prev;
        const n = new Set(prev); n.delete(id); return n;
      });
    }, 120000);
    try {
      const res = await fetch(`${TBOT_URL}/test/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setTimeout(fetchRuns, 1500);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? 'Erro ao enfileirar');
      }
    } catch (err: any) {
      setError(err.message ?? 'TBot inacessível');
    }
  }

  async function handleManualTrigger(e: React.FormEvent) {
    e.preventDefault();
    if (!taskId.trim()) return;
    setTriggering(true);
    setTriggerMsg('');
    setError('');
    try {
      const res = await fetch(`${TBOT_URL}/test/${taskId.trim()}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setTriggerMsg('Enfileirado!');
        setTaskId('');
        setTimeout(fetchRuns, 1000);
      } else {
        setError(data.detail ?? 'Erro ao enfileirar');
      }
    } catch (err: any) {
      setError(err.message ?? 'TBot inacessível');
    } finally {
      setTriggering(false);
      setTimeout(() => setTriggerMsg(''), 3000);
    }
  }

  async function handleDeleteRun(runId: string) {
    await fetch(`${TBOT_URL}/runs/${runId}`, { method: 'DELETE' });
    fetchRuns();
  }

  const totalRuns = groups.reduce((acc, g) => acc + g.runs.length, 0);

  // Marca tasks que já têm run no histórico (qualquer status)
  const testedIds = new Set(groups.map((g) => g.task_id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <span>🤖</span> TBot
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Testes automatizados — histórico por task, aprovação antes de postar no ClickUp
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${
            botStatus === 'online'  ? 'bg-green-500 animate-pulse' :
            botStatus === 'offline' ? 'bg-red-400' :
            'bg-yellow-400 animate-pulse'
          }`} />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {botStatus === 'online' ? 'Online' : botStatus === 'offline' ? 'Offline' : 'Verificando...'}
          </span>
          <button onClick={checkHealth} className="text-xs text-gray-400 hover:text-gray-600 transition ml-1" title="Atualizar">↺</button>
        </div>
      </div>

      {/* Offline banner */}
      {botStatus === 'offline' && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-400 mb-1">TBot não está rodando</p>
          <pre className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-300 rounded-lg p-3 font-mono">{`# Raiz do projeto:\nstart.bat`}</pre>
        </div>
      )}

      {/* ── Tasks prontas para testar ── */}
      {botStatus === 'online' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <div>
              <h2 className="font-semibold text-sm">Prontas para testar</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Tasks em <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">test (in sandbox)</code> — Frontend &amp; Fullstack
              </p>
            </div>
            <button
              onClick={fetchPendingTasks}
              disabled={loadingTasks}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition disabled:opacity-40"
              title="Recarregar lista"
            >
              {loadingTasks ? '⏳' : '↺'}
            </button>
          </div>

          {loadingTasks && pendingTasks.length === 0 ? (
            <div className="px-5 py-6 text-xs text-gray-400 text-center">Buscando no ClickUp...</div>
          ) : pendingTasks.length === 0 ? (
            <div className="px-5 py-6 text-xs text-gray-400 text-center">
              Nenhuma task em <em>test (in sandbox)</em> no momento.
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {pendingTasks.map((task) => {
                const isQueued  = queuedIds.has(task.id);
                const hasTested = testedIds.has(task.id);
                const lastRun   = hasTested
                  ? groups.find((g) => g.task_id === task.id)?.runs[0]
                  : null;

                return (
                  <div key={task.id} className="flex items-center gap-3 px-5 py-3">
                    {/* Scope badge */}
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${
                      task.scope === 'Fullstack'
                        ? 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800'
                        : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800'
                    }`}>
                      {task.scope}
                    </span>

                    {/* Task info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <a
                          href={task.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium truncate hover:underline"
                          title={task.name}
                        >
                          {task.name}
                        </a>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-gray-400">{task.sprint}</span>
                        {task.custom_id && (
                          <span className="text-[11px] font-mono text-amber-600 dark:text-amber-400">{task.custom_id}</span>
                        )}
                        {task.assignees.length > 0 && (
                          <span className="text-[11px] text-gray-400">{task.assignees.join(', ')}</span>
                        )}
                      </div>
                    </div>

                    {/* Last run status */}
                    {lastRun && (
                      <button
                        onClick={() => setOpenRunId(lastRun.id)}
                        className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition flex-shrink-0"
                        title="Ver último resultado"
                      >
                        <StatusDot status={lastRun.status} />
                        <StatusLabel status={lastRun.status} />
                      </button>
                    )}

                    {/* Play button → abre modal de confirmação do plano */}
                    <button
                      onClick={() => setPlanTask(task)}
                      disabled={isQueued || botStatus !== 'online' || lastRun?.status === 'running'}
                      title="Revisar plano e executar"
                      className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-80 transition disabled:opacity-30"
                    >
                      {(isQueued || lastRun?.status === 'running') ? (
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Trigger manual ── */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <h2 className="font-semibold text-sm mb-1">Testar por ID</h2>
        <p className="text-xs text-gray-400 mb-3">Para tasks fora da lista acima (Backend, outros status, etc).</p>
        <form onSubmit={handleManualTrigger} className="flex gap-2">
          <input
            type="text"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            placeholder="ID da task do ClickUp"
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 dark:focus:ring-gray-100"
            disabled={botStatus !== 'online'}
          />
          <button
            type="submit"
            disabled={triggering || botStatus !== 'online' || !taskId.trim()}
            className="px-4 py-2 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-medium hover:opacity-90 transition disabled:opacity-40"
          >
            {triggering ? '...' : '▶'}
          </button>
        </form>
        {triggerMsg && <p className="text-xs text-green-600 mt-2">{triggerMsg}</p>}
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>

      {/* ── Histórico ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Histórico de Testes</h2>
          {totalRuns > 0 && (
            <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">
              {totalRuns} {totalRuns === 1 ? 'execução' : 'execuções'}
            </span>
          )}
          <button onClick={fetchRuns} className="text-xs text-gray-400 hover:text-gray-600 transition ml-auto">↺ atualizar</button>
        </div>

        {groups.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg">🤖</p>
            <p className="text-sm mt-1">Nenhum teste ainda.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <TaskGroupCard
                key={g.task_id}
                group={g}
                onOpenRun={setOpenRunId}
                onDeleteRun={handleDeleteRun}
              />
            ))}
          </div>
        )}
      </div>

      {/* Run detail modal */}
      {openRunId && (
        <RunDetail runId={openRunId} onClose={() => setOpenRunId(null)} />
      )}

      {/* Plano de teste — confirmação antes de executar */}
      {planTask && (
        <TestPlanModal
          task={planTask}
          onClose={() => setPlanTask(null)}
          onConfirm={(body) => runWithPlan(planTask.id, body)}
        />
      )}
    </div>
  );
}
