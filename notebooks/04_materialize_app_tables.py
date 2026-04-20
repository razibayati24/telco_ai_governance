# Databricks notebook source
# MAGIC %md
# MAGIC # 04 - Materialize App Tables (m_* tables)
# MAGIC
# MAGIC This notebook creates the **materialized Delta tables** (`m_*`) that the AI Governance app reads from.
# MAGIC The app's `server/config.py` references these `m_*` tables (NOT the `v_*` views from notebook 01) for
# MAGIC sub-second dashboard performance. On a fresh workspace you **must** run this notebook after notebook 01.
# MAGIC
# MAGIC **What this creates (11 tables):**
# MAGIC - `m_serving_endpoint_daily`     — materialization of `v_serving_endpoint_daily` (30d)
# MAGIC - `m_ai_gateway_daily`           — materialization of `v_ai_gateway_daily` (30d)
# MAGIC - `m_ai_cost_daily`              — materialization of `v_ai_cost_daily` (30d)
# MAGIC - `m_assistant_genie_usage`      — materialization of `v_assistant_genie_usage` (30d)
# MAGIC - `m_underutilized_endpoints`    — materialization of `v_underutilized_endpoints` (snapshot)
# MAGIC - `m_ai_access_audit`            — materialization of `v_ai_access_audit` (30d)
# MAGIC - `m_cost_anomalies`             — derived from `m_ai_cost_daily` (7d rolling avg anomaly flag)
# MAGIC - `m_mlflow_quality_daily`       — from `system.mlflow.runs_latest` + `experiments_latest`
# MAGIC - `m_mlflow_metrics_daily`       — from `system.mlflow.run_metrics_history`
# MAGIC - `m_query_optimization`         — from `system.query.history` (daily aggregation)
# MAGIC - `m_expensive_queries`          — from `system.query.history` (top slow queries)
# MAGIC
# MAGIC **Refresh cadence:** Re-run this notebook daily (via Lakeflow Job) to keep the 30-day windows current.
# MAGIC
# MAGIC **Prerequisite:** notebook `01_setup_governance_views.py` has been run (creates the schema).

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration
# MAGIC Set your catalog and schema names. These must match the values you used in notebook 01.

# COMMAND ----------

dbutils.widgets.text("catalog", "", "Unity Catalog Name")
dbutils.widgets.text("schema", "ai_governance", "Schema Name")
dbutils.widgets.text("window_days", "30", "Rolling Window (days)")

CATALOG = dbutils.widgets.get("catalog")
SCHEMA = dbutils.widgets.get("schema")
WINDOW_DAYS = int(dbutils.widgets.get("window_days"))
CATALOG_SCHEMA = f"{CATALOG}.{SCHEMA}"

assert CATALOG, "Please set the 'catalog' widget to your Unity Catalog name"
print(f"Using: {CATALOG_SCHEMA}  (window = {WINDOW_DAYS} days)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure schema exists

# COMMAND ----------

spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG_SCHEMA}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Table 1: `m_serving_endpoint_daily`
# MAGIC 30-day daily aggregation of model serving endpoint usage.

# COMMAND ----------

