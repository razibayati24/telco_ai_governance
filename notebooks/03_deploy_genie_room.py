# Databricks notebook source
# MAGIC %md
# MAGIC # 03 - Deploy Genie Room for AI Governance
# MAGIC
# MAGIC This notebook creates and configures a Genie room for natural language Q&A
# MAGIC over the AI governance system table views.
# MAGIC
# MAGIC **Genie Room Tables:**
# MAGIC - `v_serving_endpoint_daily` - Model serving usage metrics
# MAGIC - `v_ai_gateway_daily` - AI Gateway usage and latency
# MAGIC - `v_ai_cost_daily` - AI cost by provider category
# MAGIC - `v_assistant_genie_usage` - Genie/Assistant activity
# MAGIC - `v_underutilized_endpoints` - Endpoint utilization tiers
# MAGIC - `v_ai_access_audit` - Access audit and denied attempts

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("catalog", "", "Unity Catalog Name")
dbutils.widgets.text("schema", "ai_governance", "Schema Name")
dbutils.widgets.text("warehouse_id", "", "SQL Warehouse ID")
dbutils.widgets.text("brand_name", "Acme Corp", "Brand / Customer Name")

CATALOG = dbutils.widgets.get("catalog")
SCHEMA = dbutils.widgets.get("schema")
WAREHOUSE_ID = dbutils.widgets.get("warehouse_id")
BRAND_NAME = dbutils.widgets.get("brand_name") or "Acme Corp"
CATALOG_SCHEMA = f"{CATALOG}.{SCHEMA}"

assert CATALOG, "Please set the 'catalog' widget to your Unity Catalog name"
assert WAREHOUSE_ID, "Please set the 'warehouse_id' widget to your SQL warehouse ID"
print(f"Using: {CATALOG_SCHEMA}")
print(f"Warehouse: {WAREHOUSE_ID}")
print(f"Brand: {BRAND_NAME}")

# COMMAND ----------

import requests
import json

# Get workspace context
host = dbutils.notebook.entry_point.getDbutils().notebook().getContext().apiUrl().getOrElse(None)
token = dbutils.notebook.entry_point.getDbutils().notebook().getContext().apiToken().getOrElse(None)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Create Genie Space

# COMMAND ----------

tables = sorted([
    f"{CATALOG_SCHEMA}.v_serving_endpoint_daily",
    f"{CATALOG_SCHEMA}.v_ai_gateway_daily",
    f"{CATALOG_SCHEMA}.v_ai_cost_daily",
    f"{CATALOG_SCHEMA}.v_assistant_genie_usage",
    f"{CATALOG_SCHEMA}.v_underutilized_endpoints",
    f"{CATALOG_SCHEMA}.v_ai_access_audit"
])

# Create the Genie space
create_payload = {
    "title": f"{BRAND_NAME} AI Governance Q&A",
    "description": "Natural language Q&A to monitor AI usage, model serving costs, endpoint utilization, access patterns, and Genie/Assistant activity across the platform.",
    "warehouse_id": WAREHOUSE_ID,
    "serialized_space": json.dumps({"version": "2"})
}

resp = requests.post(
    f"{host}/api/2.0/genie/spaces",
    headers={"Authorization": f"Bearer {token}"},
    json=create_payload
)
space = resp.json()
space_id = space["space_id"]
print(f"Created Genie space: {space_id}")
print(f"URL: {host}/genie/rooms/{space_id}")
print(f"\n*** Set DATABRICKS_GENIE_SPACE_ID={space_id} in your app.yaml ***")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Add Tables to Genie Room

# COMMAND ----------

# Update with tables
update_payload = {
    "title": f"{BRAND_NAME} AI Governance Q&A",
    "description": "Natural language Q&A to monitor AI usage, model serving costs, endpoint utilization, access patterns, and Genie/Assistant activity across the platform.",
    "warehouse_id": WAREHOUSE_ID,
    "serialized_space": json.dumps({
        "version": "2",
        "data_sources": {
            "tables": [{"identifier": t} for t in tables]
        }
    })
}

resp = requests.patch(
    f"{host}/api/2.0/genie/spaces/{space_id}",
    headers={"Authorization": f"Bearer {token}"},
    json=update_payload
)

if resp.status_code == 200:
    print("Genie room configured with all 6 governance views!")
    print(f"\nGenie Room URL: {host}/genie/rooms/{space_id}")
    print(f"\nTables added:")
    for t in tables:
        print(f"  - {t}")
else:
    print(f"Error: {resp.text}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Sample Questions
# MAGIC Try these in the Genie room:
# MAGIC
# MAGIC | Category | Question |
# MAGIC |----------|----------|
# MAGIC | Usage | What are the top 10 most used AI endpoints by request count? |
# MAGIC | Cost | Show me the daily trend of AI costs broken down by provider |
# MAGIC | Utilization | Which endpoints are idle or underutilized? |
# MAGIC | Users | Who are the top users by token consumption? |
# MAGIC | Security | Show me denied access attempts to AI services |
# MAGIC | Errors | What is the error rate trend for model serving endpoints? |
# MAGIC | Genie | How many Genie/Assistant sessions are happening daily? |
# MAGIC | Models | Compare token usage across foundation models vs custom models |
# MAGIC | Latency | What is the average latency for AI Gateway requests by model? |
# MAGIC | Trends | Show me AI cost trends over the last 90 days |
