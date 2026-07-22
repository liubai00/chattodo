from baserow.config.celery import app

from .signing import post_to_linx


@app.task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
    retry_kwargs={"max_retries": 5},
)
def send_linx_event(self, event):
    """Reliably forward a Baserow domain event to the LinX backend."""

    status, _payload = post_to_linx("/api/internal/baserow/events", event)
    if status < 200 or status >= 300:
        raise RuntimeError(f"LinX event delivery failed with HTTP {status}")
