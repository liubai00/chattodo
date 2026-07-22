from django.conf import settings
from django.db import models


class LinxIdentity(models.Model):
    linx_user_id = models.CharField(max_length=128, unique=True)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="linx_identity",
    )
    linx_role = models.CharField(max_length=32, default="member")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class LinxWorkspaceConfig(models.Model):
    team_key = models.CharField(max_length=128, unique=True)
    workspace = models.OneToOneField("core.Workspace", on_delete=models.PROTECT)
    database = models.OneToOneField("database.Database", on_delete=models.PROTECT)
    team_table = models.OneToOneField(
        "database.Table", on_delete=models.PROTECT, related_name="linx_team_config"
    )
    personal_table = models.OneToOneField(
        "database.Table", on_delete=models.PROTECT, related_name="linx_personal_config"
    )
    schema = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class LinxRowPrincipal(models.Model):
    RELATION_CHOICES = (("creator", "creator"), ("assignee", "assignee"))

    table_id = models.PositiveIntegerField(db_index=True)
    row_id = models.PositiveIntegerField(db_index=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    relation = models.CharField(max_length=16, choices=RELATION_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("table_id", "row_id", "user", "relation"),
                name="linx_unique_row_principal",
            )
        ]
        indexes = [models.Index(fields=("table_id", "user", "row_id"))]


class LinxAuditEntry(models.Model):
    event_id = models.CharField(max_length=64, unique=True)
    table_id = models.PositiveIntegerField(db_index=True)
    row_id = models.PositiveIntegerField(null=True, db_index=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL
    )
    source_kind = models.CharField(max_length=16)
    source_text = models.TextField(default="")
    message_id = models.CharField(max_length=128, null=True, blank=True)
    before = models.JSONField(default=dict)
    after = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=("table_id", "row_id", "created_at"))]


class LinxRequestNonce(models.Model):
    nonce = models.CharField(max_length=128, primary_key=True)
    expires_at = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
