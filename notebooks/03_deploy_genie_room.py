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

import requests
import json

# Get workspace context
host = dbutils.notebook.entry_point.getDbutils().notebook().getContext().apiUrl().getOrElse(None)
token = dbutils.notebook.entry_point.getDbutils().notebook().getContext().apiToken().getOrElse(None)

WAREHOUSE_ID = "9cd919d96b11bf1c"  # Update to your warehouse ID

# COMMAND ----------

# MAGIC %md
# MAGIC ## Create Genie Space

# COMMAND ----------

tables = sorted([
    "cmegdemos_catalog.ai_governance.v_serving_endpoint_daily",
    "cmegdemos_catalog.ai_governance.v_ai_gateway_daily",
    "cmegdemos_catalog.ai_governance.v_ai_cost_daily",
    "cmegdemos_catalog.ai_governance.v_assistant_genie_usage",
    "cmegdemos_catalog.ai_governance.v_underutilized_endpoints",
    "cmegdemos_catalog.ai_governance.v_ai_access_audit"
])

# Create the Genie space
create_payload = {
    "title": "AI Governance Q&A",
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

# COMMAND ----------

# MAGIC %md
# MAGIC ## Add Tables to Genie Room

# COMMAND ----------

# Update with tables
update_payload = {
    "title": "AI Governance Q&A",
    "description": "Natural language Q&A to monitor AI usage, model serving costs, endpoint utilization, access patterns, and Genie/Assistant activity across the platform. Designed for MT&T AI governance.",
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
