"""
explorer.py — Mapeia automaticamente a plataforma gateway.
Descobre páginas, botões, inputs e links. Salva em platform_map.json.
Cresce a cada execução do TBot (aprendizagem acumulativa).
"""
import json
import time
import os
from pathlib import Path
from selenium.webdriver.common.by import By
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env", override=True)

PLATFORM_MAP_PATH = Path(__file__).parent / "platform_map.json"
SANDBOX_URL = os.getenv("SANDBOX_URL", "").rstrip("/")
MAX_PAGES = 30


def load_platform_map() -> dict:
    if PLATFORM_MAP_PATH.exists():
        try:
            return json.loads(PLATFORM_MAP_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"pages": {}, "flows": [], "version": 1}


def save_platform_map(data: dict):
    PLATFORM_MAP_PATH.write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def _get_selector(element) -> str:
    """Gera o melhor seletor CSS possível para um elemento."""
    try:
        elem_id = element.get_attribute("id")
        if elem_id:
            return f"#{elem_id}"
        data_testid = element.get_attribute("data-testid")
        if data_testid:
            return f'[data-testid="{data_testid}"]'
        name = element.get_attribute("name")
        tag = element.tag_name
        if name:
            return f'{tag}[name="{name}"]'
        aria = element.get_attribute("aria-label")
        if aria:
            return f'{tag}[aria-label="{aria}"]'
        classes = (element.get_attribute("class") or "").strip().split()
        meaningful = [c for c in classes if len(c) > 2 and not c.startswith("css-")]
        if meaningful:
            return f"{tag}.{'.'.join(meaningful[:2])}"
        return tag
    except Exception:
        return element.tag_name


def _map_page(driver) -> dict:
    """Extrai toda a informação útil da página atual."""
    page = {
        "url": driver.current_url,
        "title": driver.title,
        "buttons": [],
        "links": [],
        "inputs": [],
        "headings": [],
        "nav_items": [],
    }

    # Headings — dão contexto sobre o que a página faz
    for tag in ["h1", "h2", "h3"]:
        for el in driver.find_elements(By.TAG_NAME, tag):
            try:
                text = el.text.strip()
                if text:
                    page["headings"].append({"tag": tag, "text": text})
            except Exception:
                pass

    # Botões e elementos clicáveis
    selectors = "button, [role='button'], input[type='submit'], input[type='button'], a[class*='btn'], a[class*='button']"
    for el in driver.find_elements(By.CSS_SELECTOR, selectors):
        try:
            if not el.is_displayed():
                continue
            text = (el.text or el.get_attribute("value") or el.get_attribute("aria-label") or "").strip()
            page["buttons"].append({
                "text": text,
                "selector": _get_selector(el),
                "tag": el.tag_name,
            })
        except Exception:
            pass

    # Links de navegação
    for el in driver.find_elements(By.TAG_NAME, "a"):
        try:
            href = el.get_attribute("href") or ""
            if not href or href.startswith("javascript") or href == "#":
                continue
            text = el.text.strip()
            is_internal = SANDBOX_URL in href
            page["links"].append({
                "text": text,
                "href": href,
                "internal": is_internal,
                "selector": _get_selector(el),
            })
        except Exception:
            pass

    # Inputs e formulários
    for el in driver.find_elements(By.CSS_SELECTOR, "input:not([type='hidden']), select, textarea"):
        try:
            if not el.is_displayed():
                continue
            page["inputs"].append({
                "type": el.get_attribute("type") or "text",
                "name": el.get_attribute("name") or "",
                "placeholder": el.get_attribute("placeholder") or "",
                "label": el.get_attribute("aria-label") or "",
                "selector": _get_selector(el),
            })
        except Exception:
            pass

    # Itens de navegação (menu, sidebar)
    for el in driver.find_elements(By.CSS_SELECTOR, "nav a, [role='navigation'] a, aside a, [class*='sidebar'] a, [class*='menu'] a"):
        try:
            text = el.text.strip()
            href = el.get_attribute("href") or ""
            if text and href:
                page["nav_items"].append({"text": text, "href": href})
        except Exception:
            pass

    return page


def explore(driver) -> dict:
    """
    Explora o gateway após o login, mapeando todas as páginas acessíveis.
    Atualiza platform_map.json com o conhecimento acumulado.
    Retorna o mapa atualizado.
    """
    platform_map = load_platform_map()
    pages = platform_map.setdefault("pages", {})

    visited = set(pages.keys())
    to_visit = [driver.current_url]
    pages_mapped = 0

    print("[Explorer] Iniciando mapeamento da plataforma...")

    while to_visit and pages_mapped < MAX_PAGES:
        url = to_visit.pop(0)
        if url in visited:
            continue

        try:
            if driver.current_url != url:
                driver.get(url)
                time.sleep(1.5)

            actual_url = driver.current_url
            if actual_url in visited:
                continue

            page_info = _map_page(driver)
            pages[actual_url] = page_info
            visited.add(actual_url)
            pages_mapped += 1

            print(f"[Explorer] [{pages_mapped}] {page_info['title']} — {actual_url}")

            # Adiciona links internos à fila
            for link in page_info.get("links", []):
                if link["internal"] and link["href"] not in visited:
                    to_visit.append(link["href"])

            # Adiciona nav items à fila
            for nav in page_info.get("nav_items", []):
                href = nav["href"]
                if SANDBOX_URL in href and href not in visited:
                    to_visit.append(href)

        except Exception as e:
            print(f"[Explorer] Erro ao mapear {url}: {e}")
            visited.add(url)

    platform_map["last_explored"] = time.strftime("%Y-%m-%d %H:%M:%S")
    platform_map["total_pages"] = len(pages)
    save_platform_map(platform_map)

    print(f"[Explorer] Mapeamento concluido: {pages_mapped} novas paginas ({len(pages)} total no mapa)")
    return platform_map


def update_current_page(driver, platform_map: dict) -> dict:
    """
    Mapeia apenas a página atual e atualiza o mapa.
    Usado durante os test steps para aprender páginas novas.
    """
    url = driver.current_url
    try:
        page_info = _map_page(driver)
        platform_map.setdefault("pages", {})[url] = page_info
        save_platform_map(platform_map)
    except Exception as e:
        print(f"[Explorer] Erro ao mapear pagina atual: {e}")
    return platform_map


def get_page_summary(platform_map: dict, url: str) -> str:
    """Retorna um resumo textual do que se sabe sobre uma página."""
    pages = platform_map.get("pages", {})
    # Tenta match exato ou parcial
    page = pages.get(url)
    if not page:
        for k, v in pages.items():
            if url in k or k in url:
                page = v
                break
    if not page:
        return "Pagina desconhecida"

    lines = [f"Titulo: {page.get('title', '')}"]
    if page.get("headings"):
        lines.append("Titulos: " + " | ".join(h["text"] for h in page["headings"][:3]))
    if page.get("buttons"):
        btns = [b["text"] for b in page["buttons"] if b["text"]][:6]
        lines.append("Botoes: " + ", ".join(btns))
    if page.get("inputs"):
        inps = [i.get("placeholder") or i.get("name") or i.get("type") for i in page["inputs"]][:4]
        lines.append("Inputs: " + ", ".join(filter(None, inps)))
    if page.get("nav_items"):
        navs = [n["text"] for n in page["nav_items"]][:5]
        lines.append("Menu: " + ", ".join(navs))
    return "\n".join(lines)
