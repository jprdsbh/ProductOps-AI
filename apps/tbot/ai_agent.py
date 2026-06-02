import anthropic
import base64
import json
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env", override=True)

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
SANDBOX_URL = os.getenv("SANDBOX_URL")

# Modelos configuráveis por env.
# - VISÃO (análise de screenshots): precisa de modelo forte → Sonnet
# - TEXTO (interpretar task, sem imagem): pode usar Haiku, mais barato
MODEL_VISION = os.getenv("TBOT_MODEL_VISION", "claude-sonnet-4-6")
MODEL_TEXT   = os.getenv("TBOT_MODEL_TEXT", "claude-haiku-4-5-20251001")


def interpret_task(
    task_name: str,
    task_description: str,
    comments: list[dict] | None = None,
    extra_instructions: str | None = None,
    route_hint: str | None = None,
    knowledge_context: str | None = None,
) -> list[str]:
    """
    Given a task name, description, ClickUp comments and (opcionalmente) instruções
    extras do QA + rota conhecida, Claude gera a lista de passos de teste.

    Prioridade de fonte (maior → menor):
      1. extra_instructions (o QA digitou explicitamente antes de rodar)
      2. route_hint (caminho exato a seguir — evita o bot "adivinhar" URLs)
      3. comentários dos devs na task
      4. descrição + título
    """
    comments = comments or []
    comments_block = "\n".join(f"- {c['author']}: {c['text']}" for c in comments) if comments else "(sem comentários)"

    extra_block = ""
    if extra_instructions and extra_instructions.strip():
        extra_block = f"""

INSTRUÇÕES EXPLÍCITAS DO QA (PRIORIDADE MÁXIMA — siga à risca, não invente caminho diferente):
{extra_instructions.strip()}"""

    route_block = ""
    if route_hint and route_hint.strip():
        route_block = f"""

CAMINHO CONHECIDO PARA CHEGAR À FUNCIONALIDADE (use exatamente este, NÃO invente outra URL):
{route_hint.strip()}"""

    knowledge_block = ""
    if knowledge_context and knowledge_context.strip():
        knowledge_block = f"""

CONHECIMENTO ACUMULADO (rotas reais e navegações que já funcionaram em testes anteriores — confie nisto antes de adivinhar):
{knowledge_context.strip()}"""

    prompt = f"""Você é um QA engineer. Analise esta tarefa de desenvolvimento e gere uma lista de passos de teste para validar no ambiente sandbox.

Tarefa: {task_name}

Descrição:
{task_description or "(sem descrição)"}

Comentários da equipe na task (podem conter direcionamentos de teste deixados pelos devs):
{comments_block}{extra_block}{route_block}{knowledge_block}

URL base do sandbox: {SANDBOX_URL}

REGRAS IMPORTANTES:
- NUNCA invente caminhos/URLs (ex.: NÃO chute "/produtos?tipo=digital"). Se não há caminho explícito, navegue pela interface a partir do menu, clicando nos elementos visíveis.
- Se houver "CAMINHO CONHECIDO" ou "INSTRUÇÕES EXPLÍCITAS", siga-os exatamente.
- Quando precisar identificar um item específico numa lista (ex.: qual venda é de produto digital), descreva o passo de inspecionar os dados/abrir o item — o agente terá acesso ao contexto das chamadas de API da página para decidir.
- Se algum comentário contiver direcionamento de teste, trate como prioridade.
- Ignore comentários que sejam apenas conversa social ou status ("subi em sandbox", "pode testar").

Gere passos de teste práticos, objetivos e baseados em navegação real pela interface.
Retorne APENAS os passos, um por linha, sem numeração nem marcadores."""

    message = client.messages.create(
        model=MODEL_TEXT,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )

    steps_text = message.content[0].text.strip()
    steps = [s.strip() for s in steps_text.split("\n") if s.strip()]
    return steps


def generate_report(
    task_name: str,
    steps_results: list[dict],
    screenshots: list,
    error: str | None,
    comments: list[dict] | None = None,
    security_findings: list[dict] | None = None,
) -> str:
    """
    Given test results, screenshots and dev comments, Claude generates a QA report.
    Os comentários dos devs informam a INTENÇÃO da entrega — o parecer deve
    confirmar se o que o dev pediu pra validar realmente foi atendido.
    """
    steps_summary = "\n".join(
        [f"- [{r['status'].upper()}] {r['step']}: {r.get('detail', '')}" for r in steps_results]
    )

    comments = comments or []
    intent_block = ""
    if comments:
        joined = "\n".join(f"- {c['author']}: {c['text']}" for c in comments)
        intent_block = f"""

Direcionamentos/intenção da equipe (comentários na task):
{joined}

Ao dar o parecer, verifique explicitamente se o que os devs pediram pra validar foi atendido."""

    security_findings = security_findings or []
    security_block = ""
    if security_findings:
        sec_lines = "\n".join(
            f"- [{f.get('severity', '?').upper()}] {f.get('type', '')}: {f.get('detail', '')}"
            for f in security_findings
        )
        security_block = f"""

Achados de SEGURANÇA detectados no front durante o teste (analise e inclua uma seção "Segurança" no parecer, explicando o risco e a recomendação de cada item para o dev corrigir):
{sec_lines}"""

    # Build message content with screenshots
    content = []

    if screenshots:
        content.append({
            "type": "text",
            "text": f"""Você é um QA engineer. Analise os resultados de teste abaixo e as screenshots capturadas para gerar um parecer completo.

Tarefa testada: {task_name}

Resultados dos passos:
{steps_summary}

{"Erro crítico: " + error if error else ""}{intent_block}{security_block}

Screenshots capturadas durante o teste estão anexadas. Analise visualmente e gere um parecer em português com:
1. Status geral: APROVADO / REPROVADO / PARCIAL
2. O que foi testado
3. O que passou
4. O que falhou (se houver)
5. Observações visuais das screenshots
6. Segurança (liste os achados acima com risco e recomendação; se não houver, diga "sem achados")
7. Recomendação""",
        })

        # Add screenshots (max 3 to avoid token limits)
        for name, screenshot_bytes in screenshots[:3]:
            img_b64 = base64.standard_b64encode(screenshot_bytes).decode()
            content.append({
                "type": "image",
                "source": {"type": "base64", "media_type": "image/png", "data": img_b64},
            })
    else:
        content.append({
            "type": "text",
            "text": f"""Você é um QA engineer. Analise os resultados de teste abaixo e gere um parecer.

Tarefa testada: {task_name}

Resultados dos passos:
{steps_summary}

{"Erro crítico: " + error if error else ""}{intent_block}{security_block}

Gere um parecer em português com:
1. Status geral: APROVADO / REPROVADO / PARCIAL
2. O que foi testado
3. O que passou
4. O que falhou (se houver)
5. Segurança (liste os achados acima com risco e recomendação; se não houver, diga "sem achados")
6. Recomendação""",
        })

    message = client.messages.create(
        model=MODEL_VISION,
        max_tokens=2048,
        messages=[{"role": "user", "content": content}],
    )

    return message.content[0].text.strip()


