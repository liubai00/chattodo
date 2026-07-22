from contextvars import ContextVar
from functools import wraps

from baserow.contrib.database.api.rows.views import (
    RowAdjacentView,
    RowHistoryView,
    RowNamesView,
    RowsView,
)
from baserow.contrib.database.fields.handler import FieldHandler
from baserow.contrib.database.fields.registries import field_type_registry
from baserow.contrib.database.rows.handler import RowHandler
from baserow.contrib.database.search_types import (
    RowSearchType,
    _empty_annotated_table_queryset,
)
from baserow.contrib.database.table.handler import TableHandler
from baserow.contrib.database.table.models import Table
from baserow.contrib.database.table.operations import (
    ListRowsDatabaseTableOperationType,
)
from baserow.contrib.database.views.handler import ViewHandler
from baserow.core.exceptions import PermissionDenied
from baserow.core.handler import CoreHandler

from .access import enforce_rows
from .confirmation_context import is_confirmed
from .models import LinxWorkspaceConfig
from .services import (
    ALLOWED_FIELD_TYPES,
    RESERVED_FIELD_NAMES,
    config_for_table,
    is_personal_table,
)


_adjacent_row_actor = ContextVar("linx_adjacent_row_actor", default=None)


def _linx_table(table):
    return config_for_table(getattr(table, "id", None)) is not None


def _source_field_id(table):
    config = config_for_table(getattr(table, "id", None))
    if config is None:
        return None
    space = "personal" if config.personal_table_id == table.id else "team"
    return config.schema.get(space, {}).get("source_field_id")


