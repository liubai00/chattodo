import uuid

from django.db import transaction
from django.dispatch import receiver
from django.utils import timezone

from baserow.contrib.database.api.rows.serializers import serialize_rows_for_response
from baserow.contrib.database.fields.models import Field
from baserow.contrib.database.fields.registries import field_type_registry
from baserow.contrib.database.fields.signals import (
    field_created,
    field_deleted,
    field_restored,
    field_updated,
)
from baserow.contrib.database.rows.signals import (
    before_rows_delete,
    before_rows_update,
    rows_created,
    rows_deleted,
    rows_updated,
)
from baserow.core.exceptions import PermissionDenied
from baserow.ws.tasks import broadcast_to_users

from .access import has_row_access, is_row_creator
from .confirmation_context import is_confirmed
from .models import LinxAuditEntry, LinxIdentity, LinxRowPrincipal
from .mutation_context import current_mutation_source
from .services import config_for_table, is_personal_table, table_space
from .tasks import send_linx_event


DEFAULT_DYNAMIC_ROLES = {
    "状态": ("status_field_id", "single_select"),
    "截止日期": ("due_field_id", "date"),
    "负责人": ("assignee_field_id", "multiple_collaborators"),
}


def _serialized(rows, model):
    return [dict(row) for row in serialize_rows_for_response(rows, model)]


def _schema(config, table_id):
    return config.schema.get(table_space(config, table_id), {})


def _source_field(config, table_id):
    field_id = _schema(config, table_id).get("source_field_id")
    if not field_id:
        return None
    return Field.objects.filter(id=field_id, table_id=table_id).first()


def _assignee_ids(row, config, table_id):
    field_id = _schema(config, table_id).get("assignee_field_id")
    if not field_id:
        return []
    value = getattr(row, f"field_{field_id}", None)
    try:
        return list(value.all().values_list("id", flat=True))
    except AttributeError:
        return []


def _task_title(row, config):
    field_id = _schema(config, row.baserow_table_id).get("primary_field_id")
    value = getattr(row, f"field_{field_id}", "") if field_id else ""
    return str(value or "未命名任务")[:500]


def _enqueue_assignment_event(row, user, config, assignee_ids):
    internal_ids = set(assignee_ids)
    internal_ids.discard(user.id)
    if not internal_ids:
        return
    recipients = list(
        LinxIdentity.objects.filter(user_id__in=internal_ids).values_list(
            "linx_user_id", flat=True
        )
    )
    if not recipients:
        return
    event = {
        "type": "task.assigned",
        "eventId": uuid.uuid4().hex,
        "recipients": recipients,
        "actorName": str(getattr(user, "first_name", "") or "有人")[:150],
        "task": {
            "ref": (
                f"brw:{table_space(config, row.baserow_table_id)}:"
                f"{row.baserow_table_id}:{row.id}"
            ),
            "title": _task_title(row, config),
        },
    }
    transaction.on_commit(lambda payload=event: send_linx_event.delay(payload))


def _broadcast_revoked_principals(table_id, revoked_pairs):
    by_user = {}
    for row_id, user_id in revoked_pairs:
        by_user.setdefault(user_id, []).append(row_id)
    for user_id, row_ids in by_user.items():
        ordered = sorted(set(row_ids))
        payload = {
            "type": "rows_deleted",
            "table_id": table_id,
            "row_ids": ordered,
            "rows": [{"id": row_id} for row_id in ordered],
        }
        transaction.on_commit(
            lambda uid=user_id, event=payload: broadcast_to_users.delay(
                [uid], event, None
            )
        )


def _rebuild_assignee_principals(config, table, include_field_values):
    """Recompute personal-row access after an assignee schema change."""

    if config.personal_table_id != table.id:
        return
    previous = set(
        LinxRowPrincipal.objects.filter(
            table_id=table.id, relation="assignee"
        ).values_list("row_id", "user_id")
    )
    LinxRowPrincipal.objects.filter(
        table_id=table.id, relation="assignee"
    ).delete()
    if include_field_values:
        creators = set(
            LinxRowPrincipal.objects.filter(
                table_id=table.id, relation="creator"
            ).values_list("row_id", "user_id")
        )
        model = table.get_model()
        principals = []
        for row in model.objects.all().iterator(chunk_size=200):
            for user_id in _assignee_ids(row, config, table.id):
                if (row.id, user_id) not in creators:
                    principals.append(
                        LinxRowPrincipal(
                            table_id=table.id,
                            row_id=row.id,
                            user_id=user_id,
                            relation="assignee",
                        )
                    )
        LinxRowPrincipal.objects.bulk_create(principals, ignore_conflicts=True)
    current = set(
        LinxRowPrincipal.objects.filter(
            table_id=table.id, relation="assignee"
        ).values_list("row_id", "user_id")
    )
    _broadcast_revoked_principals(table.id, previous - current)


