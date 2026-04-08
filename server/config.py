"""Configuration and authentication for Databricks."""

import os
from databricks.sdk import WorkspaceClient

IS_DATABRICKS_APP = bool(os.environ.get("DATABRICKS_APP_NAME"))
WAREHOUSE_ID = os.environ.get("DATABRICKS_WAREHOUSE_ID", "9cd919d96b11bf1c")
CATALOG_SCHEMA = "cmegdemos_catalog.ai_governance"


def get_workspace_client() -> WorkspaceClient:
    """Get workspace client - auto-detects environment."""
    if IS_DATABRICKS_APP:
        return WorkspaceClient()
    profile = os.environ.get("DATABRICKS_PROFILE", "fevm-cmegdemos")
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
