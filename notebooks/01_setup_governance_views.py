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
# MAGIC ## Create Schema

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE SCHEMA IF NOT EXISTS cmegdemos_catalog.ai_governance
# MAGIC COMMENT 'AI Governance & Observability views for monitoring AI usage across the platform';

# COMMAND ----------

# MAGIC %md
# MAGIC ## View 1: Serving Endpoint Daily Aggregation
# MAGIC Aggregates model serving usage by day, endpoint, entity type, and requester.

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE VIEW cmegdemos_catalog.ai_governance.v_serving_endpoint_daily AS
# MAGIC SELECT
# MAGIC   date_trunc('day', eu.request_time) AS request_date,
# MAGIC   se.endpoint_name,
# MAGIC   se.entity_type,
# MAGIC   se.entity_name,
# MAGIC   se.task,
# MAGIC   eu.requester,
# MAGIC   eu.status_code,
# MAGIC   COUNT(*) AS request_count,
# MAGIC   SUM(eu.input_token_count) AS total_input_tokens,
# MAGIC   SUM(eu.output_token_count) AS total_output_tokens,
# MAGIC   SUM(eu.input_token_count + eu.output_token_count) AS total_tokens,
# MAGIC   SUM(CASE WHEN eu.status_code >= 400 THEN 1 ELSE 0 END) AS error_count,
# MAGIC   ROUND(SUM(CASE WHEN eu.status_code >= 400 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS error_rate_pct
# MAGIC FROM system.serving.endpoint_usage eu
# MAGIC JOIN system.serving.served_entities se ON eu.served_entity_id = se.served_entity_id
# MAGIC GROUP BY ALL;

# COMMAND ----------

# MAGIC %md
# MAGIC ## View 2: AI Gateway Daily Aggregation
# MAGIC Tracks AI Gateway usage including model routing, latency, and token consumption.

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE VIEW cmegdemos_catalog.ai_governance.v_ai_gateway_daily AS
# MAGIC SELECT
# MAGIC   date_trunc('day', event_time) AS request_date,
# MAGIC   endpoint_name,
# MAGIC   destination_type,
# MAGIC   destination_name,
# MAGIC   destination_model,
# MAGIC   requester,
# MAGIC   requester_type,
# MAGIC   api_type,
# MAGIC   status_code,
# MAGIC   COUNT(*) AS request_count,
# MAGIC   SUM(input_tokens) AS total_input_tokens,
# MAGIC   SUM(output_tokens) AS total_output_tokens,
# MAGIC   SUM(total_tokens) AS total_tokens,
# MAGIC   AVG(latency_ms) AS avg_latency_ms,
# MAGIC   AVG(time_to_first_byte_ms) AS avg_ttfb_ms,
# MAGIC   SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS error_count
# MAGIC FROM system.ai_gateway.usage
# MAGIC GROUP BY ALL;

# COMMAND ----------

# MAGIC %md
# MAGIC ## View 3: AI Cost Daily
# MAGIC Categorizes AI-related billing SKUs into logical cost categories.

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE VIEW cmegdemos_catalog.ai_governance.v_ai_cost_daily AS
# MAGIC SELECT
# MAGIC   usage_date,
# MAGIC   sku_name,
# MAGIC   CASE
# MAGIC     WHEN sku_name LIKE '%ANTHROPIC%' THEN 'Anthropic Model Serving'
# MAGIC     WHEN sku_name LIKE '%OPENAI%' THEN 'OpenAI Model Serving'
# MAGIC     WHEN sku_name LIKE '%GEMINI%' THEN 'Gemini Model Serving'
# MAGIC     WHEN sku_name LIKE '%MODEL_TRAINING%' THEN 'Model Training'
# MAGIC     WHEN sku_name LIKE '%REAL_TIME_INFERENCE%' THEN 'Real-Time Inference'
# MAGIC     ELSE 'Other AI'
# MAGIC   END AS cost_category,
# MAGIC   SUM(usage_quantity) AS total_dbus
# MAGIC FROM system.billing.usage
# MAGIC WHERE sku_name LIKE '%ANTHROPIC%' OR sku_name LIKE '%OPENAI%' OR sku_name LIKE '%GEMINI%'
# MAGIC    OR sku_name LIKE '%MODEL_TRAINING%' OR sku_name LIKE '%REAL_TIME_INFERENCE%'
# MAGIC GROUP BY ALL;

# COMMAND ----------

