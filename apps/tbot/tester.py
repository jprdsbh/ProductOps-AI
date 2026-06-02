import os
import time
import traceback
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse


def _host(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower()
    except Exception:
        return ""

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from dotenv import load_dotenv

from gmail_reader import get_latest_otp
import explorer
import ai_agent
import security

load_dotenv(Path(__file__).parent / ".env", override=True)

SANDBOX_URL = os.getenv("SANDBOX_URL")
SANDBOX_USER = os.getenv("SANDBOX_USER")
SANDBOX_PASS = os.getenv("SANDBOX_PASS")


def _attach_mode() -> bool:
    """True quando o TBot deve anexar ao Chrome que o usuário já está usando."""
    return bool((os.getenv("TBOT_CHROME_DEBUGGER") or "").strip())


def _get_driver():
    options = Options()

    # ── Modo ANEXAR: usa o Chrome que VOCÊ já está usando (mesma sessão, sem novo login) ──
    # Abra o Chrome assim (uma vez):  chrome.exe --remote-debugging-port=9222
    # e defina TBOT_CHROME_DEBUGGER=127.0.0.1:9222 no .env
    debugger = (os.getenv("TBOT_CHROME_DEBUGGER") or "").strip()
    if debugger:
        options.add_experimental_option("debuggerAddress", debugger)
        options.add_experimental_option("excludeSwitches", ["enable-logging"])
        service = Service(ChromeDriverManager().install(), log_output=os.devnull)
        return webdriver.Chrome(service=service, options=options)

    # ── Modo padrão: Chrome próprio (headless), faz login com a conta do .env ──
    if os.getenv("TBOT_HEADLESS", "1") != "0":
        options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--log-level=3")
    options.add_argument("--disable-logging")
    options.add_argument("--disable-gpu-logging")
    options.add_experimental_option("excludeSwitches", ["enable-logging"])
    # Captura de rede (performance) + console do browser (analise de seguranca)
    options.set_capability("goog:loggingPrefs", {"performance": "ALL", "browser": "ALL"})
    options.add_experimental_option("perfLoggingPrefs", {"enableNetwork": True, "enablePage": False})
    service = Service(ChromeDriverManager().install(), log_output=os.devnull)
    return webdriver.Chrome(service=service, options=options)


# URLs de infra/estáticos que não interessam ao contexto de teste
_NET_IGNORE = (".js", ".css", ".png", ".jpg", ".svg", ".woff", ".ico", "google", "contentsquare", "gtag", "analytics")


def _drain_network(driver, max_bytes: int = 600) -> list[str]:
    """
    Lê o performance log (drena desde a última chamada) e retorna um resumo das
    chamadas de API JSON observadas — com trecho do corpo da resposta quando possível.
    Permite ao Claude entender DADOS da página (ex.: tipo de produto de cada venda).
    """
    try:
        logs = driver.get_log("performance")
    except Exception:
        return []

    calls = []
    for entry in logs:
        try:
            msg = json.loads(entry["message"])["message"]
        except Exception:
            continue
        method = msg.get("method")
        params = msg.get("params", {})

        # Request enviado: captura o PAYLOAD (onde mora billing_address etc.)
        if method == "Network.requestWillBeSent":
            req = params.get("request", {})
            url = req.get("url", "")
            verb = req.get("method", "")
            if not url or any(tok in url.lower() for tok in _NET_IGNORE):
                continue
            if verb not in ("POST", "PUT", "PATCH"):
                continue
            if "/api" not in url.lower() and not req.get("postData"):
                continue
            post = (req.get("postData") or "")[:max_bytes].replace("\n", " ")
            line = f"→ {verb} {url}"
            if post:
                line += f"\n    payload: {post}"
            calls.append(line)
            continue

        # Response recebido: captura status + corpo (dados retornados)
        if method != "Network.responseReceived":
            continue
        resp = params.get("response", {})
        url = resp.get("url", "")
        mime = resp.get("mimeType", "")
        status = resp.get("status")
        req_id = params.get("requestId")

        if not url or any(tok in url.lower() for tok in _NET_IGNORE):
            continue
        is_api = "/api" in url.lower() or "json" in mime.lower()
        if not is_api:
            continue

        snippet = ""
        if req_id and "json" in mime.lower():
            try:
                bd = driver.execute_cdp_cmd("Network.getResponseBody", {"requestId": req_id})
                body = bd.get("body", "") or ""
                snippet = body[:max_bytes].replace("\n", " ")
            except Exception:
                pass

        line = f"[{status}] {url}"
        if snippet:
            line += f"\n    resp: {snippet}"
        calls.append(line)

    return calls


def _do_login(driver, wait) -> float:
    """Faz login e retorna o timestamp exato do clique de submit."""
    driver.get(SANDBOX_URL)
    email_field = wait.until(
        EC.presence_of_element_located((By.CSS_SELECTOR, 'input[type="email"], input[name="email"], input[name="username"]'))
    )
    email_field.send_keys(SANDBOX_USER)
    driver.find_element(By.CSS_SELECTOR, 'input[type="password"]').send_keys(SANDBOX_PASS)
    login_ts = time.time()
    driver.find_element(By.CSS_SELECTOR, 'button[type="submit"]').click()
    return login_ts


def _fill_otp(driver, otp_code: str):
    """Preenche os 6 campos OTP e clica continuar. Retorna o primeiro input (para staleness check) ou None."""
    otp_inputs = driver.find_elements(By.CSS_SELECTOR, 'input[maxlength="1"]')
    if len(otp_inputs) != 6:
        return None

    for i, digit in enumerate(otp_code):
        otp_inputs[i].click()
        otp_inputs[i].clear()
        otp_inputs[i].send_keys(digit)

    try:
        driver.find_element(By.XPATH, '//button[contains(text(),"Continuar") or contains(text(),"Confirmar") or contains(text(),"Verificar")]').click()
    except Exception:
        otp_inputs[-1].send_keys(Keys.RETURN)

    return otp_inputs[0]


def _handle_2fa(driver, login_ts: float) -> dict:
    """Detecta 2FA, busca OTP no email e tenta autenticar."""
    try:
        WebDriverWait(driver, 8).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'input[maxlength="1"]'))
        )
    except Exception:
        return None  # sem 2FA

    print("[TBot] 2FA detectado, aguardando codigo no email...")

    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
    after_ts = max(login_ts - 60, today_start)

    tried_codes = set()
    deadline = time.time() + 90

    while time.time() < deadline:
        otp_code = get_latest_otp(timeout=20, after_timestamp=after_ts)

        if not otp_code:
            print("[TBot] Nenhum codigo novo encontrado, aguardando...")
            time.sleep(3)
            continue

        if otp_code in tried_codes:
            print(f"[TBot] Codigo {otp_code} ja tentado, aguardando novo...")
            time.sleep(3)
            continue

        print(f"[TBot] Tentando codigo: {otp_code}")
        tried_codes.add(otp_code)
        first_input = _fill_otp(driver, otp_code)

        if first_input is None:
            print("[TBot] Campos OTP nao encontrados, aguardando...")
            time.sleep(3)
            continue

        try:
            WebDriverWait(driver, 10).until(EC.staleness_of(first_input))
            print(f"[TBot] 2FA aprovado com codigo {otp_code}!")
            return {"step": "2FA", "status": "ok", "detail": f"Codigo {otp_code} aceito"}
        except Exception:
            pass

        print(f"[TBot] Codigo {otp_code} rejeitado, aguardando novo codigo...")
        after_ts = time.time() - 5

    return {"step": "2FA", "status": "error", "detail": "Nao foi possivel autenticar o 2FA apos multiplas tentativas"}


