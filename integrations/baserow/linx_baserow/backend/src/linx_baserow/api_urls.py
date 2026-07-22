from django.urls import path

from .views import LinxActionView, LinxHealthView, LinxSessionExchangeView


app_name = "linx_baserow"

urlpatterns = [
    path("health/", LinxHealthView.as_view(), name="health"),
    path("session/exchange/", LinxSessionExchangeView.as_view(), name="session_exchange"),
    path("actions/", LinxActionView.as_view(), name="actions"),
]
