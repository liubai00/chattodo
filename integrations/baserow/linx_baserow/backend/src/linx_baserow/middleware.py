from django.conf import settings

from .confirmation_context import confirmed_action


def _without_frame_ancestors(value):
    return "; ".join(
        directive.strip()
        for directive in str(value or "").split(";")
        if directive.strip()
        and not directive.strip().lower().startswith("frame-ancestors")
    )


class LinxFramePolicyMiddleware:
    """Allow framing only from the configured LinX origin."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # The custom frontend adds this header only after a visible confirmation.
        # The context is request-local and also guards direct Baserow API calls.
        with confirmed_action(request.headers.get("X-Linx-Confirmed-Action")):
            response = self.get_response(request)
        response.headers.pop("X-Frame-Options", None)
        policy = _without_frame_ancestors(
            response.headers.get("Content-Security-Policy", "")
        )
        frame_policy = "frame-ancestors 'self' " + settings.LINX_PARENT_ORIGIN
        response.headers["Content-Security-Policy"] = "; ".join(
            part for part in (policy, frame_policy) if part
        )
        return response