def _execute_step(driver, wait, step: str, platform_map: dict, network_summary: str = "",
                  allowed_hosts: set | None = None) -> str:
    """
    Executa um passo de teste usando visão do Claude.
    Tira screenshot → Claude decide ação (com contexto de rede) → executa → aprende nova página.
    Guardrail: bloqueia navegação para hosts desconhecidos (anti-alucinação de URL).
    """
    allowed_hosts = allowed_hosts if allowed_hosts is not None else set()
    current_url = driver.current_url
    screenshot = driver.get_screenshot_as_png()
    page_summary = explorer.get_page_summary(platform_map, current_url)

    print(f"[TBot] Step: {step[:60]}...")

    # Decide a ação; se escolher navegar para host desconhecido, re-decide pedindo pra clicar
    action = None
    avoid_hint = ""
    for attempt in range(3):
        try:
            action = ai_agent.decide_action(
                screenshot, step, current_url, page_summary, network_summary,
                allowed_hosts=sorted(allowed_hosts), avoid_hint=avoid_hint,
            )
        except Exception as e:
            return f"Erro ao decidir acao: {e}"
        if action.get("type") == "navigate":
            target_host = _host(action.get("url", ""))
            if target_host and allowed_hosts and target_host not in allowed_hosts:
                print(f"[TBot] ⛔ Navegação bloqueada para host desconhecido: {target_host}")
                avoid_hint = (f"NÃO navegue para o host '{target_host}' — ele NÃO existe/não foi visitado. "
                              f"Hosts válidos: {', '.join(sorted(allowed_hosts))}. Use a UI (clique) para chegar lá.")
                continue
        break

    action_type = action.get("type", "done")
    print(f"[TBot] Acao: {action_type} — {action.get('reason', '')[:80]}")

    if action_type == "click":
        selector = action.get("selector", "")
        fallback_text = action.get("fallback_text", "")
        try:
            el = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, selector)))
            el.click()
            time.sleep(1.5)
            explorer.update_current_page(driver, platform_map)
            return f"Clicou: {selector}"
        except Exception:
            # Tenta por texto visível
            if fallback_text:
                try:
                    el = driver.find_element(By.XPATH, f"//*[normalize-space(text())='{fallback_text}']")
                    el.click()
                    time.sleep(1.5)
                    explorer.update_current_page(driver, platform_map)
                    return f"Clicou por texto: {fallback_text}"
                except Exception:
                    pass
            raise Exception(f"Elemento nao encontrado: {selector} / '{fallback_text}'")

    elif action_type == "type":
        selector = action.get("selector", "")
        text = action.get("text", "")
        el = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, selector)))
        el.clear()
        el.send_keys(text)
        time.sleep(0.5)
        return f"Digitou '{text}' em {selector}"

    elif action_type == "navigate":
        url = action.get("url", "")
        target_host = _host(url)
        # Guardrail final: nunca navega para host desconhecido (mesmo após retries)
        if target_host and allowed_hosts and target_host not in allowed_hosts:
            raise Exception(f"Navegação bloqueada: host '{target_host}' desconhecido. Hosts válidos: {', '.join(sorted(allowed_hosts))}. Deveria ter clicado na UI.")
        driver.get(url)
        wait.until(EC.presence_of_element_located((By.TAG_NAME, "body")))
        time.sleep(1)
        if target_host:
            allowed_hosts.add(target_host)
        explorer.update_current_page(driver, platform_map)
        return f"Navegou para {url}"

    elif action_type == "inspect_api":
        expected = (action.get("expected", "") or "").strip()
        result = action.get("result", "")
        if not network_summary.strip():
            raise AssertionError("Nenhuma chamada de API capturada para inspecionar")
        if expected and expected.lower() not in network_summary.lower():
            raise AssertionError(f"'{expected}' NÃO encontrado nas chamadas de API capturadas (request/response)")
        return result or (f"Validado na API: '{expected}' presente" if expected else "API inspecionada")

    elif action_type == "verify":
        selector = action.get("selector", "")
        expected = action.get("expected", "")
        # Tenta via seletor
        if selector:
            try:
                el = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, selector)))
                actual = el.text
                if expected.lower() in actual.lower():
                    return f"Verificado: '{expected}' encontrado"
                raise AssertionError(f"Esperado '{expected}' mas encontrou '{actual}'")
            except AssertionError:
                raise
            except Exception:
                pass
        # Fallback: verifica no page source
        if expected and expected.lower() in driver.page_source.lower():
            return f"Verificado: '{expected}' presente na pagina"
        if expected:
            raise AssertionError(f"Texto '{expected}' nao encontrado na pagina")
        return "Verificacao concluida"

    elif action_type == "scroll":
        direction = action.get("direction", "down")
        amount = 500 if direction == "down" else -500
        driver.execute_script(f"window.scrollBy(0, {amount})")
        time.sleep(0.5)
        return f"Scroll {direction}"

    elif action_type == "done":
        return action.get("result", "Passo concluido sem acao necessaria")

    else:
        return f"Acao desconhecida: {action_type}"


