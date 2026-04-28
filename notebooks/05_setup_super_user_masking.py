# Databricks notebook source
# MAGIC %md
# MAGIC # 05 - Set up super-user masking on m_* tables
# MAGIC
# MAGIC This notebook creates **dynamic column-mask UDFs** and applies them to the
# MAGIC sensitive columns of the materialized `m_*` tables created by notebook 04.
# MAGIC
# MAGIC **Behaviour:**
# MAGIC - Members of the *super-user* account group (e.g. AI council, governance
# MAGIC   leads) see the **raw, unmasked** value.
# MAGIC - All other viewers see a **masked** value (email -> `u***@domain`,
# MAGIC   IP -> `10.x.x.x`, free-text -> `[redacted]`).
# MAGIC
# MAGIC The mask is enforced at query time by Unity Catalog's `MASK` clause, so
# MAGIC the underlying Delta files themselves stay intact — perfect for the
# MAGIC governance demo where you want to show the same dashboards reacting to
# MAGIC who is signed in.
# MAGIC
# MAGIC **Prerequisites:**
# MAGIC 1. Notebook `01_setup_governance_views.py` and `04_materialize_app_tables.py`
# MAGIC    have been run successfully.
# MAGIC 2. The super-user account group already exists in the Account Console
# MAGIC    (Settings > Identity > Groups) and has been added to this workspace.
# MAGIC 3. Your principal has `CREATE FUNCTION` and `MODIFY` on the schema, plus
# MAGIC    `MANAGE` on each `m_*` table.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration
# MAGIC Set the catalog/schema (must match notebook 04) and the super-user group
# MAGIC name.  The default group name `<brand>_ai_gov_super_users` keeps things
# MAGIC tidy across multiple deployments in the same account.

# COMMAND ----------

dbutils.widgets.text("catalog", "", "Unity Catalog Name")
dbutils.widgets.text("schema", "ai_governance", "Schema Name")
dbutils.widgets.text(
    "super_user_group",
    "ai_gov_super_users",
    "Super-user account group (members bypass masking)",
)
dbutils.widgets.text(
    "email_domain",
    "example.com",
    "Customer email domain (used in mask suffix)",
)

CATALOG = dbutils.widgets.get("catalog")
SCHEMA = dbutils.widgets.get("schema")
GROUP = dbutils.widgets.get("super_user_group")
EMAIL_DOMAIN = dbutils.widgets.get("email_domain")
CATALOG_SCHEMA = f"{CATALOG}.{SCHEMA}"

assert CATALOG, "Please set the 'catalog' widget to your Unity Catalog name"
assert GROUP, "Please set the 'super_user_group' widget"