spark.sql(f"""
CREATE OR REPLACE TABLE {CATALOG_SCHEMA}.m_serving_endpoint_daily AS
SELECT
  date_trunc('day', eu.request_time) AS request_date,
  se.endpoint_name,
  se.entity_type,
  se.entity_name,
  se.task,
  eu.requester,
  eu.status_code,
  COUNT(*) AS request_count,
  SUM(eu.input_token_count) AS total_input_tokens,
  SUM(eu.output_token_count) AS total_output_tokens,
  SUM(eu.input_token_count + eu.output_token_count) AS total_tokens,
  SUM(CASE WHEN eu.status_code >= 400 THEN 1 ELSE 0 END) AS error_count,
  ROUND(SUM(CASE WHEN eu.status_code >= 400 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS error_rate_pct
FROM system.serving.endpoint_usage eu
JOIN system.serving.served_entities se ON eu.served_entity_id = se.served_entity_id
WHERE eu.request_time >= current_date() - INTERVAL {WINDOW_DAYS} DAYS
GROUP BY ALL
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Table 2: `m_ai_gateway_daily`
# MAGIC 30-day daily aggregation of AI Gateway usage (model routing, latency, tokens).

# COMMAND ----------

spark.sql(f"""
CREATE OR REPLACE TABLE {CATALOG_SCHEMA}.m_ai_gateway_daily AS
SELECT
  date_trunc('day', event_time) AS request_date,
  endpoint_name,
  destination_type,
  destination_name,
  destination_model,
  requester,
  requester_type,
  api_type,
  status_code,
  COUNT(*) AS request_count,
  SUM(input_tokens) AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  SUM(total_tokens) AS total_tokens,
  AVG(latency_ms) AS avg_latency_ms,
  AVG(time_to_first_byte_ms) AS avg_ttfb_ms,
  SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS error_count
FROM system.ai_gateway.usage
WHERE event_time >= current_date() - INTERVAL {WINDOW_DAYS} DAYS
GROUP BY ALL
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Table 3: `m_ai_cost_daily`
# MAGIC 30-day AI-related billing SKUs grouped into logical cost categories.

# COMMAND ----------

spark.sql(f"""
CREATE OR REPLACE TABLE {CATALOG_SCHEMA}.m_ai_cost_daily AS
SELECT
  usage_date,
  sku_name,
  CASE
    WHEN sku_name LIKE '%ANTHROPIC%' THEN 'Anthropic Model Serving'
    WHEN sku_name LIKE '%OPENAI%' THEN 'OpenAI Model Serving'
    WHEN sku_name LIKE '%GEMINI%' THEN 'Gemini Model Serving'
    WHEN sku_name LIKE '%MODEL_TRAINING%' THEN 'Model Training'
    WHEN sku_name LIKE '%REAL_TIME_INFERENCE%' THEN 'Real-Time Inference'
    ELSE 'Other AI'
  END AS cost_category,
  SUM(usage_quantity) AS total_dbus
FROM system.billing.usage
WHERE usage_date >= current_date() - INTERVAL {WINDOW_DAYS} DAYS
  AND (sku_name LIKE '%ANTHROPIC%' OR sku_name LIKE '%OPENAI%' OR sku_name LIKE '%GEMINI%'
       OR sku_name LIKE '%MODEL_TRAINING%' OR sku_name LIKE '%REAL_TIME_INFERENCE%')
GROUP BY ALL
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Table 4: `m_assistant_genie_usage`
# MAGIC 30-day Genie room and AI Assistant activity.

# COMMAND ----------

spark.sql(f"""
CREATE OR REPLACE TABLE {CATALOG_SCHEMA}.m_assistant_genie_usage AS
SELECT
  date_trunc('day', event_time) AS event_date,
  initiated_by,
  user_agent,
  COUNT(*) AS event_count
FROM system.access.assistant_events
WHERE event_time >= current_date() - INTERVAL {WINDOW_DAYS} DAYS
GROUP BY ALL
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Table 5: `m_underutilized_endpoints`
# MAGIC Snapshot of all active endpoints with their 30-day utilization tier.

# COMMAND ----------

spark.sql(f"""
CREATE OR REPLACE TABLE {CATALOG_SCHEMA}.m_underutilized_endpoints AS
SELECT
  se.endpoint_name,
  se.entity_type,
  se.entity_name,
  se.task,
  se.created_by,
  se.change_time AS last_config_change,
  COALESCE(u.total_requests_30d, 0) AS total_requests_30d,
  COALESCE(u.total_tokens_30d, 0) AS total_tokens_30d,
  COALESCE(u.unique_users_30d, 0) AS unique_users_30d,
  u.last_request_time,
  CASE
    WHEN COALESCE(u.total_requests_30d, 0) = 0 THEN 'Idle'
    WHEN COALESCE(u.total_requests_30d, 0) < 100 THEN 'Very Low'
    WHEN COALESCE(u.total_requests_30d, 0) < 1000 THEN 'Low'
    WHEN COALESCE(u.total_requests_30d, 0) < 10000 THEN 'Moderate'
    ELSE 'Active'
  END AS utilization_tier
FROM system.serving.served_entities se
LEFT JOIN (
  SELECT served_entity_id,
         COUNT(*) AS total_requests_30d,
         SUM(input_token_count + output_token_count) AS total_tokens_30d,
         COUNT(DISTINCT requester) AS unique_users_30d,
         MAX(request_time) AS last_request_time
  FROM system.serving.endpoint_usage
  WHERE request_time >= current_date() - INTERVAL {WINDOW_DAYS} DAYS
  GROUP BY served_entity_id
) u ON se.served_entity_id = u.served_entity_id
WHERE se.endpoint_delete_time IS NULL
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Table 6: `m_ai_access_audit`
# MAGIC 30-day access audit events for AI services.

# COMMAND ----------

spark.sql(f"""
CREATE OR REPLACE TABLE {CATALOG_SCHEMA}.m_ai_access_audit AS
SELECT
  date_trunc('day', event_time) AS event_date,
  user_identity.email AS user_email,
  action_name,
  service_name,
  source_ip_address,
  response.status_code AS status_code,
  CASE WHEN response.status_code >= 400 THEN true ELSE false END AS is_denied,
  COUNT(*) AS event_count
FROM system.access.audit
WHERE service_name IN ('modelServing', 'mlflow', 'aiGateway', 'vectorSearch', 'aibi')
  AND event_time >= current_date() - INTERVAL {WINDOW_DAYS} DAYS
GROUP BY ALL
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Table 7: `m_cost_anomalies`
# MAGIC Derived from `m_ai_cost_daily`. Flags days where daily DBUs > 2x the 7-day rolling average
# MAGIC for a given cost category.

# COMMAND ----------

spark.sql(f"""
CREATE OR REPLACE TABLE {CATALOG_SCHEMA}.m_cost_anomalies AS
WITH daily AS (
  SELECT
    usage_date,
    cost_category,
    SUM(total_dbus) AS daily_dbus
  FROM {CATALOG_SCHEMA}.m_ai_cost_daily
  GROUP BY usage_date, cost_category
),
with_roll AS (
  SELECT
    usage_date,
    cost_category,
    daily_dbus,
    AVG(daily_dbus) OVER (
      PARTITION BY cost_category
      ORDER BY usage_date
      ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING
    ) AS rolling_avg_7d
  FROM daily
)
SELECT
  usage_date,
  cost_category,
  daily_dbus,
  rolling_avg_7d,
  CASE WHEN rolling_avg_7d IS NOT NULL AND rolling_avg_7d > 0
            AND daily_dbus > 2 * rolling_avg_7d THEN true
       ELSE false END AS is_anomaly,
  CAST(
    CASE WHEN rolling_avg_7d IS NOT NULL AND rolling_avg_7d > 0
         THEN ((daily_dbus - rolling_avg_7d) / rolling_avg_7d) * 100
         ELSE 0 END
    AS DECIMAL(34,1)
  ) AS pct_change
FROM with_roll
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Table 8: `m_mlflow_quality_daily`
# MAGIC Daily MLflow run aggregation by experiment + status. Sourced from `system.mlflow.runs_latest`
# MAGIC joined with `experiments_latest` for human-readable experiment names.

# COMMAND ----------

spark.sql(f"""
CREATE OR REPLACE TABLE {CATALOG_SCHEMA}.m_mlflow_quality_daily AS
SELECT
  date_trunc('day', r.start_time) AS run_date,
  COALESCE(e.name, r.experiment_id) AS experiment_name,
  r.experiment_id,
  r.created_by,
  r.status,
  COUNT(*) AS run_count,
  AVG(
    CASE WHEN r.end_time IS NOT NULL AND r.start_time IS NOT NULL
         THEN (unix_timestamp(r.end_time) - unix_timestamp(r.start_time))
         ELSE NULL END
  ) AS avg_duration_sec,
  SUM(CASE WHEN r.status = 'FINISHED' THEN 1 ELSE 0 END) AS succeeded,
  SUM(CASE WHEN r.status = 'FAILED'   THEN 1 ELSE 0 END) AS failed
FROM system.mlflow.runs_latest r
LEFT JOIN system.mlflow.experiments_latest e
  ON r.experiment_id = e.experiment_id
 AND r.workspace_id  = e.workspace_id
WHERE r.start_time >= current_date() - INTERVAL {WINDOW_DAYS} DAYS
  AND r.delete_time IS NULL
GROUP BY ALL
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Table 9: `m_mlflow_metrics_daily`
# MAGIC Daily per-metric stats (avg / min / max / p50 / stddev) from MLflow run metrics history.
# MAGIC Used by the Quality Evaluation tab for drift detection.

# COMMAND ----------

spark.sql(f"""
CREATE OR REPLACE TABLE {CATALOG_SCHEMA}.m_mlflow_metrics_daily AS
SELECT
  date_trunc('day', metric_time) AS metric_date,
  metric_name,
  COUNT(DISTINCT run_id) AS run_count,
  AVG(metric_value) AS avg_value,
  MIN(metric_value) AS min_value,
  MAX(metric_value) AS max_value,
  percentile_approx(metric_value, 0.5) AS p50_value,
  STDDEV(metric_value) AS stddev_value
FROM system.mlflow.run_metrics_history
WHERE metric_time >= current_date() - INTERVAL {WINDOW_DAYS} DAYS
  AND metric_value IS NOT NULL
GROUP BY ALL
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Table 10: `m_query_optimization`
# MAGIC Daily query aggregation from `system.query.history`.
# MAGIC Grouped by user, statement type, compute, warehouse, and client.

# COMMAND ----------

spark.sql(f"""
CREATE OR REPLACE TABLE {CATALOG_SCHEMA}.m_query_optimization AS
SELECT
  date_trunc('day', start_time) AS query_date,
  executed_by,
  statement_type,
  compute.type AS compute_type,
  compute.warehouse_id AS warehouse_id,
  client_application,
  COUNT(*) AS query_count,
  AVG(total_duration_ms) AS avg_duration_ms,
  MAX(total_duration_ms) AS max_duration_ms,
  SUM(total_duration_ms) AS total_duration_ms,
  AVG(execution_duration_ms) AS avg_exec_ms,
  AVG(compilation_duration_ms) AS avg_compile_ms,
  SUM(read_bytes) AS total_read_bytes,
  SUM(read_rows)  AS total_read_rows,
  SUM(spilled_local_bytes) AS total_spill_bytes,
  SUM(CASE WHEN execution_status = 'FINISHED' THEN 1 ELSE 0 END) AS succeeded,
  SUM(CASE WHEN execution_status IN ('FAILED','CANCELED') THEN 1 ELSE 0 END) AS failed,
  SUM(CASE WHEN from_result_cache = true THEN 1 ELSE 0 END) AS cache_hits
FROM system.query.history
WHERE start_time >= current_date() - INTERVAL {WINDOW_DAYS} DAYS
GROUP BY ALL
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Table 11: `m_expensive_queries`
# MAGIC Top 200 slowest query executions in the window (>30s), with a preview of the statement text.

# COMMAND ----------

spark.sql(f"""
CREATE OR REPLACE TABLE {CATALOG_SCHEMA}.m_expensive_queries AS
SELECT
  start_time,
  executed_by,
  statement_type,
  SUBSTRING(statement_text, 1, 200) AS statement_preview,
  total_duration_ms,
  execution_duration_ms,
  read_bytes,
  read_rows,
  spilled_local_bytes,
  compute.warehouse_id AS warehouse_id,
  execution_status
FROM system.query.history
WHERE start_time >= current_date() - INTERVAL {WINDOW_DAYS} DAYS
  AND total_duration_ms > 30000
ORDER BY total_duration_ms DESC
LIMIT 200
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Verify tables
# MAGIC Row counts for every materialized table.

# COMMAND ----------

spark.sql(f"""
SELECT 'm_serving_endpoint_daily'  AS table_name, count(*) AS row_count FROM {CATALOG_SCHEMA}.m_serving_endpoint_daily
UNION ALL SELECT 'm_ai_gateway_daily',           count(*) FROM {CATALOG_SCHEMA}.m_ai_gateway_daily
UNION ALL SELECT 'm_ai_cost_daily',              count(*) FROM {CATALOG_SCHEMA}.m_ai_cost_daily
UNION ALL SELECT 'm_assistant_genie_usage',      count(*) FROM {CATALOG_SCHEMA}.m_assistant_genie_usage
UNION ALL SELECT 'm_underutilized_endpoints',    count(*) FROM {CATALOG_SCHEMA}.m_underutilized_endpoints
UNION ALL SELECT 'm_ai_access_audit',            count(*) FROM {CATALOG_SCHEMA}.m_ai_access_audit
UNION ALL SELECT 'm_cost_anomalies',             count(*) FROM {CATALOG_SCHEMA}.m_cost_anomalies
UNION ALL SELECT 'm_mlflow_quality_daily',       count(*) FROM {CATALOG_SCHEMA}.m_mlflow_quality_daily
UNION ALL SELECT 'm_mlflow_metrics_daily',       count(*) FROM {CATALOG_SCHEMA}.m_mlflow_metrics_daily
UNION ALL SELECT 'm_query_optimization',         count(*) FROM {CATALOG_SCHEMA}.m_query_optimization
UNION ALL SELECT 'm_expensive_queries',          count(*) FROM {CATALOG_SCHEMA}.m_expensive_queries
""").display()
