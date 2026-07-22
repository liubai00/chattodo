from contextlib import nullcontext

from django.db import transaction
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.status import (
    HTTP_200_OK,
    HTTP_400_BAD_REQUEST,
    HTTP_401_UNAUTHORIZED,
    HTTP_403_FORBIDDEN,
    HTTP_404_NOT_FOUND,
    HTTP_410_GONE,
)
from rest_framework.views import APIView

from baserow.api.user.serializers import get_all_user_data_serialized
from baserow.contrib.database.api.rows.serializers import serialize_rows_for_response
from baserow.contrib.database.fields.actions import (
    CreateFieldActionType,
    DeleteFieldActionType,
    UpdateFieldActionType,
)
from baserow.contrib.database.fields.exceptions import FieldNotInTable
from baserow.contrib.database.fields.models import Field
from baserow.contrib.database.fields.registries import field_type_registry
from baserow.contrib.database.rows.actions import (
    CreateRowActionType,
    DeleteRowActionType,
    UpdateRowActionType,
)
from baserow.contrib.database.rows.exceptions import RowDoesNotExist
from baserow.contrib.database.rows.handler import RowHandler
from baserow.contrib.database.table.operations import (
    ListRowsDatabaseTableOperationType,
)
from baserow.contrib.database.views.exceptions import (
    ViewFilterNotSupported,
    ViewFilterTypeDoesNotExist,
    ViewFilterTypeNotAllowedForField,
    ViewGroupByFieldAlreadyExist,
    ViewGroupByFieldNotSupported,
    ViewGroupByNotSupported,
    ViewSortFieldAlreadyExist,
    ViewSortFieldNotSupported,
    ViewSortNotSupported,
)
from baserow.contrib.database.views.models import (
    GridView,
    ViewFilter,
    ViewGroupBy,
    ViewSort,
)
from baserow.contrib.database.views.handler import ViewHandler
from baserow.core.exceptions import PermissionDenied
from baserow.core.handler import CoreHandler
from baserow.core.user.utils import generate_session_tokens_for_user

from .access import is_row_creator
from .confirmation_context import confirmed_action
from .models import LinxIdentity
from .mutation_context import mutation_source
from .services import (
    ALLOWED_FIELD_TYPES,
    RESERVED_FIELD_NAMES,
    field_hidden_map,
    get_table_and_schema,
    provision_identity,
    serialize_field,
    serialize_schema,
)
from .signing import post_to_linx, verify_request


CONFIRMATION = "confirmed-by-linx"
CANONICAL_FIELD_ROLES = {
    "任务名称": "primary_field_id",
    "状态": "status_field_id",
    "截止日期": "due_field_id",
    "负责人": "assignee_field_id",
    "来源记录": "source_field_id",
}
VIEW_CONFIGURATION_ERRORS = (
    FieldNotInTable,
    ViewFilterNotSupported,
    ViewFilterTypeDoesNotExist,
    ViewFilterTypeNotAllowedForField,
    ViewGroupByFieldAlreadyExist,
    ViewGroupByFieldNotSupported,
    ViewGroupByNotSupported,
    ViewSortFieldAlreadyExist,
    ViewSortFieldNotSupported,
    ViewSortNotSupported,
)
ACTION_INPUT_ERRORS = (TypeError, ValueError) + VIEW_CONFIGURATION_ERRORS


def _error(message, status=HTTP_400_BAD_REQUEST, code="INVALID_ACTION"):
    return Response({"error": str(message), "code": code}, status=status)


def _iso(value):
    return value.isoformat() if value is not None else ""


def _specific_fields(table):
    return list(
        Field.objects.filter(table=table)
        .select_related("content_type")
        .order_by("order", "id")
    )


def _role_field_ids(schema):
    return {
        role_name: int(schema[key])
        for role_name, key in CANONICAL_FIELD_ROLES.items()
        if schema.get(key)
    }


