from django.db.models import Subquery

from baserow.contrib.database.fields.models import Field
from baserow.contrib.database.table.models import Table
from baserow.core.exceptions import PermissionDenied
from baserow.core.registries import PermissionManagerType
from baserow.core.subjects import UserSubjectType

from .models import LinxRowPrincipal, LinxWorkspaceConfig
from .services import config_for_table


DENIED_WORKSPACE_OPERATIONS = {
    "workspace.update",
    "workspace.delete",
    "workspace.export",
    "workspace.create_application",
    "workspace.order_applications",
    "workspace.create_invitation",
    "workspace.list_invitations",
    "workspace.list_workspace_users",
    "workspace.run_airtable_import",
    # LinX deliberately exposes database access only through an authenticated
    # Baserow browser session or its signed, user-scoped gateway. A Baserow
    # database token or MCP endpoint would introduce a second identity which no
    # longer has the per-row LinX principals attached to it.
    "workspace.create_token",
    "workspace.token.read",
    "workspace.token.update",
    "workspace.token.use",
    "workspace.create_mcp_endpoint",
    "workspace.mcp_endpoint.read",
    "workspace.mcp_endpoint.update",
    "workspace.mcp_endpoint.delete",
    # Deleted personal rows and their history are still sensitive. LinX owns
    # recovery, so the generic workspace trash browser must not expose them.
    "workspace.read_trash",
    "workspace.empty_trash",
    "application.read_trash",
    "application.empty_trash",
    "workspace_user.update",
    "workspace_user.delete",
    "invitation.read",
    "invitation.update",
    "invitation.delete",
    "application.update",
    "application.duplicate",
    "application.delete",
    "database.create_table",
    "database.order_tables",
    "database.table.update",
    "database.table.duplicate",
    "database.table.delete",
    "database.table.import_rows",
    "database.table.run_export",
    # Webhooks serialize table events without the initiating user's row scope.
    # They must therefore be unavailable on a personal-task table.
    "database.table.list_webhooks",
    "database.table.create_webhook",
    "database.table.webhook.read",
    "database.table.webhook.update",
    "database.table.webhook.test_trigger",
    "database.table.webhook.delete",
    "database.table.create_public_view",
    "database.table.create_and_use_personal_view",
    "database.table.view.update_public",
    "database.table.view.update_slug",
    # Application snapshots contain every row and cannot be made principal-aware.
    "application.list_snapshots",
    "application.create_snapshot",
    "application.snapshot.restore",
    "application.snapshot.delete",
}

ROW_LIST_OPERATIONS = {
    "database.table.list_rows",
    "database.table.view.list_rows",
}


def _table_from_context(context):
    if isinstance(context, Table):
        return context
    if isinstance(context, Field):
        return context.table
    table = getattr(context, "table", None)
    if isinstance(table, Table):
        return table
    database = getattr(context, "database", None)
    if database is not None:
        return None
    return None


class LinxPermissionManagerType(PermissionManagerType):
    type = "linx"
    supported_actor_types = [UserSubjectType.type]

    def check_multiple_permissions(self, checks, workspace=None, include_trash=False):
        if workspace is None or not LinxWorkspaceConfig.objects.filter(
            workspace_id=workspace.id
        ).exists():
            return {}
        result = {}
        for check in checks:
            if check.operation_name in DENIED_WORKSPACE_OPERATIONS:
                result[check] = PermissionDenied(actor=check.actor)
                continue
            context = check.context
            if isinstance(context, Field) and check.operation_name in {
                "database.table.field.update",
                "database.table.field.delete",
                "database.table.field.duplicate",
            }:
                config = config_for_table(context.table_id)
                if config is not None:
                    role_schema = config.schema.get(
                        "personal" if config.personal_table_id == context.table_id else "team",
                        {},
                    )
                    protected = {
                        role_schema.get("primary_field_id"),
                        role_schema.get("source_field_id"),
                    }
                    if context.id in protected:
                        result[check] = PermissionDenied(actor=check.actor)
        return result

    def get_permissions_object(self, actor, workspace=None):
        if workspace is None or not LinxWorkspaceConfig.objects.filter(
            workspace_id=workspace.id
        ).exists():
            return None
        return {
            "managed": True,
            "denied_operations": sorted(DENIED_WORKSPACE_OPERATIONS),
        }

    def filter_queryset(self, actor, operation_name, queryset, workspace=None):
        if operation_name not in ROW_LIST_OPERATIONS:
            return None
        table_id = getattr(queryset.model, "baserow_table_id", None)
        config = config_for_table(table_id) if table_id else None
        if config is None or config.personal_table_id != table_id:
            return None
        allowed_rows = LinxRowPrincipal.objects.filter(
            table_id=table_id, user_id=actor.id
        ).values("row_id")
        return queryset.filter(id__in=Subquery(allowed_rows))
