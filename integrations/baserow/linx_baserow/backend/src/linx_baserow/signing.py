import hashlib
import hmac
import json
import secrets
import time
import urllib.error
import urllib.request
from datetime import timedelta

from django.conf import settings
from django.db import IntegrityError
from django.utils import timezone

from .models import LinxRequestNonce


def canonical_json(value):
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def request_signature(secret, method, path, timestamp, nonce, body):
    body_hash = hashlib.sha256(canonical_json(body).encode("utf-8")).hexdigest()
    canonical = "\n".join((method.upper(), path, timestamp, nonce, body_hash))
    return hmac.new(
        secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256
    ).hexdigest()


def _remember_nonce(nonce):
    if not nonce or len(nonce) > 128:
        return False
    now = timezone.now()
    LinxRequestNonce.objects.filter(expires_at__lte=now).delete()
    try:
        LinxRequestNonce.objects.create(
            nonce=nonce, expires_at=now + timedelta(minutes=2)
        )
        return True
    except IntegrityError:
        return False


def verify_request(request, path):
    secret = settings.LINX_BASEROW_SHARED_SECRET
    if len(secret) < 32:
        return False
    timestamp = request.headers.get("X-Linx-Timestamp", "")
    nonce = request.headers.get("X-Linx-Nonce", "")
    signature = request.headers.get("X-Linx-Signature", "")
    try:
        if abs(int(time.time()) - int(timestamp)) > 60:
            return False
    except (TypeError, ValueError):
        return False
    expected = request_signature(
        secret, request.method, path, timestamp, nonce, request.data
    )
    return hmac.compare_digest(signature, expected) and _remember_nonce(nonce)


def post_to_linx(path, body):
    secret = settings.LINX_BASEROW_SHARED_SECRET
    if len(secret) < 32:
        raise RuntimeError("LINX_BASEROW_SHARED_SECRET must contain at least 32 chars")
    timestamp = str(int(time.time()))
    nonce = secrets.token_hex(16)
    signature = request_signature(secret, "POST", path, timestamp, nonce, body)
    payload = canonical_json(body).encode("utf-8")
    req = urllib.request.Request(
        settings.LINX_INTERNAL_URL.rstrip("/") + path,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Linx-Timestamp": timestamp,
            "X-Linx-Nonce": nonce,
            "X-Linx-Signature": signature,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        try:
            data = json.loads(error.read().decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            data = {"error": "LinX exchange failed"}
        return error.code, data