def _serialize_row(row, table, space, schema, user):
    model = row.__class__
    raw = dict(serialize_rows_for_response([row], model)[0])
    values = {}
    fields = _specific_fields(table)
    for field in fields:
        values[field.name] = raw.get(field.db_column)

    # These stable aliases let LinX keep working if users rename a default dynamic
    # field. The actual field names are returned as well for schema-aware callers.
    by_id = {field.id: field for field in fields}
    for canonical_name, field_id in _role_field_ids(schema).items():
        field = by_id.get(field_id)
        if field is not None:
            values[canonical_name] = raw.get(field.db_column)

    return {
        "ref": {"space": space, "tableId": table.id, "rowId": row.id},
        "values": values,
        "createdAt": _iso(getattr(row, "created_on", None)),
        "updatedAt": _iso(getattr(row, "updated_on", None)),
        "access": (
            "owner"
            if space == "team" or is_row_creator(user, table.id, row.id)
            else "collaborator"
        ),
    }


def _validate_space(config, action):
    space = action.get("space")
    ref = action.get("ref")
    if isinstance(ref, dict):
        space = ref.get("space")
    if space not in ("team", "personal"):
        raise ValueError("space must be team or personal")
    table, schema = get_table_and_schema(config, space)
    if isinstance(ref, dict):
        try:
            if int(ref.get("tableId")) != table.id:
                raise ValueError("TaskRef table does not match its space")
        except (TypeError, ValueError):
            raise ValueError("TaskRef tableId is invalid")
    return space, table, schema


def _resolve_collaborators(value, config):
    if value is None or value == "":
        return []
    values = value if isinstance(value, (list, tuple, set)) else [value]
    resolved = []
    workspace_users = config.workspace.workspaceuser_set.select_related("user")
    for candidate in values:
        if isinstance(candidate, int):
            resolved.append(candidate)
            continue
        if isinstance(candidate, dict):
            candidate = candidate.get("id") or candidate.get("linxUserId") or candidate.get("name")
        text = str(candidate or "").strip()
        if not text:
            continue
        if text.isdigit() and workspace_users.filter(user_id=int(text)).exists():
            resolved.append(int(text))
            continue
        identity = LinxIdentity.objects.filter(linx_user_id=text).first()
        if identity and workspace_users.filter(user_id=identity.user_id).exists():
            resolved.append(identity.user_id)
            continue
        matches = workspace_users.filter(user__first_name=text)
        if matches.count() != 1:
            raise ValueError(f"无法唯一识别负责人：{text}")
        resolved.append(matches.first().user_id)
    return sorted(set(resolved))


def _map_row_values(values, table, schema, config):
    if not isinstance(values, dict):
        raise ValueError("values must be an object")
    fields = _specific_fields(table)
    by_name = {field.name: field for field in fields}
    by_id = {field.id: field for field in fields}
    for canonical_name, field_id in _role_field_ids(schema).items():
        if field_id in by_id:
            by_name[canonical_name] = by_id[field_id]
    source_id = schema.get("source_field_id")
    mapped = {}
    for key, value in values.items():
        field = by_name.get(str(key))
        if field is None:
            role_key = CANONICAL_FIELD_ROLES.get(str(key))
            # Default dynamic columns are intentionally deletable. LinX's legacy
            # task adapter can keep sending their stable alias; once deleted, that
            # value simply has nowhere to be stored and must not block title CRUD.
            if role_key and role_key not in ("primary_field_id", "source_field_id"):
                if not schema.get(role_key):
                    continue
            raise ValueError(f"字段不存在：{key}")
        if field.id == source_id or field.read_only:
            raise PermissionDenied(actor=None)
        field_type = field_type_registry.get_by_model(field.specific).type
        if field_type == "multiple_collaborators":
            value = _resolve_collaborators(value, config)
        mapped[field.db_column] = value
    return mapped


def _field_options(field_type, raw):
    raw = raw if isinstance(raw, dict) else {}
    if field_type in ("single_select", "multiple_select"):
        select_options = raw.get("select_options", raw.get("selectOptions", []))
        if not isinstance(select_options, list):
            raise ValueError("selectOptions must be an array")
        return {
            "select_options": [
                {
                    key: option[key]
                    for key in ("id", "value", "color")
                    if isinstance(option, dict) and key in option
                }
                for option in select_options
                if isinstance(option, dict) and str(option.get("value", "")).strip()
            ]
        }
    if field_type == "number":
        allowed = ("number_decimal_places", "number_negative")
    elif field_type == "date":
        allowed = (
            "date_format",
            "date_include_time",
            "date_time_format",
            "date_show_tzinfo",
        )
    elif field_type == "multiple_collaborators":
        return {"notify_user_when_added": False}
    else:
        allowed = ()
    return {key: raw[key] for key in allowed if key in raw}


