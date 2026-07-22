import os
from datetime import timedelta


def setup(settings):
    """Apply the small set of settings required by the LinX integration."""

    settings.LINX_INTERNAL_URL = os.getenv(
        "LINX_INTERNAL_URL", "http://linx-api:3000"
    )
    settings.LINX_PUBLIC_URL = os.getenv(
        "LINX_PUBLIC_URL", "http://localhost:5173"
    )
    settings.LINX_PARENT_ORIGIN = os.getenv(
        "LINX_PARENT_ORIGIN", settings.LINX_PUBLIC_URL
    ).rstrip("/")
    settings.LINX_BASEROW_SHARED_SECRET = os.getenv(
        "LINX_BASEROW_SHARED_SECRET", ""
    )

    # The iframe session is intentionally much shorter than a normal Baserow login.
    # LinX can mint a fresh one-time launch ticket whenever the user reopens the page.
    settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"] = timedelta(minutes=15)
    settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"] = timedelta(hours=8)

    # Permission managers stop at the first definitive answer. LinX must run
    # first so no built-in manager can grant an operation which this managed
    # workspace deliberately denies (public sharing, tokens, webhooks, etc.).
    if "linx" in settings.PERMISSION_MANAGERS:
        settings.PERMISSION_MANAGERS.remove("linx")
    settings.PERMISSION_MANAGERS.insert(0, "linx")

    middleware = "linx_baserow.middleware.LinxFramePolicyMiddleware"
    if middleware not in settings.MIDDLEWARE:
        clickjacking = "django.middleware.clickjacking.XFrameOptionsMiddleware"
        insert_at = (
            settings.MIDDLEWARE.index(clickjacking)
            if clickjacking in settings.MIDDLEWARE
            else len(settings.MIDDLEWARE)
        )
        # On the response path this executes after Django's clickjacking middleware,
        # so the generic X-Frame-Options value can be replaced by an origin-bound CSP.
        settings.MIDDLEWARE.insert(insert_at, middleware)
