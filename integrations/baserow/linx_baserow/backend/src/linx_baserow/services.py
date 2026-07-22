import hashlib

from django.contrib.auth import get_user_model
from django.db import transaction

from baserow.contrib.database.fields.handler import FieldHandler
from baserow.contrib.database.fields.models import Field
from baserow.contrib.database.table.handler import TableHandler
from baserow.contrib.database.views.handler import ViewHandler
from baserow.contrib.database.views.models import GridView, GridViewFieldOptions
from baserow.core.handler import CoreHandler
from baserow.core.models import (
    WORKSPACE_USER_PERMISSION_ADMIN,
    WORKSPACE_USER_PERMISSION_MEMBER,
    Settings,
    Workspace,
    WorkspaceUser,
)
from baserow.core.user.handler import UserHandler

from .models import LinxIdentity, LinxWorkspaceConfig


User = get_user_model()
TEAM_KEY = "linx-default-team"
ALLOWED_FIELD_TYPES = {
    "text",
    "long_text",
    "number",
    "boolean",
    "date",
    "single_select",
    "multiple_select",
    "multiple_collaborators",
}
RESERVED_FIELD_NAMES = {"任务名称", "来源记录"}


def is_linx_table(table_id):
    return LinxWorkspaceConfig.objects.filter(
        team_table_id=table_id
    ).exists() or LinxWorkspaceConfig.objects.filter(personal_table_id=table_id).exists()


def config_for_table(table_id):
    return LinxWorkspaceConfig.objects.filter(team_table_id=table_id).first() or LinxWorkspaceConfig.objects.filter(
        personal_table_id=table_id
    ).first()


def is_personal_table(table_id):
    return LinxWorkspaceConfig.objects.filter(personal_table_id=table_id).exists()


def table_space(config, table_id):
    return "personal" if config.personal_table_id == table_id else "team"


def _internal_email(linx_user_id):
    digest = hashlib.sha256(linx_user_id.encode("utf-8")).hexdigest()[:24]
    return f"linx+{digest}@users.invalid"


def _ensure_instance_locked_down():
    instance = CoreHandler().get_settings()
    changed = []
    for name, value in (
        ("allow_new_signups", False),
        ("allow_signups_via_workspace_invitations", False),
        ("allow_reset_password", False),
        ("allow_global_workspace_creation", False),
        ("show_admin_signup_page", False),
    ):
        if getattr(instance, name) != value:
            setattr(instance, name, value)
            changed.append(name)
    if changed:
        instance.save(update_fields=changed)


def provision_identity(actor, team_key=TEAM_KEY):
    """Idempotently map a LinX actor to an unusable-password Baserow user."""

    linx_id = str(actor["id"])
    with transaction.atomic():
        identity = (
            LinxIdentity.objects.select_for_update()
            .select_related("user")
            .filter(linx_user_id=linx_id)
            .first()
        )
        if identity is None:
            email = _internal_email(linx_id)
            user = User.objects.filter(username=email).first()
            if user is None:
                user = UserHandler().force_create_user(
                    email=email,
                    name=str(actor.get("name") or "LinX 用户")[:150],
                    password=None,
                    is_staff=False,
                )
                user.set_unusable_password()
                user.save(update_fields=["password"])
            identity = LinxIdentity.objects.create(
                linx_user_id=linx_id,
                user=user,
                linx_role=str(actor.get("role") or "member"),
            )
        else:
            user = identity.user
            desired_name = str(actor.get("name") or user.first_name)[:150]
            changed = []
            if user.first_name != desired_name:
                user.first_name = desired_name
                changed.append("first_name")
            if changed:
                user.save(update_fields=changed)
            role = str(actor.get("role") or "member")
            if identity.linx_role != role:
                identity.linx_role = role
                identity.save(update_fields=["linx_role", "updated_at"])

        profile = user.profile
        profile_changed = []
        if not profile.email_verified:
            profile.email_verified = True
            profile_changed.append("email_verified")
        if not profile.completed_onboarding:
            profile.completed_onboarding = True
            profile_changed.append("completed_onboarding")
        if profile_changed:
            profile.save(update_fields=profile_changed)

        config = _ensure_workspace(user, team_key)
        wanted_permission = (
            WORKSPACE_USER_PERMISSION_ADMIN
            if str(actor.get("role")) == "admin"
            else WORKSPACE_USER_PERMISSION_MEMBER
        )
        membership = CoreHandler().add_user_to_workspace(
            config.workspace, user, permissions=wanted_permission
        )
        if membership.permissions != wanted_permission:
            membership.permissions = wanted_permission
            membership.save(update_fields=["permissions"])
        _ensure_instance_locked_down()
        return user, config


