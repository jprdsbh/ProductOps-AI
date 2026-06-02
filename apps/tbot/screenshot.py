"""
Screenshot capture for release notes.
Logs into TPAY **production** (gateway.tamborete.com.br), navigates to the
relevant feature with Claude's help, and saves the screenshot.
"""
import os
import time
import uuid
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env", override=True)

from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

import ai_agent
from tester import _get_driver, _handle_2fa

PRODUCTION_URL  = os.getenv("PRODUCTION_URL", "https://gateway.tamborete.com.br/")
PRODUCTION_USER = os.getenv("PRODUCTION_USER", "")
PRODUCTION_PASS = os.getenv("PRODUCTION_PASS", "")
UPLOADS_DIR = os.getenv(
    "UPLOADS_DIR",
    str(Path(__file__).parent.parent.parent / "uploads"),
)


def _production_login(driver, wait) -> float:
    """Faz login em produção e retorna timestamp do submit."""
    driver.get(PRODUCTION_URL)
    email_field = wait.until(
        EC.presence_of_element_located(
            (By.CSS_SELECTOR, 'input[type="email"], input[name="email"], input[name="username"]')
        )
    )
    email_field.send_keys(PRODUCTION_USER)
    driver.find_element(By.CSS_SELECTOR, 'input[type="password"]').send_keys(PRODUCTION_PASS)
    login_ts = time.time()
    driver.find_element(By.CSS_SELECTOR, 'button[type="submit"]').click()
    return login_ts


def capture_screenshot(description: str, suggested_capture: str) -> dict:
    """
    Loga em produção, navega até a tela correta com ajuda do Claude,
    tira screenshot, salva em UPLOADS_DIR e retorna { imageUrl, filename }.
    """
    Path(UPLOADS_DIR).mkdir(parents=True, exist_ok=True)

    driver = None
    try:
        driver = _get_driver()
        wait = WebDriverWait(driver, 12)

        # Login em produção
        login_ts = _production_login(driver, wait)
        try:
            wait.until(
                EC.staleness_of(
                    driver.find_element(By.CSS_SELECTOR, 'input[type="password"]')
                )
            )
        except Exception:
            pass

        fa_result = _handle_2fa(driver, login_ts)
        if fa_result and fa_result.get("status") == "error":
            return {"error": "2FA falhou: " + fa_result.get("detail", "")}

        time.sleep(1.5)

        # Claude decide qual rota acessar
        nav_prompt = (
            f"Instrução de captura: {suggested_capture}\n"
            f"Descrição da funcionalidade: {description}\n\n"
            "Rotas disponíveis no sistema:\n"
            "/ = Dashboard principal\n"
            "/transactions = Transações\n"
            "/payment-link = Links de pagamento\n"
            "/payment-link/create = Criar link de pagamento\n"
            "/balance = Extrato e saldo\n"
            "/receipts = Recibos e pagamentos recebidos\n"
            "/products = Produtos\n"
            "/templates = Templates de checkout\n"
            "/coupons = Cupons de desconto\n"
            "/sales-funnel = Funis de venda\n"
            "/integrations = Integrações\n"
            "/pixels = Pixels de rastreamento\n"
            "/order-bump = Order bump\n"
            "/sales = Vendas\n"
            "/pix-agent = Agente PIX\n"
            "/my-company = Minha empresa\n"
            "/perfil = Perfil pessoal\n\n"
            "Com base na instrução e descrição acima, qual rota devo acessar? "
            "Responda SOMENTE com o caminho relativo (ex: /transactions). Sem explicações."
        )

        screenshot_for_nav = driver.get_screenshot_as_png()
        nav_action = ai_agent.decide_action(
            screenshot_for_nav,
            nav_prompt,
            driver.current_url,
            {},
        )

        action_type = nav_action.get("type", "done")
        if action_type == "navigate":
            target_url = nav_action.get("url", "")
            if target_url and target_url != "home":
                if not target_url.startswith("http"):
                    target_url = PRODUCTION_URL.rstrip("/") + "/" + target_url.lstrip("/")
                driver.get(target_url)
                time.sleep(2)
        elif action_type == "click":
            selector = nav_action.get("selector", "")
            if selector:
                try:
                    el = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, selector)))
                    el.click()
                    time.sleep(2)
                except Exception:
                    pass

        time.sleep(1)
        png_bytes = driver.get_screenshot_as_png()

        filename = f"{uuid.uuid4().hex}.png"
        filepath = Path(UPLOADS_DIR) / filename
        filepath.write_bytes(png_bytes)

        api_url = os.getenv("API_URL", "http://localhost:3002")
        image_url = f"{api_url}/uploads/{filename}"

        return {"imageUrl": image_url, "filename": filename}

    except Exception as e:
        return {"error": str(e)}
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass
