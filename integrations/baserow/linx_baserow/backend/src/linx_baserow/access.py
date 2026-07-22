from baserow.core.exceptions import PermissionDenied

from .models import LinxRowPrincipal
from .services import config_for_table, is_personal_table


ROW_READ_OPERATIONS = {
    "database.table.read_row",
    "database.table.read_adjacent_row",
    "database.table.view.read_row",
    "database.table.view.read_adjacent_row",
    "database.table.read_row_history",
    "database.table.view.list_comments",
}
ROW_UPDATE_OPERATIONS = {
    "database.table.update_row",
    "database.table.move_row",
    "database.table.view.update_row",
    "database.table.view.move_row",
}
ROW_DELETE_OPERATIONS = {
    "database.table.delete_row",
    "database.table.view.delete_row",
}


def has_row_access(user, table_id, row_id):
    if not is_personal_table(table_id):
        return config_for_table(table_id) is not None
    return LinxRowPrincipal.objects.filter(
        table_id=table_id, row_id=row_id, user_id=user.id
    ).exists()


def is_row_creator(user, table_id, row_id):
    if not is_personal_table(table_id):
        return True
    return LinxRowPrincipal.objects.filter(
        table_id=table_id,
        row_id=row_id,
        user_id=user.id,
        relation="creator",
    ).exists()


def enforce_rows(user, table, row_ids, operation_name):
    if not row_ids or not is_personal_table(table.id):
        return
    accessible = set(
        LinxRowPrincipal.objects.filter(
            table_id=table.id, row_id__in=row_ids, user_id=user.id
        ).values_list("row_id", flat=True)
    )
    if any(row_id not in accessible for row_id in row_ids):
        raise PermissionDenied(actor=user)
    if operation_name in ROW_DELETE_OPERATIONS:
        created = set(
            LinxRowPrincipal.objects.filter(
                table_id=table.id,
                row_id__in=row_ids,
                user_id=user.id,
                relation="creator",
            ).values_list("row_id", flat=True)
        )
        if any(row_id not in created for row_id in row_ids):
            raise PermissionDenied(actor=user)