def run_test(task_name: str, test_steps: list, route_hint: str | None = None,
             on_step=None, on_status=None, on_shot=None,
             is_cancelled=None, on_driver=None) -> dict:
    """
    on_status(msg): callback chamado a cada fase (login, 2fa, navegação, passo N)
    on_step(i, total, step, status, detail, png_bytes): após cada passo concluído
    on_shot(png_bytes): captura ao vivo da tela atual (live view no admin)
    is_cancelled(): retorna True se o usuário pediu para interromper
    on_driver(driver): registra o driver para poder ser morto no cancelamento
    Todos best-effort — usados para mostrar o progresso ao vivo no admin.
    """
    def _cancelled():
        try: return bool(is_cancelled and is_cancelled())
        except Exception: return False
    def _status(msg):
        if on_status:
            try: on_status(msg)
            except Exception: pass

    def _step(i, total, step, status, detail, png):
        if on_step:
            try: on_step(i, total, step, status, detail, png)
            except Exception: pass

    def _shot(drv):
        """Captura a tela atual e envia pro live view (best-effort)."""
        if not on_shot or not drv:
            return
        try:
            on_shot(drv.get_screenshot_as_png())
        except Exception:
            pass

    results = []
    screenshots = []
    net_calls: list[str] = []
    # Hosts que o bot pode navegar — começa com o sandbox; cresce ao visitar de verdade
    allowed_hosts: set = {_host(SANDBOX_URL)}
    attached = _attach_mode()
    driver = None

    try:
        _status("Conectando ao seu Chrome..." if attached else "Abrindo navegador...")
        driver = _get_driver()
        if on_driver:
            try: on_driver(driver)
            except Exception: pass
        wait = WebDriverWait(driver, 10)

        if attached:
            # Reutiliza a SUA sessão — não loga de novo (a menos que tenha caído na tela de login)
            _status("Usando sua sessão do Chrome (sem novo login)...")
            driver.get(SANDBOX_URL)
            time.sleep(2)
            if driver.find_elements(By.CSS_SELECTOR, 'input[type="password"]'):
                # Não estava logado → faz login normal como fallback
                _status("Sessão não detectada — fazendo login...")
                try:
                    login_ts = _do_login(driver, wait)
                    fa = _handle_2fa(driver, login_ts)
                    if fa: results.append(fa)
                except Exception as e:
                    results.append({"step": "Login", "status": "error", "detail": str(e) or repr(e)})
            else:
                results.append({"step": "Sessão", "status": "ok", "detail": "Reutilizando sessão do seu Chrome"})
        else:
            # Login
            _status("Fazendo login no sandbox...")
            try:
                login_ts = _do_login(driver, wait)
                # Sucesso = o campo de senha sumiu OU apareceu a tela de 2FA.
                # Usa find_elements (retorna [] em vez de estourar) — antes dava falso erro
                # quando a página já tinha trocado pro 2FA e o campo de senha não existia mais.
                try:
                    WebDriverWait(driver, 12).until(
                        lambda d: (not d.find_elements(By.CSS_SELECTOR, 'input[type="password"]'))
                                  or bool(d.find_elements(By.CSS_SELECTOR, 'input[maxlength="1"]'))
                    )
                except Exception:
                    pass  # segue pro 2FA de qualquer forma; não falha o login por causa do timing
                results.append({"step": "Login", "status": "ok"})
            except Exception as e:
                results.append({"step": "Login", "status": "error", "detail": str(e) or repr(e)})
                login_ts = time.time()

            # 2FA
            _status("Verificando 2FA (buscando código no e-mail)...")
            fa_result = _handle_2fa(driver, login_ts)
            if fa_result:
                results.append(fa_result)
                if fa_result["status"] == "error":
                    screenshots.append(("2fa_error", driver.get_screenshot_as_png()))
                    return {"success": False, "steps_results": results, "screenshots": screenshots, "error": "Falha no 2FA"}

        screenshots.append(("after_login", driver.get_screenshot_as_png()))
        _shot(driver)

        # Explorar a plataforma para aprender o UI
        _status("Explorando a plataforma para aprender a interface...")
        print("[TBot] Explorando plataforma para aprender o UI...")
        platform_map = explorer.explore(driver)

        # Navega para o ponto de partida: SÓ se route_hint for uma URL/path real.
        # Se for uma frase de orientação (ex.: "em vendas clique..."), NÃO vira URL
        # (isso causava 404); a frase já foi usada como instrução na geração dos passos.
        start_url = SANDBOX_URL
        rh = (route_hint or "").strip()
        looks_like_path = rh.startswith("http") or (rh.startswith("/") and " " not in rh)
        if looks_like_path:
            if rh.startswith("http"):
                start_url = rh
                allowed_hosts.add(_host(rh))
            else:
                start_url = SANDBOX_URL.rstrip("/") + "/" + rh.lstrip("/")
            print(f"[TBot] Indo para rota informada: {start_url}")
        elif rh:
            print(f"[TBot] route_hint é orientação textual (não-URL) — usado nos passos, navegando pela home.")
        driver.get(start_url)
        time.sleep(2)
        allowed_hosts.add(_host(driver.current_url))
        _shot(driver)

        # Executar steps com visão do Claude + contexto de rede acumulado
        total = len(test_steps)
        cancelled = False
        for i, step in enumerate(test_steps):
            if _cancelled():
                cancelled = True
                results.append({"step": "Cancelado", "status": "error", "detail": "Interrompido pelo usuário"})
                break
            _status(f"Passo {i+1}/{total}: {step[:90]}")
            _shot(driver)  # mostra a tela ANTES da ação (live view)
            # Drena chamadas de API observadas desde o último passo
            net_calls.extend(_drain_network(driver))
            network_summary = "\n".join(net_calls[-12:])
            try:
                result = _execute_step(driver, wait, step, platform_map, network_summary, allowed_hosts)
                step_status, detail = "ok", result
            except Exception as e:
                step_status, detail = "error", str(e)
            # Aprende o host atual (ex.: clicou e foi pro checkout) → passa a ser navegável
            allowed_hosts.add(_host(driver.current_url))
            results.append({"step": step, "status": step_status, "detail": detail})
            # Captura rede gerada pela ação também
            net_calls.extend(_drain_network(driver))
            png = driver.get_screenshot_as_png()
            screenshots.append((f"step_{i+1}", png))
            _shot(driver)  # mostra a tela DEPOIS da ação
            # Notifica progresso ao vivo (screenshot + resultado do passo)
            _step(i, total, step, step_status, detail, png)

        # Análise de segurança do front (pulada se cancelado — browser pode estar morto)
        security_findings = []
        if not cancelled:
            try:
                net_calls.extend(_drain_network(driver))
                security_findings = security.analyze(driver, net_calls)
                if security_findings:
                    print(f"[TBot] Segurança: {len(security_findings)} achado(s).")
            except Exception as e:
                print(f"[TBot] Análise de segurança falhou (ignorado): {e}")

        success = (not cancelled) and all(r["status"] == "ok" for r in results)
        return {
            "success": success,
            "steps_results": results,
            "screenshots": screenshots,
            "error": "Interrompido pelo usuário" if cancelled else None,
            "network": net_calls[-20:],
            "security": security_findings,
            "cancelled": cancelled,
        }

    except Exception as e:
        # Se o driver foi morto pelo cancelamento, a exceção é esperada
        if _cancelled():
            return {
                "success": False,
                "steps_results": results,
                "screenshots": screenshots,
                "error": "Interrompido pelo usuário",
                "network": net_calls[-20:],
                "security": [],
                "cancelled": True,
            }
        return {
            "success": False,
            "steps_results": results,
            "screenshots": screenshots,
            "error": f"{str(e)}\n{traceback.format_exc()}",
        }
    finally:
        # Em modo anexar, NÃO fecha o Chrome (é o seu navegador). Só desconecta.
        if driver and not attached:
            driver.quit()