print(f"Using: {CATALOG_SCHEMA}")
print(f"Super-user group: {GROUP}")
print(f"Default email domain: {EMAIL_DOMAIN}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 1 — Create the three mask UDFs
# MAGIC We create three reusable masking functions in the same schema as the
# MAGIC `m_*` tables.  Each one returns the original value for members of the
# MAGIC super-user group and a masked value for everyone else.

# COMMAND ----------

# Email mask — keep first char + redact local part, keep domain
spark.sql(
    f"""
CREATE OR REPLACE FUNCTION {CATALOG_SCHEMA}.mask_email(raw STRING)
RETURNS STRING
RETURN CASE
  WHEN is_account_group_member('{GROUP}') THEN raw
  WHEN raw IS NULL OR raw = '' THEN raw
  WHEN instr(raw, '@') > 1 THEN
    concat(
      substring(raw, 1, 1),
      '***@',
      split(raw, '@')[1]
    )
  ELSE '***'
END
COMMENT 'Returns the raw email for super-users; masks the local part for everyone else.';
"""
)

# IP mask — preserve first octet, redact the rest
spark.sql(
    f"""
CREATE OR REPLACE FUNCTION {CATALOG_SCHEMA}.mask_ip(raw STRING)
RETURNS STRING
RETURN CASE
  WHEN is_account_group_member('{GROUP}') THEN raw
  WHEN raw IS NULL OR raw = '' THEN raw
  WHEN regexp_count(raw, '\\\\.') >= 3 THEN
    concat(split(raw, '\\\\.')[0], '.x.x.x')
  ELSE 'x.x.x.x'
END
COMMENT 'Returns the raw IP for super-users; preserves first octet only for everyone else.';
"""
)

# Generic free-text mask — full redaction
spark.sql(
    f"""
CREATE OR REPLACE FUNCTION {CATALOG_SCHEMA}.mask_text(raw STRING)
RETURNS STRING
RETURN CASE
  WHEN is_account_group_member('{GROUP}') THEN raw
  WHEN raw IS NULL OR raw = '' THEN raw
  ELSE '[redacted]'
END
COMMENT 'Returns the raw string for super-users; full redaction for everyone else.';
"""
)

print(
    f"Created {CATALOG_SCHEMA}.mask_email, {CATALOG_SCHEMA}.mask_ip, "
    f"{CATALOG_SCHEMA}.mask_text"
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 2 — Apply column masks to `m_*` tables
# MAGIC Each tuple is `(table, column, mask_function)`.  Run idempotent ALTERs
# MAGIC so re-running this notebook simply overwrites the existing mask binding.

# COMMAND ----------

mask_bindings = [
    # m_ai_access_audit: user email + source IP
    ("m_ai_access_audit",       "user_email",         "mask_email"),
    ("m_ai_access_audit",       "source_ip_address",  "mask_ip"),
    # m_serving_endpoint_daily: who called the endpoint
    ("m_serving_endpoint_daily", "requester",          "mask_email"),
    # m_ai_gateway_daily: who called the gateway
    ("m_ai_gateway_daily",       "requester",          "mask_email"),
    # m_query_optimization: who ran the query (table-level, no IP here)
    ("m_query_optimization",     "executed_by",        "mask_email"),
    # m_expensive_queries: query text + executor
    ("m_expensive_queries",      "executed_by",        "mask_email"),
    ("m_expensive_queries",      "statement_preview",  "mask_text"),
    # m_assistant_genie_usage: who initiated the Genie session
    ("m_assistant_genie_usage",  "initiated_by",       "mask_email"),
    # m_mlflow_quality_daily: experiment owner
    ("m_mlflow_quality_daily",   "created_by",         "mask_email"),
    # m_underutilized_endpoints: endpoint creator
    ("m_underutilized_endpoints", "created_by",        "mask_email"),
]

skipped = []
applied = []
for table, column, fn in mask_bindings:
    full_table = f"{CATALOG_SCHEMA}.{table}"
    full_fn = f"{CATALOG_SCHEMA}.{fn}"
    try:
        # Drop any existing mask first so the SET is always re-applied with
        # the latest UDF body (in case `mask_email`/`mask_ip` was redefined
        # earlier in this notebook).
        spark.sql(f"ALTER TABLE {full_table} ALTER COLUMN {column} DROP MASK")
    except Exception:
        # No prior mask — that's fine.
        pass
    try:
        spark.sql(
            f"ALTER TABLE {full_table} ALTER COLUMN {column} SET MASK {full_fn}"
        )
        applied.append(f"{full_table}.{column}  ->  {full_fn}")
    except Exception as e:
        skipped.append(f"{full_table}.{column}  ({e})")

print("Applied masks:")
for line in applied:
    print(f"  + {line}")
if skipped:
    print("\nSkipped (table or column missing — re-run notebook 04 first):")
    for line in skipped:
        print(f"  - {line}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Step 3 — Verify
# MAGIC Quick sanity query.  As a super-user you should see real emails / IPs;
# MAGIC as anyone else, you should see masked values.

# COMMAND ----------

verify_sql = f"""
SELECT
  user_email,
  source_ip_address,
  is_account_group_member('{GROUP}') AS is_super_user
FROM {CATALOG_SCHEMA}.m_ai_access_audit
LIMIT 5
"""
print(verify_sql)
display(spark.sql(verify_sql))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Done
# MAGIC From this point on, anyone querying the masked columns through the
# MAGIC AI Governance app's SQL Warehouse will get a per-viewer view of the
# MAGIC data: super-users see raw values, everyone else sees masked values.
# MAGIC
# MAGIC To reverse: run
# MAGIC ```sql
# MAGIC ALTER TABLE <table> ALTER COLUMN <col> DROP MASK;
# MAGIC ```
# MAGIC for each binding above.  Drop the UDFs themselves with
# MAGIC `DROP FUNCTION {CATALOG_SCHEMA}.mask_email;` etc.