def install_policy_guards():
    if getattr(RowHandler, "_linx_policy_installed", False):
        return

    original_row_check = RowHandler._check_permissions_with_view_fallback

    @wraps(original_row_check)
    def row_check(
        self,
        table_operation,
        view_operation,
        user,
        table,
        view,
        row_ids=None,
    ):
        result = original_row_check(
            self,
            table_operation,
            view_operation,
            user,
            table,
            view,
            row_ids,
        )
        enforce_rows(user, table, row_ids or [], table_operation)
        return result

    RowHandler._check_permissions_with_view_fallback = row_check

    original_create_field = FieldHandler.create_field

    @wraps(original_create_field)
    def create_field(self, user, table, type_name, *args, **kwargs):
        if _linx_table(table):
            if type_name not in ALLOWED_FIELD_TYPES:
                raise PermissionDenied(actor=user)
            if str(kwargs.get("name") or "").strip() in RESERVED_FIELD_NAMES:
                raise PermissionDenied(actor=user)
        return original_create_field(self, user, table, type_name, *args, **kwargs)

    FieldHandler.create_field = create_field

    original_update_field = FieldHandler.update_field

    @wraps(original_update_field)
    def update_field(self, user, field, new_type_name=None, *args, **kwargs):
        if (
            _linx_table(field.table)
            and str(kwargs.get("name") or "").strip() in RESERVED_FIELD_NAMES
        ):
            raise PermissionDenied(actor=user)
        if (
            _linx_table(field.table)
            and new_type_name is not None
            and new_type_name not in ALLOWED_FIELD_TYPES
        ):
            raise PermissionDenied(actor=user)
        current_type = field_type_registry.get_by_model(field).type
        if (
            _linx_table(field.table)
            and new_type_name is not None
            and new_type_name != current_type
            and not is_confirmed("field.type_change")
        ):
            raise PermissionDenied(actor=user)
        return original_update_field(
            self, user, field, new_type_name, *args, **kwargs
        )

    FieldHandler.update_field = update_field

    original_delete_field = FieldHandler.delete_field

    @wraps(original_delete_field)
    def delete_field(self, user, field, *args, **kwargs):
        if _linx_table(field.table) and not is_confirmed("field.delete"):
            raise PermissionDenied(actor=user)
        return original_delete_field(self, user, field, *args, **kwargs)

    FieldHandler.delete_field = delete_field

    original_create_view = ViewHandler.create_view

    @wraps(original_create_view)
    def create_view(self, user, table, type_name, **kwargs):
        if _linx_table(table):
            if type_name != "grid" or kwargs.get("ownership_type", "collaborative") != "collaborative":
                raise PermissionDenied(actor=user)
        view = original_create_view(self, user, table, type_name, **kwargs)
        source_field_id = _source_field_id(table)
        if source_field_id:
            self.update_field_options(
                view, {source_field_id: {"hidden": True}}, user=user
            )
        return view

    ViewHandler.create_view = create_view

    original_update_view = ViewHandler.update_view

    @wraps(original_update_view)
    def update_view(self, user, view, **data):
        if _linx_table(view.table):
            if data.get("ownership_type") not in (None, "collaborative"):
                raise PermissionDenied(actor=user)
            if (
                data.get("public")
                or data.get("public_view_password")
                or data.get("allow_public_export")
            ):
                raise PermissionDenied(actor=user)
        return original_update_view(self, user, view, **data)

    ViewHandler.update_view = update_view

    original_update_field_options = ViewHandler.update_field_options

    @wraps(original_update_field_options)
    def update_field_options(
        self, view, field_options, user=None, fields=None
    ):
        source_field_id = _source_field_id(view.table)
        if source_field_id:
            protected = dict(field_options)
            current = dict(
                protected.get(source_field_id)
                or protected.get(str(source_field_id))
                or {}
            )
            current["hidden"] = True
            protected[source_field_id] = current
            protected.pop(str(source_field_id), None)
            field_options = protected
        return original_update_field_options(
            self, view, field_options, user=user, fields=fields
        )

    ViewHandler.update_field_options = update_field_options

    # Baserow's native Grid endpoints build their row queryset through
    # ViewHandler.get_queryset directly. That path does not call
    # CoreHandler.filter_queryset by itself, so a permission manager alone would
    # only protect the table REST endpoints, not the initial Grid page/search/count.
    original_get_view_queryset = ViewHandler.get_queryset

    @wraps(original_get_view_queryset)
    def get_view_queryset(self, user, view, *args, **kwargs):
        queryset = original_get_view_queryset(self, user, view, *args, **kwargs)
        if not _linx_table(view.table):
            return queryset
        if user is None:
            # Internal view maintenance is not a user data response. Realtime row
            # delivery is filtered independently by LinxTablePageType.
            return queryset
        if not getattr(user, "is_authenticated", False):
            return queryset.none()
        return CoreHandler().filter_queryset(
            user,
            ListRowsDatabaseTableOperationType.type,
            queryset,
            workspace=view.table.database.workspace,
        )

    ViewHandler.get_queryset = get_view_queryset

    # The generic REST row-list endpoint builds model.objects directly instead
    # of using CoreHandler.filter_queryset. LinX itself lists personal rows via
    # the signed gateway, while the native Grid uses ViewHandler above, so deny
    # this otherwise unsafe alternate list API for personal tables.
    original_rows_get = RowsView.get

    @wraps(original_rows_get)
    def rows_get(self, request, table_id, *args, **kwargs):
        if is_personal_table(table_id):
            raise PermissionDenied(actor=request.user)
        return original_rows_get(self, request, table_id, *args, **kwargs)

    RowsView.get = rows_get

    # Row names is another direct model query intended for link-row fields. LinX
    # does not allow link-row fields in v1, and returning even just the primary
    # value would disclose an inaccessible personal task.
    original_row_names_get = RowNamesView.get

    @wraps(original_row_names_get)
    def row_names_get(self, request, *args, **kwargs):
        for name in request.GET.keys():
            if not name.startswith("table__"):
                continue
            try:
                table_id = int(name[7:])
            except ValueError:
                continue
            if is_personal_table(table_id):
                raise PermissionDenied(actor=request.user)
        return original_row_names_get(self, request, *args, **kwargs)

    RowNamesView.get = row_names_get

    # The adjacent-row helper receives no actor. Bind the actor for the duration
    # of this API request, then filter the helper's queryset before it computes
    # the previous/next row. This keeps row-modal navigation functional without
    # ever stepping through another member's personal task.
    original_adjacent_get = RowAdjacentView.get

    @wraps(original_adjacent_get)
    def adjacent_get(self, request, *args, **kwargs):
        token = _adjacent_row_actor.set(request.user)
        try:
            return original_adjacent_get(self, request, *args, **kwargs)
        finally:
            _adjacent_row_actor.reset(token)

    RowAdjacentView.get = adjacent_get

    original_get_adjacent_in_queryset = RowHandler.get_adjacent_row_in_queryset

    @wraps(original_get_adjacent_in_queryset)
    def get_adjacent_in_queryset(self, queryset, row_id, previous=False):
        actor = _adjacent_row_actor.get()
        table_id = getattr(queryset.model, "baserow_table_id", None)
        if actor is not None and table_id and is_personal_table(table_id):
            table = Table.objects.select_related("database__workspace").get(id=table_id)
            queryset = CoreHandler().filter_queryset(
                actor,
                ListRowsDatabaseTableOperationType.type,
                queryset,
                workspace=table.database.workspace,
            )
        return original_get_adjacent_in_queryset(
            self, queryset, row_id, previous=previous
        )

    RowHandler.get_adjacent_row_in_queryset = get_adjacent_in_queryset

    # The history endpoint checks table permission but not row permission.
    original_history_get = RowHistoryView.get

    @wraps(original_history_get)
    def history_get(self, request, table_id, row_id, *args, **kwargs):
        if is_personal_table(table_id):
            table = TableHandler().get_table(table_id)
            enforce_rows(
                request.user,
                table,
                [row_id],
                "database.table.read_row_history",
            )
        return original_history_get(
            self, request, table_id, row_id, *args, **kwargs
        )

    RowHistoryView.get = history_get

    # Baserow's workspace-wide full-text index has table/field permission
    # filtering but no row-level hook. LinX has its own principal-aware search,
    # so omit row hits for managed workspaces. Grid-local search remains enabled.
    original_row_search = RowSearchType.get_union_values_queryset

    @wraps(original_row_search)
    def row_search(self, user, workspace, context):
        if LinxWorkspaceConfig.objects.filter(workspace_id=workspace.id).exists():
            return _empty_annotated_table_queryset(
                self.type, getattr(self, "priority", 10)
            )
        return original_row_search(self, user, workspace, context)

    RowSearchType.get_union_values_queryset = row_search
    RowHandler._linx_policy_installed = True