def _create_task_table(user, database, name):
    table, _ = TableHandler().create_table(user, database, name=name, fill_example=False)
    primary = Field.objects.get(table=table, primary=True).specific
    primary = FieldHandler().update_field(
        user,
        primary,
        name="任务名称",
        immutable_type=True,
        immutable_properties=True,
    )
    status = FieldHandler().create_field(
        user,
        table,
        "single_select",
        name="状态",
        select_options=[
            {"value": "待办", "color": "blue"},
            {"value": "进行中", "color": "yellow"},
            {"value": "已完成", "color": "green"},
            {"value": "已归档", "color": "gray"},
        ],
    )
    first_option = status.select_options.order_by("order", "id").first()
    if first_option is not None:
        status = FieldHandler().update_field(
            user, status.specific, single_select_default=first_option.id
        )
    due = FieldHandler().create_field(user, table, "date", name="截止日期")
    assignee = FieldHandler().create_field(
        user,
        table,
        "multiple_collaborators",
        name="负责人",
        notify_user_when_added=False,
    )
    source = FieldHandler().create_field(
        user,
        table,
        "long_text",
        name="来源记录",
        read_only=True,
        immutable_type=True,
        immutable_properties=True,
    )
    view = GridView.objects.get(table=table)
    ViewHandler().update_field_options(
        view,
        {source.id: {"hidden": True, "width": 360}},
        user=user,
    )
    return table, {
        "view_id": view.id,
        "primary_field_id": primary.id,
        "status_field_id": status.id,
        "due_field_id": due.id,
        "assignee_field_id": assignee.id,
        "source_field_id": source.id,
    }


def _ensure_workspace(user, team_key):
    config = LinxWorkspaceConfig.objects.select_for_update().filter(team_key=team_key).first()
    if config is not None:
        return config

    workspace = Workspace.objects.create(name="LinX 团队")
    WorkspaceUser.objects.create(
        workspace=workspace,
        user=user,
        order=WorkspaceUser.get_last_order(user),
        permissions=WORKSPACE_USER_PERMISSION_ADMIN,
    )
    database = CoreHandler().create_application(
        user,
        workspace,
        type_name="database",
        name="Todo 数据库",
    ).specific
    team_table, team_schema = _create_task_table(user, database, "团队任务")
    personal_table, personal_schema = _create_task_table(user, database, "个人任务")
    return LinxWorkspaceConfig.objects.create(
        team_key=team_key,
        workspace=workspace,
        database=database,
        team_table=team_table,
        personal_table=personal_table,
        schema={"team": team_schema, "personal": personal_schema},
    )


def get_table_and_schema(config, space):
    if space == "personal":
        return config.personal_table, config.schema.get("personal", {})
    return config.team_table, config.schema.get("team", {})


def field_hidden_map(table):
    view = GridView.objects.filter(table=table).first()
    if view is None:
        return {}
    return dict(
        GridViewFieldOptions.objects.filter(grid_view=view).values_list(
            "field_id", "hidden"
        )
    )


def serialize_field(field, hidden=False):
    from baserow.contrib.database.fields.registries import field_type_registry

    specific = field.specific
    return {
        "id": field.id,
        "name": field.name,
        "type": field_type_registry.get_by_model(specific).type,
        "primary": field.primary,
        "readOnly": bool(field.read_only),
        "hidden": bool(hidden),
    }


def serialize_schema(config):
    tables = {}
    for space in ("team", "personal"):
        table, role_schema = get_table_and_schema(config, space)
        hidden = field_hidden_map(table)
        fields = list(Field.objects.filter(table=table).order_by("order", "id"))
        tables[space] = {
            "space": space,
            "databaseId": config.database_id,
            "tableId": table.id,
            "viewId": int(role_schema.get("view_id") or 0),
            "fields": [serialize_field(field, hidden.get(field.id, False)) for field in fields],
        }
    return {
        "workspaceId": config.workspace_id,
        "databaseId": config.database_id,
        "tables": tables,
    }
