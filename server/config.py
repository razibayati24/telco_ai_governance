"""Configuration and authentication for Databricks."""

import os
from databricks.sdk import WorkspaceClient

IS_DATABRICKS_APP = bool(os.environ.get("DATABRICKS_APP_NAME"))
WAREHOUSE_ID = os.environ.get("DATABRICKS_WAREHOUSE_ID", "")

# --- Configurable catalog and schema ---
CATALOG = os.environ.get("DATABRICKS_CATALOG", "")
SCHEMA = os.environ.get("DATABRICKS_SCHEMA", "ai_governance")
CATALOG_SCHEMA = f"{CATALOG}.{SCHEMA}"

# --- AI / LLM settings ---
LLM_ENDPOINT = os.environ.get("DATABRICKS_LLM_ENDPOINT", "databricks-claude-sonnet-4")
VS_ENDPOINT = os.environ.get("DATABRICKS_VS_ENDPOINT", "")
VS_INDEX = os.environ.get("DATABRICKS_VS_INDEX", f"{CATALOG_SCHEMA}.policy_chunks_vs_index")
GENIE_SPACE_ID = os.environ.get("DATABRICKS_GENIE_SPACE_ID", "")

# All queries hit pre-aggregated materialized tables (30d snapshots).
# Data refreshes via scheduled job or manual rebuild — not live views.
TBL_SERVING = f"{CATALOG_SCHEMA}.m_serving_endpoint_daily"
TBL_ENDPOINTS = f"{CATALOG_SCHEMA}.m_underutilized_endpoints"
TBL_ACCESS = f"{CATALOG_SCHEMA}.m_ai_access_audit"
TBL_GATEWAY = f"{CATALOG_SCHEMA}.m_ai_gateway_daily"
TBL_COST = f"{CATALOG_SCHEMA}.m_ai_cost_daily"
TBL_GENIE = f"{CATALOG_SCHEMA}.m_assistant_genie_usage"
TBL_COST_ANOMALIES = f"{CATALOG_SCHEMA}.m_cost_anomalies"
TBL_MLFLOW_QUALITY = f"{CATALOG_SCHEMA}.m_mlflow_quality_daily"
TBL_MLFLOW_METRICS = f"{CATALOG_SCHEMA}.m_mlflow_metrics_daily"
TBL_QUERY_OPT = f"{CATALOG_SCHEMA}.m_query_optimization"
TBL_EXPENSIVE_QUERIES = f"{CATALOG_SCHEMA}.m_expensive_queries"


def get_workspace_client() -> WorkspaceClient:
    """Get workspace client - auto-detects environment."""
    if IS_DATABRICKS_APP:
        return WorkspaceClient()
    profile = os.environ.get("DATABRICKS_PROFILE", "DEFAULT")
    return WorkspaceClient(profile=profile)


def get_databricks_host() -> str:
    """Get workspace host with https:// prefix."""
    if IS_DATABRICKS_APP:
        host = os.environ.get("DATABRICKS_HOST", "")
        if host and not host.startswith("http"):
            host = f"https://{host}"
        return host
    w = get_workspace_client()
    return w.config.host


def get_access_token() -> str:
    """Get OAuth access token."""
    w = get_workspace_client()
    if w.config.token:
        return w.config.token
    auth_headers = w.config.authenticate()
    if auth_headers and "Authorization" in auth_headers:
        return auth_headers["Authorization"].replace("Bearer ", "")
    raise RuntimeError("Could not obtain access token")