def _serialize_view(view):
    return {
        "id": view.id,
        "filterType": view.filter_type,
        "filtersDisabled": bool(view.filters_disabled),
        "filters": [
            {
                "id": item.id,
                "fieldId": item.field_id,
                "type": item.type,
                "value": item.value,
            }
            for item in ViewFilter.objects.filter(view=view).order_by("id")
        ],
        "sorts": [
            {
                "id": item.id,
                "fieldId": item.field_id,
                "order": item.order,
                "type": item.type,
            }
            for item in ViewSort.objects.filter(view=view).order_by("priority", "id")
        ],
        "groupBys": [
            {
                "id": item.id,
                "fieldId": item.field_id,
                "order": item.order,
                "type": item.type,
                "width": item.width,
            }
            for item in ViewGroupBy.objects.filter(view=view).order_by(
                "priority", "id"
            )
        ],
    }


def _view_items(patch, key):
    items = patch.get(key)
    if not isinstance(items, list):
        raise ValueError(f"{key} must be an array")
    if len(items) > 20:
        raise ValueError(f"{key} supports at most 20 items")
    if any(not isinstance(item, dict) for item in items):
        raise ValueError(f"{key} entries must be objects")
    field_ids = [int(item.get("fieldId") or 0) for item in items]
    if any(field_id <= 0 for field_id in field_ids):
        raise ValueError(f"{key} fieldId is invalid")
    if len(set(field_ids)) != len(field_ids):
        raise ValueError(f"{key} cannot contain the same field twice")
    return items


def _view_field(table, raw_field_id):
    field_id = int(raw_field_id or 0)
    if field_id <= 0:
        raise ValueError("fieldId is invalid")
    return Field.objects.select_related("content_type").get(
        id=field_id, table=table
    ).specific


def _sort_order(value):
    order = str(value or "ASC").upper()
    if order not in ("ASC", "DESC"):
        raise ValueError("order must be ASC or DESC")
    return order


def _replace_view_configuration(user, table, view, patch):
    handler = ViewHandler()
    view_patch = {}
    if "filterType" in patch:
        filter_type = str(patch.get("filterType") or "").upper()
        if filter_type not in ("AND", "OR"):
            raise ValueError("filterType must be AND or OR")
        view_patch["filter_type"] = filter_type
    if "filtersDisabled" in patch:
        view_patch["filters_disabled"] = bool(patch["filtersDisabled"])
    if view_patch:
        handler.update_view(user, view, **view_patch)

    if "filters" in patch:
        items = _view_items(patch, "filters")
        for existing in list(ViewFilter.objects.filter(view=view)):
            handler.delete_filter(user, existing)
        for item in items:
            handler.create_filter(
                user,
                view,
                _view_field(table, item.get("fieldId")),
                str(item.get("type") or "equal"),
                str(item.get("value") or ""),
            )

    if "sorts" in patch:
        items = _view_items(patch, "sorts")
        for existing in list(ViewSort.objects.filter(view=view)):
            handler.delete_sort(user, existing)
        for item in items:
            handler.create_sort(
                user,
                view,
                _view_field(table, item.get("fieldId")),
                _sort_order(item.get("order")),
                sort_type=str(item.get("type") or "default"),
            )

    if "groupBys" in patch:
        items = _view_items(patch, "groupBys")
        for existing in list(ViewGroupBy.objects.filter(view=view)):
            handler.delete_group_by(user, existing)
        for item in items:
            handler.create_group_by(
                user,
                view,
                _view_field(table, item.get("fieldId")),
                _sort_order(item.get("order")),
                max(80, min(1000, int(item.get("width") or 200))),
                sort_type=str(item.get("type") or "default"),
            )

    view.refresh_from_db()
    return _serialize_view(view)


def _row_id(action):
    ref = action.get("ref")
    if not isinstance(ref, dict):
        raise ValueError("ref is required")
    try:
        value = int(ref.get("rowId"))
    except (TypeError, ValueError):
        raise ValueError("TaskRef rowId is invalid")
    if value <= 0:
        raise ValueError("TaskRef rowId is invalid")
    return value


class LinxHealthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response(
            {"ok": True, "plugin": "linx_baserow", "baserow": "2.3.2"},
            status=HTTP_200_OK,
        )


class LinxSessionExchangeView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        ticket = str(request.data.get("ticket") or "")
        if not ticket:
            return _error("ticket is required")
        status, payload = post_to_linx(
            "/api/internal/baserow/exchange", {"ticket": ticket}
        )
        if status != HTTP_200_OK:
            response_status = HTTP_410_GONE if status == HTTP_410_GONE else HTTP_401_UNAUTHORIZED
            return _error(
                payload.get("error", "session exchange failed"),
                response_status,
                payload.get("code", "SESSION_EXCHANGE_FAILED"),
            )
        actor = payload.get("user")
        if not isinstance(actor, dict):
            return _error("invalid LinX identity response", HTTP_401_UNAUTHORIZED)
        user, config = provision_identity(actor, payload.get("teamKey"))
        space = payload.get("targetSpace")
        if space not in ("team", "personal"):
            space = "team"
        table, table_schema = get_table_and_schema(config, space)
        data = {
            **generate_session_tokens_for_user(user, include_refresh_token=True),
            **get_all_user_data_serialized(user, request),
            "target": {
                "space": space,
                "databaseId": config.database_id,
                "tableId": table.id,
                "viewId": table_schema.get("view_id"),
            },
        }
        return Response(data, status=HTTP_200_OK)


