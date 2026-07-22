from django.apps import AppConfig


class LinxBaserowConfig(AppConfig):
    name = "linx_baserow"
    verbose_name = "LinX Baserow Integration"

    def ready(self):
        from baserow.core.registries import (
            permission_manager_type_registry,
            plugin_registry,
        )

        from .permission_manager import LinxPermissionManagerType
        from .plugins import LinxPlugin
        from .policy import install_policy_guards
        from .realtime import install_realtime_page_type

        plugin_registry.register(LinxPlugin())
        permission_manager_type_registry.register(LinxPermissionManagerType())
        install_policy_guards()
        install_realtime_page_type()

        # Importing connects Django signal receivers.
        from . import signals  # noqa: F401
