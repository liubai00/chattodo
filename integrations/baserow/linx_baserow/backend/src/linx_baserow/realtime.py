from baserow.contrib.database.ws.pages import RowPageType, TablePageType
from baserow.ws.registries import page_registry
from baserow.ws.tasks import broadcast_to_users

from .models import LinxRowPrincipal
from .services import is_personal_table


ROW_EVENT_TYPES = {
    "rows_created",
    "rows_updated",
    "rows_deleted",
    "rows_ai_values_generation_error",
}


def _row_ids(payload):
    if isinstance(payload.get("row_ids"), list):
        return [int(value) for value in payload["row_ids"]]
    rows = payload.get("rows") or []
    return [int(row["id"]) for row in rows if isinstance(row, dict) and row.get("id")]


class LinxTablePageType(TablePageType):
    def broadcast(
        self,
        payload,
        ignore_web_socket_id=None,
        exclude_user_ids=None,
        **kwargs,
    ):
        table_id = int(kwargs.get("table_id") or payload.get("table_id") or 0)
        if is_personal_table(table_id) and payload.get("type") in ROW_EVENT_TYPES:
            row_ids = _row_ids(payload)
            user_ids = list(
                LinxRowPrincipal.objects.filter(
                    table_id=table_id, row_id__in=row_ids
                )
                .values_list("user_id", flat=True)
                .distinct()
            )
            if exclude_user_ids:
                excluded = set(exclude_user_ids)
                user_ids = [user_id for user_id in user_ids if user_id not in excluded]
            if user_ids:
                broadcast_to_users.delay(user_ids, payload, ignore_web_socket_id)
            return
        return super().broadcast(
            payload,
            ignore_web_socket_id,
            exclude_user_ids,
            **kwargs,
        )

    def get_presence_space_name(self, table_id, **kwargs):
        if table_id and is_personal_table(int(table_id)):
            return None
        return super().get_presence_space_name(table_id, **kwargs)

    def filter_focus_for_recipient(self, page_parameters, focus, focus_type):
        table_id = int(page_parameters.get("table_id") or 0)
        if is_personal_table(table_id):
            return False
        return super().filter_focus_for_recipient(
            page_parameters, focus, focus_type
        )


class LinxRowPageType(RowPageType):
    """Deliver row-modal/history events to current principals, not stale groups."""

    def broadcast(
        self,
        payload,
        ignore_web_socket_id=None,
        exclude_user_ids=None,
        **kwargs,
    ):
        table_id = int(kwargs.get("table_id") or payload.get("table_id") or 0)
        row_id = int(kwargs.get("row_id") or payload.get("row_id") or 0)
        if is_personal_table(table_id):
            user_ids = list(
                LinxRowPrincipal.objects.filter(table_id=table_id, row_id=row_id)
                .values_list("user_id", flat=True)
                .distinct()
            )
            if exclude_user_ids:
                excluded = set(exclude_user_ids)
                user_ids = [user_id for user_id in user_ids if user_id not in excluded]
            if user_ids:
                broadcast_to_users.delay(user_ids, payload, ignore_web_socket_id)
            return
        return super().broadcast(
            payload,
            ignore_web_socket_id,
            exclude_user_ids,
            **kwargs,
        )

    def broadcast_many(
        self,
        payloads_with_groups,
        ignore_web_socket_id=None,
        exclude_user_ids=None,
        **kwargs,
    ):
        regular = []
        for group_kwargs, payload in payloads_with_groups:
            table_id = int(
                group_kwargs.get("table_id")
                or kwargs.get("table_id")
                or payload.get("table_id")
                or 0
            )
            if is_personal_table(table_id):
                self.broadcast(
                    payload,
                    ignore_web_socket_id,
                    exclude_user_ids,
                    **group_kwargs,
                )
            else:
                regular.append((group_kwargs, payload))
        if regular:
            return super().broadcast_many(
                regular,
                ignore_web_socket_id,
                exclude_user_ids,
                **kwargs,
            )


def install_realtime_page_type():
    table_page = page_registry.get("table")
    if not isinstance(table_page, LinxTablePageType):
        page_registry.unregister("table")
        page_registry.register(LinxTablePageType())

    row_page = page_registry.get("row")
    if not isinstance(row_page, LinxRowPageType):
        page_registry.unregister("row")
        page_registry.register(LinxRowPageType())
