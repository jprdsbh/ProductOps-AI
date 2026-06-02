import imaplib
import email
import email.utils
import re
import time
import os
from datetime import datetime, timezone, date
from dotenv import load_dotenv

load_dotenv()

IMAP_SERVER = os.getenv("IMAP_SERVER", "imap.gmail.com")
IMAP_PORT = int(os.getenv("IMAP_PORT", "993"))
# E-mail que LÊ o OTP. Por padrão usa o SANDBOX_USER, mas pode ser outro Gmail
# (defina IMAP_EMAIL no .env) — útil quando o OTP chega numa caixa diferente.
EMAIL_ADDRESS = os.getenv("IMAP_EMAIL") or os.getenv("SANDBOX_USER")
EMAIL_APP_PASSWORD = os.getenv("EMAIL_APP_PASSWORD")
# Label/pasta onde o OTP cai (filtro do Gmail). Vazio = caixa de entrada (INBOX).
IMAP_LABEL = os.getenv("IMAP_LABEL", "acess code tpay")
# Remetente do OTP
OTP_FROM = os.getenv("OTP_FROM", "no-reply@tpay.com.br")


def get_latest_otp(timeout: int = 60, poll_interval: int = 3, after_timestamp: float = None) -> str | None:
    """
    Polls inbox for a 6-digit OTP from tpay.com.br.
    Only accepts emails received AFTER after_timestamp (unix time).
    """
    if after_timestamp is None:
        after_timestamp = time.time()

    print(f"[Gmail] Aguardando OTP enviado apos {datetime.fromtimestamp(after_timestamp).strftime('%H:%M:%S')}...")

    start = time.time()
    while time.time() - start < timeout:
        try:
            code = _fetch_otp_after(after_timestamp)
            if code:
                return code
        except Exception as e:
            print(f"[Gmail] Erro ao ler inbox: {e}")
        time.sleep(poll_interval)

    return None


def _fetch_otp_after(after_timestamp: float) -> str | None:
    # Formato IMAP: DD-Mon-YYYY (ex: 13-Apr-2026)
    today_str = date.today().strftime("%d-%b-%Y")

    with imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT) as mail:
        mail.login(EMAIL_ADDRESS, EMAIL_APP_PASSWORD)
        # Tenta a label configurada; se não existir, cai pra INBOX
        target = f'"{IMAP_LABEL}"' if IMAP_LABEL else "INBOX"
        status, _ = mail.select(target)
        if status != "OK":
            print(f"[Gmail] Label {target} não encontrada — usando INBOX")
            mail.select("INBOX")

        _, data = mail.search(None, f'(FROM "{OTP_FROM}" SINCE {today_str})')
        if not data or not data[0]:
            return None

        mail_ids = data[0].split()
        if not mail_ids:
            return None

        # Verifica os últimos 5 emails de hoje, do mais recente para o mais antigo
        for mail_id in reversed(mail_ids[-5:]):
            _, msg_data = mail.fetch(mail_id, "(RFC822)")
            if not msg_data or not msg_data[0]:
                continue

            raw_email = msg_data[0][1]
            msg = email.message_from_bytes(raw_email)

            # Verifica a data do email
            date_str = msg.get("Date", "")
            try:
                email_time = email.utils.parsedate_to_datetime(date_str).timestamp()
            except Exception:
                continue

            if email_time < after_timestamp:
                print(f"[Gmail] Email ignorado (chegou antes do login): {date_str}")
                continue

            body = _extract_body(msg)
            match = re.search(r"\b(\d{6})\b", body)
            if match:
                print(f"[Gmail] OTP encontrado: {match.group(1)} (email de {date_str})")
                return match.group(1)

    return None


def _extract_body(msg) -> str:
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            if content_type in ("text/plain", "text/html"):
                try:
                    body += part.get_payload(decode=True).decode("utf-8", errors="ignore")
                except Exception:
                    pass
    else:
        try:
            body = msg.get_payload(decode=True).decode("utf-8", errors="ignore")
        except Exception:
            pass
    return body