def _sync_principals(row, user, config, created=False):
    if config.personal_table_id != row.baserow_table_id:
        return
    if created:
        LinxRowPrincipal.objects.get_or_create(
            table_id=row.baserow_table_id,
            row_id=row.id,
            user_id=user.id,
            relation="creator",
        )
    LinxRowPrincipal.objects.filter(
        table_id=row.baserow_table_id, row_id=row.id, relation="assignee"
    ).delete()
    creator_ids = set(
        LinxRowPrincipal.objects.filter(
            table_id=row.baserow_table_id, row_id=row.id, relation="creator"
        ).values_list("user_id", flat=True)
    )
    for user_id in _assignee_ids(row, config, row.baserow_table_id):
        if user_id not in creator_ids:
            LinxRowPrincipal.objects.get_or_create(
                table_id=row.baserow_table_id,
                row_id=row.id,
                user_id=user_id,
                relation="assignee",
            )


def _source_for_change(user, updated_field_ids, config, table_id, before, after):
    explicit = current_mutation_source()
    if explicit:
        return {
            "kind": explicit.get("kind", "system"),
            "text": str(explicit.get("text") or ""),
            "message_id": explicit.get("messageId"),
        }
    fields = {
        field.id: field.name
        for field in Field.objects.filter(id__in=updated_field_ids, table_id=table_id)
    }
    changes = []
    for field_id in updated_field_ids:
        name = fields.get(field_id, f"字段 {field_id}")
        key = f"field_{field_id}"
        old = before.get(key)
        new = after.get(key)
        if old != new:
            changes.append(f"{name}：{old!r} → {new!r}")
    text = f"{getattr(user, 'first_name', '') or '用户'} 修改了 " + (
        "；".join(changes) if changes else "任务排序"
    )
    return {"kind": "manual", "text": text, "message_id": None}


def _append_source_log(row, user, config, source):
    field = _source_field(config, row.baserow_table_id)
    if field is None or not source.get("text"):
        return
    column = field.db_column
    current = getattr(row, column, "") or ""
    actor_name = getattr(user, "first_name", "") if user else ""
    message_id = source.get("message_id")
    message_part = f"[消息 {message_id}]" if message_id else ""
    line = (
        f"[{timezone.now().isoformat()}][{source.get('kind', 'manual')}]"
        f"{message_part} {actor_name or 'LinX'}：{source['text']}"
    )
    next_value = (current + ("\n" if current else "") + line)[-200000:]
    setattr(row, column, next_value)
    row.__class__.objects.filter(id=row.id).update(**{column: next_value})


def _audit(row, user, source, before, after):
    LinxAuditEntry.objects.create(
        event_id=uuid.uuid4().hex,
        table_id=row.baserow_table_id,
        row_id=row.id,
        actor=user,
        source_kind=source.get("kind", "manual"),
        source_text=source.get("text", ""),
        message_id=source.get("message_id"),
        before=before or {},
        after=after or {},
    )


@receiver(before_rows_update)
def linx_before_rows_update(
    sender, rows, user, table, model, updated_field_ids, **kwargs
):
    config = config_for_table(table.id)
    if config is None:
        return None
    if is_personal_table(table.id):
        assignee_field_id = _schema(config, table.id).get("assignee_field_id")
        for row in rows:
            if not has_row_access(user, table.id, row.id):
                raise PermissionDenied(actor=user)
            if (
                assignee_field_id in updated_field_ids
                and not is_row_creator(user, table.id, row.id)
            ):
                raise PermissionDenied(actor=user)
    return {
        "rows": _serialized(rows, model),
        "principals": {
            row.id: list(
                LinxRowPrincipal.objects.filter(
                    table_id=table.id, row_id=row.id
                ).values_list("user_id", flat=True)
            )
            for row in rows
        },
        "assignees": {
            row.id: _assignee_ids(row, config, table.id) for row in rows
        },
    }


@receiver(before_rows_delete)
def linx_before_rows_delete(sender, rows, user, table, model, **kwargs):
    if config_for_table(table.id) is not None and not is_confirmed("row.delete"):
        raise PermissionDenied(actor=user)
    if not is_personal_table(table.id):
        return None
    for row in rows:
        if not is_row_creator(user, table.id, row.id):
            raise PermissionDenied(actor=user)
    return {"rows": _serialized(rows, model)}


@receiver(rows_created)
def linx_rows_created(sender, rows, user, table, model, **kwargs):
    config = config_for_table(table.id)
    if config is None or user is None:
        return
    after_rows = _serialized(rows, model)
    explicit = current_mutation_source()
    for row, after in zip(rows, after_rows):
        _sync_principals(row, user, config, created=True)
        source = (
            {
                "kind": explicit.get("kind", "system"),
                "text": str(explicit.get("text") or ""),
                "message_id": explicit.get("messageId"),
            }
            if explicit
            else {
                "kind": "manual",
                "text": f"{user.first_name or '用户'} 创建了任务",
                "message_id": None,
            }
        )
        _audit(row, user, source, {}, after)
        _append_source_log(row, user, config, source)
        _enqueue_assignment_event(
            row, user, config, _assignee_ids(row, config, table.id)
        )


