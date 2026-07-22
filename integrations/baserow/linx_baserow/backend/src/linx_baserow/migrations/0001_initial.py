import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("core", "0114_alter_workspaceinvitation_message"),
        ("database", "0212_data_sync_delete_unmatched_rows"),
    ]

    operations = [
        migrations.CreateModel(
            name="LinxIdentity",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("linx_user_id", models.CharField(max_length=128, unique=True)),
                ("linx_role", models.CharField(default="member", max_length=32)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="linx_identity", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name="LinxWorkspaceConfig",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("team_key", models.CharField(max_length=128, unique=True)),
                ("schema", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("database", models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, to="database.database")),
                ("personal_table", models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name="linx_personal_config", to="database.table")),
                ("team_table", models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name="linx_team_config", to="database.table")),
                ("workspace", models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, to="core.workspace")),
            ],
        ),
        migrations.CreateModel(
            name="LinxRequestNonce",
            fields=[
                ("nonce", models.CharField(max_length=128, primary_key=True, serialize=False)),
                ("expires_at", models.DateTimeField(db_index=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.CreateModel(
            name="LinxRowPrincipal",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("table_id", models.PositiveIntegerField(db_index=True)),
                ("row_id", models.PositiveIntegerField(db_index=True)),
                ("relation", models.CharField(choices=[("creator", "creator"), ("assignee", "assignee")], max_length=16)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name="LinxAuditEntry",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("event_id", models.CharField(max_length=64, unique=True)),
                ("table_id", models.PositiveIntegerField(db_index=True)),
                ("row_id", models.PositiveIntegerField(db_index=True, null=True)),
                ("source_kind", models.CharField(max_length=16)),
                ("source_text", models.TextField(default="")),
                ("message_id", models.CharField(blank=True, max_length=128, null=True)),
                ("before", models.JSONField(default=dict)),
                ("after", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("actor", models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddConstraint(
            model_name="linxrowprincipal",
            constraint=models.UniqueConstraint(fields=("table_id", "row_id", "user", "relation"), name="linx_unique_row_principal"),
        ),
        migrations.AddIndex(
            model_name="linxrowprincipal",
            index=models.Index(fields=["table_id", "user", "row_id"], name="linx_baserow_table_i_436f6e_idx"),
        ),
        migrations.AddIndex(
            model_name="linxauditentry",
            index=models.Index(fields=["table_id", "row_id", "created_at"], name="linx_baserow_table_i_b92be2_idx"),
        ),
    ]
