# Databricks notebook source
# MAGIC %md
# MAGIC # 01 - Setup AI Governance Views
# MAGIC
# MAGIC This notebook creates the schema and views needed for the AI Governance & Observability platform.
# MAGIC It builds an intelligence layer on top of Databricks system tables to monitor AI usage across workspaces.
# MAGIC
# MAGIC **System Tables Used:**
# MAGIC - `system.serving.endpoint_usage` - Model serving request data
# MAGIC - `system.serving.served_entities` - Endpoint configurations
# MAGIC - `system.ai_gateway.usage` - AI Gateway routing and usage
# MAGIC - `system.billing.usage` - Cost/billing data
# MAGIC - `system.access.assistant_events` - Genie/Assistant usage
# MAGIC - `system.access.audit` - Access audit logs

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration
# MAGIC Set your catalog and schema names below. These will be used throughout the notebook.

# COMMAND ----------

dbutils.widgets.text("catalog", "", "Unity Catalog Name")
dbutils.widgets.text("schema", "ai_governance", "Schema Name")

CATALOG = dbutils.widgets.get("catalog")
SCHEMA = dbutils.widgets.get("schema")
CATALOG_SCHEMA = f"{CATALOG}.{SCHEMA}"

assert CATALOG, "Please set the 'catalog' widget to your Unity Catalog name"
print(f"Using: {CATALOG_SCHEMA}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Create Schema

# COMMAND ----------

spark.sql(f"""
CREATE SCHEMA IF NOT EXISTS {CATALOG_SCHEMA}
COMMENT 'AI Governance & Observability views for monitoring AI usage across the platform'
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## View 1: Serving Endpoint Daily Aggregation
# MAGIC Aggregates model serving usage by day, endpoint, entity type, and requester.

# COMMAND ----------

spark.sql(f"""
CREATE OR REPLACE VIEW {CATALOG_SCHEMA}.v_serving_endpoint_daily AS
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
GROUP BY ALL
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## View 2: AI Gateway Daily Aggregation
# MAGIC Tracks AI Gateway usage including model routing, latency, and token consumption.

# COMMAND ----------

spark.sql(f"""
CREATE OR REPLACE VIEW {CATALOG_SCHEMA}.v_ai_gateway_daily AS
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
GROUP BY ALL
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## View 3: AI Cost Daily
# MAGIC Categorizes AI-related billing SKUs into logical cost categories.

# COMMAND ----------

spark.sql(f"""
CREATE OR REPLACE VIEW {CATALOG_SCHEMA}.v_ai_cost_daily AS
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
WHERE sku_name LIKE '%ANTHROPIC%' OR sku_name LIKE '%OPENAI%' OR sku_name LIKE '%GEMINI%'
   OR sku_name LIKE '%MODEL_TRAINING%' OR sku_name LIKE '%REAL_TIME_INFERENCE%'
GROUP BY ALL
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## View 4: Assistant/Genie Usage
# MAGIC Tracks Genie room and AI Assistant activity.

# COMMAND ----------

spark.sql(f"""
CREATE OR REPLACE VIEW {CATALOG_SCHEMA}.v_assistant_genie_usage AS
SELECT
  date_trunc('day', event_time) AS event_date,
  initiated_by,
  user_agent,
  COUNT(*) AS event_count
FROM system.access.assistant_events
GROUP BY ALL
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## View 5: Underutilized Endpoints
# MAGIC Identifies endpoints with low or zero usage for cost optimization.

# COMMAND ----------

spark.sql(f"""
CREATE OR REPLACE VIEW {CATALOG_SCHEMA}.v_underutilized_endpoints AS
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
  SELECT served_entity_id, COUNT(*) AS total_requests_30d,
    SUM(input_token_count + output_token_count) AS total_tokens_30d,
    COUNT(DISTINCT requester) AS unique_users_30d,
    MAX(request_time) AS last_request_time
  FROM system.serving.endpoint_usage
  WHERE request_time >= current_date() - INTERVAL 30 DAYS
  GROUP BY served_entity_id
) u ON se.served_entity_id = u.served_entity_id
WHERE se.endpoint_delete_time IS NULL
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## View 6: AI Access Audit
# MAGIC Monitors access events and denied attempts for AI services.

# COMMAND ----------

spark.sql(f"""
CREATE OR REPLACE VIEW {CATALOG_SCHEMA}.v_ai_access_audit AS
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
  AND event_time >= current_date() - INTERVAL 90 DAYS
GROUP BY ALL
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Verify Views
# MAGIC Quick validation that all views are created and return data.

# COMMAND ----------

spark.sql(f"""
SELECT 'v_serving_endpoint_daily' as view_name, count(*) as row_count FROM {CATALOG_SCHEMA}.v_serving_endpoint_daily
UNION ALL
SELECT 'v_ai_gateway_daily', count(*) FROM {CATALOG_SCHEMA}.v_ai_gateway_daily
UNION ALL
SELECT 'v_ai_cost_daily', count(*) FROM {CATALOG_SCHEMA}.v_ai_cost_daily
UNION ALL
SELECT 'v_assistant_genie_usage', count(*) FROM {CATALOG_SCHEMA}.v_assistant_genie_usage
UNION ALL
SELECT 'v_underutilized_endpoints', count(*) FROM {CATALOG_SCHEMA}.v_underutilized_endpoints
UNION ALL
SELECT 'v_ai_access_audit', count(*) FROM {CATALOG_SCHEMA}.v_ai_access_audit
""").display()