@receiver(rows_updated)
def linx_rows_updated(
    sender,
    rows,
    user,
    table,
    model,
    before_return,
    updated_field_ids,
    **kwargs,
):
    config = config_for_table(table.id)
    if config is None or user is None:
        return
    before_payload = dict(before_return).get(linx_before_rows_update) or {
        "rows": [],
        "principals": {},
        "assignees": {},
    }
    before_by_id = {row.get("id"): row for row in before_payload["rows"]}
    after_rows = _serialized(rows, model)
    for row, after in zip(rows, after_rows):
        previous_principals = set(before_payload["principals"].get(row.id, []))
        _sync_principals(row, user, config)
        current_principals = set(
            LinxRowPrincipal.objects.filter(
                table_id=table.id, row_id=row.id
            ).values_list("user_id", flat=True)
        )
        before = before_by_id.get(row.id, {})
        source = _source_for_change(
            user, updated_field_ids, config, table.id, before, after
        )
        _audit(row, user, source, before, after)
        _append_source_log(row, user, config, source)

        previous_assignees = set(before_payload["assignees"].get(row.id, []))
        current_assignees = set(_assignee_ids(row, config, table.id))
        _enqueue_assignment_event(
            row, user, config, current_assignees - previous_assignees
        )

        removed = list(previous_principals - current_principals)
        if removed:
            payload = {
                "type": "rows_deleted",
                "table_id": table.id,
                "row_ids": [row.id],
                "rows": [before or {"id": row.id}],
            }
            transaction.on_commit(
                lambda ids=removed, event=payload: broadcast_to_users.delay(
                    ids, event, None
                )
            )


@receiver(rows_deleted)
def linx_rows_deleted(
    sender, rows, user, table, model, before_return=None, **kwargs
):
    config = config_for_table(table.id)
    if config is None or user is None:
        return
    previous = (
        dict(before_return).get(linx_before_rows_delete, {}).get("rows", [])
        if before_return
        else []
    )
    previous_by_id = {row.get("id"): row for row in previous}
    explicit = current_mutation_source()
    for row in rows:
        source = (
            {
                "kind": explicit.get("kind", "system"),
                "text": str(explicit.get("text") or ""),
                "message_id": explicit.get("messageId"),
            }
            if explicit
            else {
                "kind": "manual",
                "text": f"{user.first_name or '用户'} 删除了任务",
                "message_id": None,
            }
        )
        _audit(row, user, source, previous_by_id.get(row.id, {}), {})


@receiver(field_deleted)
def linx_dynamic_field_deleted(sender, field, **kwargs):
    config = config_for_table(field.table_id)
    if config is None:
        return
    space = table_space(config, field.table_id)
    schema = dict(config.schema)
    role_schema = dict(schema.get(space, {}))
    changed = False
    for role in ("status_field_id", "due_field_id", "assignee_field_id"):
        if role_schema.get(role) == field.id:
            if role == "assignee_field_id":
                _rebuild_assignee_principals(
                    config, field.table, include_field_values=False
                )
            role_schema[role] = None
            changed = True
    if changed:
        schema[space] = role_schema
        config.schema = schema
        config.save(update_fields=["schema", "updated_at"])


@receiver(field_created)
def linx_default_dynamic_field_recreated(sender, field, type_name, **kwargs):
    """Reconnect a default dynamic role when a user recreates its native column."""

    _connect_default_dynamic_role(field, type_name)


def _connect_default_dynamic_role(field, type_name):

    config = config_for_table(field.table_id)
    role = DEFAULT_DYNAMIC_ROLES.get(field.name)
    if config is None or role is None or role[1] != type_name:
        return None
    space = table_space(config, field.table_id)
    schema = dict(config.schema)
    role_schema = dict(schema.get(space, {}))
    if role_schema.get(role[0]):
        return None
    role_schema[role[0]] = field.id
    schema[space] = role_schema
    config.schema = schema
    config.save(update_fields=["schema", "updated_at"])
    return config, role[0]


@receiver(field_restored)
def linx_default_dynamic_field_restored(sender, field, **kwargs):
    type_name = field_type_registry.get_by_model(field.specific).type
    connected = _connect_default_dynamic_role(field, type_name)
    if connected and connected[1] == "assignee_field_id":
        _rebuild_assignee_principals(
            connected[0], field.table, include_field_values=True
        )


@receiver(field_updated)
def linx_assignee_field_type_updated(
    sender, field, field_type_changed=False, **kwargs
):
    if not field_type_changed:
        return
    config = config_for_table(field.table_id)
    if config is None:
        return
    space = table_space(config, field.table_id)
    if config.schema.get(space, {}).get("assignee_field_id") != field.id:
        return
    type_name = field_type_registry.get_by_model(field.specific).type
    _rebuild_assignee_principals(
        config,
        field.table,
        include_field_values=type_name == "multiple_collaborators",
    )
