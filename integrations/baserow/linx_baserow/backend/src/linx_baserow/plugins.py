from django.urls import include, path

from baserow.core.registries import Plugin


class LinxPlugin(Plugin):
    type = "linx_baserow"

    def get_api_urls(self):
        return [
            path("linx/v1/", include("linx_baserow.api_urls")),
        ]