class LinxActionView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        if not verify_request(request, "/api/linx/v1/actions/"):
            return _error("invalid service signature", HTTP_401_UNAUTHORIZED, "INVALID_SIGNATURE")
        envelope = request.data
        actor = envelope.get("actor") if isinstance(envelope, dict) else None
        action = envelope.get("action") if isinstance(envelope, dict) else None
        if not isinstance(actor, dict) or not actor.get("id") or not isinstance(action, dict):
            return _error("actor and action are required")
        try:
            user, config = provision_identity(actor)
            result = self._dispatch(user, config, action)
            return Response({"result": result}, status=HTTP_200_OK)
        except PermissionDenied:
            return _error("没有执行该操作的权限", HTTP_403_FORBIDDEN, "PERMISSION_DENIED")
        except RowDoesNotExist:
            return _error("任务不存在", HTTP_404_NOT_FOUND, "ROW_NOT_FOUND")
        except (Field.DoesNotExist, GridView.DoesNotExist):
            return _error("字段或视图不存在", HTTP_404_NOT_FOUND, "RESOURCE_NOT_FOUND")
        except ACTION_INPUT_ERRORS as error:
            return _error(error)

    @transaction.atomic
    def _dispatch(self, user, config, action):
        action_type = action.get("type")
        if action_type == "schema.get":
            return serialize_schema(config)

        space, table, schema = _validate_space(config, action)
        model = table.get_model()

        if action_type in ("view.get", "view.update"):
            view = GridView.objects.get(id=schema.get("view_id"), table=table)
            if action_type == "view.get":
                return _serialize_view(view)
            patch = action.get("patch")
            if not isinstance(patch, dict):
                raise ValueError("patch is required")
            allowed = {
                "filterType",
                "filtersDisabled",
                "filters",
                "sorts",
                "groupBys",
            }
            if any(key not in allowed for key in patch):
                raise ValueError("view patch contains unsupported properties")
            return _replace_view_configuration(user, table, view, patch)

        if action_type == "row.list":
            CoreHandler().check_permissions(
                user,
                ListRowsDatabaseTableOperationType.type,
                workspace=table.database.workspace,
                context=table,
            )
            queryset = model.objects.all().enhance_by_fields().order_by("-created_on", "-id")
            queryset = CoreHandler().filter_queryset(
                user,
                ListRowsDatabaseTableOperationType.type,
                queryset,
                workspace=table.database.workspace,
            )
            return [
                _serialize_row(row, table, space, schema, user)
                for row in queryset[:1000]
            ]

        if action_type == "row.get":
            row = RowHandler().get_row(
                user, table, _row_id(action), model=model
            )
            return _serialize_row(row, table, space, schema, user)

        if action_type == "row.create":
            values = _map_row_values(action.get("values", {}), table, schema, config)
            with mutation_source(action.get("source")):
                row = CreateRowActionType.do(user, table, values=values, model=model)
            row = model.objects.all().enhance_by_fields().get(id=row.id)
            return _serialize_row(row, table, space, schema, user)

        if action_type == "row.update":
            values = _map_row_values(action.get("values", {}), table, schema, config)
            with mutation_source(action.get("source")):
                row = UpdateRowActionType.do(
                    user, table, _row_id(action), values=values, model=model
                )
            row = model.objects.all().enhance_by_fields().get(id=row.id)
            return _serialize_row(row, table, space, schema, user)

        if action_type == "row.delete":
            if action.get("confirmation") != CONFIRMATION:
                raise ValueError("删除任务前必须确认")
            with confirmed_action("row.delete"):
                with mutation_source(action.get("source")):
                    DeleteRowActionType.do(user, table, _row_id(action), model=model)
            return True

        if action_type == "field.create":
            data = action.get("field")
            if not isinstance(data, dict):
                raise ValueError("field is required")
            name = str(data.get("name") or "").strip()
            field_type = str(data.get("type") or "")
            if not name or name in RESERVED_FIELD_NAMES:
                raise ValueError("字段名称无效或已保留")
            if field_type not in ALLOWED_FIELD_TYPES:
                raise ValueError("首版不支持这种字段类型")
            field = CreateFieldActionType.do(
                user,
                table,
                field_type,
                name=name[:255],
                **_field_options(field_type, data.get("options")),
            )
            hidden = bool((data.get("options") or {}).get("hidden", False))
            if hidden:
                view = GridView.objects.get(id=schema.get("view_id"), table=table)
                ViewHandler().update_field_options(
                    view, {field.id: {"hidden": True}}, user=user
                )
            return serialize_field(field, hidden)

        if action_type in ("field.update", "field.delete"):
            field_id = int(action.get("fieldId") or 0)
            field = Field.objects.select_related("table", "content_type").get(
                id=field_id, table=table
            ).specific
            if field.id in {
                schema.get("primary_field_id"),
                schema.get("source_field_id"),
            }:
                raise PermissionDenied(actor=user)

            if action_type == "field.delete":
                if action.get("confirmation") != CONFIRMATION:
                    raise ValueError("删除字段前必须确认")
                with confirmed_action("field.delete"):
                    DeleteFieldActionType.do(user, field)
                return True

            patch = action.get("patch")
            if not isinstance(patch, dict):
                raise ValueError("patch is required")
            new_type = patch.get("type")
            old_type = field_type_registry.get_by_model(field).type
            if new_type is not None:
                new_type = str(new_type)
                if new_type not in ALLOWED_FIELD_TYPES:
                    raise ValueError("首版不支持这种字段类型")
                if new_type != old_type and action.get("confirmation") != CONFIRMATION:
                    raise ValueError("改变字段类型前必须确认")
            kwargs = {}
            if "name" in patch:
                name = str(patch.get("name") or "").strip()
                if not name or name in RESERVED_FIELD_NAMES:
                    raise ValueError("字段名称无效或已保留")
                kwargs["name"] = name[:255]
            if "options" in patch:
                kwargs.update(_field_options(new_type or old_type, patch.get("options")))
            if new_type is not None or kwargs:
                confirmation = (
                    confirmed_action("field.type_change")
                    if new_type is not None and new_type != old_type
                    else nullcontext()
                )
                with confirmation:
                    field, _ = UpdateFieldActionType.do(
                        user, field, new_type_name=new_type, **kwargs
                    )
            hidden_map = {}
            if "hidden" in patch:
                hidden_map["hidden"] = bool(patch["hidden"])
            if "order" in patch:
                hidden_map["order"] = int(patch["order"])
            if "width" in patch:
                hidden_map["width"] = max(60, min(1000, int(patch["width"])))
            if hidden_map:
                view = GridView.objects.get(id=schema.get("view_id"), table=table)
                ViewHandler().update_field_options(
                    view, {field.id: hidden_map}, user=user
                )
            hidden = bool(field_hidden_map(table).get(field.id, False))
            return serialize_field(field, hidden)

        raise ValueError(f"unsupported action: {action_type}")