def decide_action(screenshot_bytes: bytes, step: str, current_url: str, page_summary: str,
                  network_summary: str = "", allowed_hosts: list[str] | None = None, avoid_hint: str = "") -> dict:
    """
    Vê o screenshot da página atual e decide a próxima ação para executar o passo de teste.
    Retorna um dict com: type, selector, text, url, expected, reason, result
    """
    img_b64 = base64.standard_b64encode(screenshot_bytes).decode()

    network_block = ""
    if network_summary and network_summary.strip():
        network_block = f"""

Chamadas de API observadas nesta página (requests E responses — use os DADOS abaixo para decidir e para VALIDAR payloads, ex.: conferir se 'billing_address' está presente/correto, ou identificar qual item é digital vs físico):
{network_summary.strip()}"""

    hosts_txt = ", ".join(allowed_hosts) if allowed_hosts else "(apenas o host atual)"
    avoid_block = f"\n\n⚠️ ATENÇÃO: {avoid_hint}" if avoid_hint else ""

    prompt = f"""Você é um QA engineer controlando um browser via Selenium.

Passo de teste a executar: {step}

URL atual: {current_url}

Conhecimento sobre esta página:
{page_summary}{network_block}{avoid_block}

Analise o screenshot (e os dados de API acima, se houver) e decida a próxima ação para executar o passo de teste.

Responda APENAS com JSON válido, sem markdown, sem explicações fora do JSON:

Para clicar num elemento:
{{"type": "click", "selector": "seletor_css", "fallback_text": "texto visível do botão", "reason": "motivo"}}

Para digitar texto:
{{"type": "type", "selector": "seletor_css", "text": "texto a digitar", "reason": "motivo"}}

Para navegar para uma URL (SOMENTE host conhecido):
{{"type": "navigate", "url": "url_completa", "reason": "motivo"}}

Para verificar que um texto/elemento existe na página:
{{"type": "verify", "selector": "seletor_css_ou_vazio", "expected": "texto esperado", "reason": "motivo"}}

Para INSPECIONAR/validar dados nas chamadas de API capturadas (ex.: payload enviado contém billing_address com o endereço esperado):
{{"type": "inspect_api", "expected": "texto/campo que deve estar na requisição ou resposta", "result": "o que você concluiu", "reason": "motivo"}}

Para scroll (quando o elemento está fora do ecrã):
{{"type": "scroll", "direction": "down", "reason": "motivo"}}

Se o passo já está concluído com o que vê na tela:
{{"type": "done", "result": "descrição do que foi verificado/encontrado", "reason": "motivo"}}

REGRAS DE NAVEGAÇÃO (CRÍTICAS — evita erros de DNS/URL inexistente):
- NUNCA invente domínios ou URLs. Hosts conhecidos: {hosts_txt}.
- Para mudar de seção/área, CLIQUE nos elementos do menu/da tela — NÃO use 'navigate' para adivinhar uma URL.
- Só use 'navigate' para um caminho dentro de um host JÁ conhecido. Se não sabe a URL exata, clique na interface.

REGRAS GERAIS:
- Use seletores CSS precisos: prefira #id, [data-testid="x"], [name="x"], button[type="submit"]
- Se não tiver seletor certo, use fallback_text com o texto visível do elemento
- Para validar o que a aplicação ENVIA/RECEBE da API (payload), use 'inspect_api' com os dados de API acima
- Seja específico sobre o que vê na screenshot"""

    message = client.messages.create(
        model=MODEL_VISION,
        max_tokens=512,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": "image/png", "data": img_b64},
                },
                {"type": "text", "text": prompt},
            ],
        }],
    )

    text = message.content[0].text.strip()
    # Remove markdown se Claude incluir
    if "```" in text:
        parts = text.split("```")
        for part in parts:
            part = part.strip()
            if part.startswith("json"):
                part = part[4:].strip()
            if part.startswith("{"):
                text = part
                break

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Fallback se JSON inválido
        return {"type": "done", "result": f"Nao foi possivel decidir acao: {text[:200]}", "reason": "parse error"}