# MAGIC %md
# MAGIC ## View 4: Assistant/Genie Usage
# MAGIC Tracks Genie room and AI Assistant activity.

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE VIEW cmegdemos_catalog.ai_governance.v_assistant_genie_usage AS
# MAGIC SELECT
# MAGIC   date_trunc('day', event_time) AS event_date,
# MAGIC   initiated_by,
# MAGIC   user_agent,
# MAGIC   COUNT(*) AS event_count
# MAGIC FROM system.access.assistant_events
# MAGIC GROUP BY ALL;

# COMMAND ----------

# MAGIC %md
# MAGIC ## View 5: Underutilized Endpoints
# MAGIC Identifies endpoints with low or zero usage for cost optimization.

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE VIEW cmegdemos_catalog.ai_governance.v_underutilized_endpoints AS
# MAGIC SELECT
# MAGIC   se.endpoint_name,
# MAGIC   se.entity_type,
# MAGIC   se.entity_name,
# MAGIC   se.task,
# MAGIC   se.created_by,
# MAGIC   se.change_time AS last_config_change,
# MAGIC   COALESCE(u.total_requests_30d, 0) AS total_requests_30d,
# MAGIC   COALESCE(u.total_tokens_30d, 0) AS total_tokens_30d,
# MAGIC   COALESCE(u.unique_users_30d, 0) AS unique_users_30d,
# MAGIC   u.last_request_time,
# MAGIC   CASE
# MAGIC     WHEN COALESCE(u.total_requests_30d, 0) = 0 THEN 'Idle'
# MAGIC     WHEN COALESCE(u.total_requests_30d, 0) < 100 THEN 'Very Low'
# MAGIC     WHEN COALESCE(u.total_requests_30d, 0) < 1000 THEN 'Low'
# MAGIC     WHEN COALESCE(u.total_requests_30d, 0) < 10000 THEN 'Moderate'
# MAGIC     ELSE 'Active'
# MAGIC   END AS utilization_tier
# MAGIC FROM system.serving.served_entities se
# MAGIC LEFT JOIN (
# MAGIC   SELECT served_entity_id, COUNT(*) AS total_requests_30d,
# MAGIC     SUM(input_token_count + output_token_count) AS total_tokens_30d,
# MAGIC     COUNT(DISTINCT requester) AS unique_users_30d,
# MAGIC     MAX(request_time) AS last_request_time
# MAGIC   FROM system.serving.endpoint_usage
# MAGIC   WHERE request_time >= current_date() - INTERVAL 30 DAYS
# MAGIC   GROUP BY served_entity_id
# MAGIC ) u ON se.served_entity_id = u.served_entity_id
# MAGIC WHERE se.endpoint_delete_time IS NULL;

# COMMAND ----------

# MAGIC %md
# MAGIC ## View 6: AI Access Audit
# MAGIC Monitors access events and denied attempts for AI services.

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE VIEW cmegdemos_catalog.ai_governance.v_ai_access_audit AS
# MAGIC SELECT
# MAGIC   date_trunc('day', event_time) AS event_date,
# MAGIC   user_identity.email AS user_email,
# MAGIC   action_name,
# MAGIC   service_name,
# MAGIC   source_ip_address,
# MAGIC   response.status_code AS status_code,
# MAGIC   CASE WHEN response.status_code >= 400 THEN true ELSE false END AS is_denied,
# MAGIC   COUNT(*) AS event_count
# MAGIC FROM system.access.audit
# MAGIC WHERE service_name IN ('modelServing', 'mlflow', 'aiGateway', 'vectorSearch', 'aibi')
# MAGIC   AND event_time >= current_date() - INTERVAL 90 DAYS
# MAGIC GROUP BY ALL;

# COMMAND ----------

# MAGIC %md
# MAGIC ## Verify Views
# MAGIC Quick validation that all views are created and return data.

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT 'v_serving_endpoint_daily' as view_name, count(*) as row_count FROM cmegdemos_catalog.ai_governance.v_serving_endpoint_daily
# MAGIC UNION ALL
# MAGIC SELECT 'v_ai_gateway_daily', count(*) FROM cmegdemos_catalog.ai_governance.v_ai_gateway_daily
# MAGIC UNION ALL
# MAGIC SELECT 'v_ai_cost_daily', count(*) FROM cmegdemos_catalog.ai_governance.v_ai_cost_daily
# MAGIC UNION ALL
# MAGIC SELECT 'v_assistant_genie_usage', count(*) FROM cmegdemos_catalog.ai_governance.v_assistant_genie_usage
# MAGIC UNION ALL
# MAGIC SELECT 'v_underutilized_endpoints', count(*) FROM cmegdemos_catalog.ai_governance.v_underutilized_endpoints
# MAGIC UNION ALL
# MAGIC SELECT 'v_ai_access_audit', count(*) FROM cmegdemos_catalog.ai_governance.v_ai_access_audit;
