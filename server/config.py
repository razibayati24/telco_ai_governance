"""Configuration and authentication for the AI Governance Monitor.

This module is the single source of truth for runtime configuration.  It
merges three layers (lowest -> highest precedence):

1. Defaults baked into ``template.config.json`` at the repo root.
2. The matching environment variable (uppercased dotted path), e.g.
   ``BRAND_NAME`` overrides ``brand.name``.
3. Explicit ``DATABRICKS_*`` workspace settings (catalog, schema, warehouse,
   endpoints, Genie space).

Both Databricks Apps (production) and local-CLI (`databricks auth login`)
flows are supported.  See ``get_workspace_client`` / ``get_access_token``.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict

from databricks.sdk import WorkspaceClient

# ---------------------------------------------------------------------------
# Environment detection
# ---------------------------------------------------------------------------

IS_DATABRICKS_APP = bool(os.environ.get("DATABRICKS_APP_NAME"))

# ---------------------------------------------------------------------------
# Workspace / catalog / schema
# ---------------------------------------------------------------------------

WAREHOUSE_ID = os.environ.get("DATABRICKS_WAREHOUSE_ID", "")
CATALOG = os.environ.get("DATABRICKS_CATALOG", "")
SCHEMA = os.environ.get("DATABRICKS_SCHEMA", "ai_governance")
CATALOG_SCHEMA = f"{CATALOG}.{SCHEMA}" if CATALOG else SCHEMA

# ---------------------------------------------------------------------------
# AI / LLM endpoints
# ---------------------------------------------------------------------------

LLM_ENDPOINT = os.environ.get("DATABRICKS_LLM_ENDPOINT", "databricks-claude-sonnet-4-5")
VS_ENDPOINT = os.environ.get("DATABRICKS_VS_ENDPOINT", "")
VS_INDEX = os.environ.get(
    "DATABRICKS_VS_INDEX", f"{CATALOG_SCHEMA}.policy_chunks_vs_index"
)
EMBEDDING_MODEL = os.environ.get("DATABRICKS_EMBEDDING_MODEL", "databricks-gte-large-en")
GENIE_SPACE_ID = os.environ.get("DATABRICKS_GENIE_SPACE_ID", "")

# Multi-Agent Supervisor (Agent Bricks) endpoint name.  Resource-bound via the
# `mas-endpoint` resource in app.yaml.  Falls back to the value baked into
# template.config.json["mas"]["endpoint_name"] (usually empty for the open
# template).  When unset, /api/agent/ask transparently degrades to the
# Foundation-Model + Genie SQL fallback so the chat tab still answers.
MAS_ENDPOINT_NAME = os.environ.get(
    "DATABRICKS_MAS_ENDPOINT",
    os.environ.get("MAS_ENDPOINT_NAME", ""),
)

# Optional purpose-specific Genie spaces used by the AI Ops Explorer agent.
# Currently informational only — the supervisor itself owns Genie routing —
# but exposed here so a deployer can wire them through DABs.
FINOPS_GENIE_SPACE_ID = os.environ.get("DATABRICKS_FINOPS_GENIE_SPACE_ID", "")
AI_OPS_GENIE_SPACE_ID = os.environ.get("DATABRICKS_AI_OPS_GENIE_SPACE_ID", "")

# ---------------------------------------------------------------------------
# Materialized table names
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Branding (env-overridable)
# ---------------------------------------------------------------------------

BRAND_NAME = os.environ.get("BRAND_NAME", "")
BRAND_PARENT = os.environ.get("BRAND_PARENT", "")
BRAND_INDUSTRY = os.environ.get("BRAND_INDUSTRY", "")
EMAIL_DOMAIN = os.environ.get("EMAIL_DOMAIN", "example.com")
APP_TITLE = os.environ.get("APP_TITLE", "")
APP_SUBTITLE = os.environ.get("APP_SUBTITLE", "")
SUPER_USER_GROUP_NAME = os.environ.get("SUPER_USER_GROUP_NAME", "ai_gov_super_users")


# ---------------------------------------------------------------------------
# Template config loader
# ---------------------------------------------------------------------------

_REPO_ROOT = Path(__file__).resolve().parent.parent
_TEMPLATE_CONFIG_PATH = _REPO_ROOT / "template.config.json"

_DEFAULT_TEMPLATE_CONFIG: Dict[str, Any] = {
    "brand": {
        "name": "Acme Corp",
        "parent": "",
        "industry": "Generic",
        "email_domain": "example.com",
    },
    "app": {
        "title": "AI Governance & Observability",
        "subtitle": "AI Agentic FinOps Assistant",
        "header_brand": "Acme Corp",
    },
    "policy_assistant": {
        "system_prompt": (
            "You are the {brand_name} AI Governance Policy Assistant. Answer "
            "questions about data classification, internal access levels, "
            "regulatory compliance for AI systems, sensitive data protection, "
            "and approved/prohibited AI uses based ONLY on the provided policy "
            "context. Be specific, cite the relevant policy by name, and "
            "provide actionable guidance. If the context doesn't contain the "
            "answer, say so. Keep answers concise — one to two paragraphs max."
        ),
        "empty_state_heading": "Ask about {brand_name} AI Governance Policies",
        "empty_state_description": (
            "This assistant answers questions from your governance policy "
            "documents covering data access, model lifecycle, cost management, "
            "security, Genie governance, and acceptable use."
        ),
        "suggested_questions": [],
    },
    "genie_chat": {
        "system_prompt": (
            "You are an AI FinOps analyst for the {brand_name} AI Landscape "
            "platform.\n\n{table_context}\n\nRules:\n- Be brief.\n- Use concrete numbers."
        ),
        "empty_state_heading": "Ask about your AI operations",
        "empty_state_description": "Queries live system table data via natural language",
        "suggested_questions": [],
    },
    "policy_chat_popup": {
        "title": "Policy Assistant",
        "subtitle": "RAG-powered governance Q&A",
        "empty_state_label": "Ask about your data & AI policies",
        "empty_state_subtext": "Policy KB covers governance topics",
        "input_placeholder": "Ask about policies...",
        "loading_text": "Searching policies...",
    },
    "deployment": {"app_name": "ai-governance-monitor", "resource_keys": {}},
    "dashboard": {"window_days": 30, "tabs": []},
    "agents": {
        "app_name": "{brand_name} AI Governance",
        "app_subtitle": (
            "FinOps & Responsible-AI Intelligence Across {brand_name} Bricks"
        ),
        "app_icon": "\u2B22",
        "powered_by": "Databricks Agent Bricks",
        "placeholder": (
            "Ask about AI vendor contracts, spend, latency SLAs, or governance clauses\u2026"
        ),
        "sidebar": {},
        "demo_paths": [],
        "name_mappings": [],
    },
    "mas": {"endpoint_name": ""},
}


def _deep_merge(dst: Dict[str, Any], src: Dict[str, Any]) -> Dict[str, Any]:
    for key, val in src.items():
        if (
            key in dst
            and isinstance(dst[key], dict)
            and isinstance(val, dict)
        ):
            _deep_merge(dst[key], val)
        else:
            dst[key] = val
    return dst


@lru_cache(maxsize=1)
def load_template_config() -> Dict[str, Any]:
    """Load template.config.json once, layered on the bundled defaults.

    Returns the merged dict.  Env-var overrides for top-level brand/app fields
    are applied here so callers always see a single resolved view.
    """
    merged: Dict[str, Any] = json.loads(json.dumps(_DEFAULT_TEMPLATE_CONFIG))  # deep copy
    if _TEMPLATE_CONFIG_PATH.exists():
        try:
            user = json.loads(_TEMPLATE_CONFIG_PATH.read_text())
            _deep_merge(merged, user)
        except Exception:  # pragma: no cover — never fatal
            pass

    # Apply env-var overrides for the most common fields
    if BRAND_NAME:
        merged["brand"]["name"] = BRAND_NAME
        merged["app"]["header_brand"] = BRAND_NAME
    if BRAND_PARENT:
        merged["brand"]["parent"] = BRAND_PARENT
    if BRAND_INDUSTRY:
        merged["brand"]["industry"] = BRAND_INDUSTRY
    if EMAIL_DOMAIN and EMAIL_DOMAIN != "example.com":
        merged["brand"]["email_domain"] = EMAIL_DOMAIN
    if APP_TITLE:
        merged["app"]["title"] = APP_TITLE
    if APP_SUBTITLE:
        merged["app"]["subtitle"] = APP_SUBTITLE

    return merged


def get_brand_name() -> str:
    return load_template_config()["brand"]["name"]


def get_app_title() -> str:
    return load_template_config()["app"]["title"]


def get_app_subtitle() -> str:
    return load_template_config()["app"]["subtitle"]


def get_agent_config() -> Dict[str, Any]:
    """Return a brand-substituted view of the Multi-Agent Supervisor sidebar
    config consumed by the Chat tab and ``_normalize_agent_name``.

    The raw block lives under ``agents`` in ``template.config.json``.  Values
    that contain ``{brand_name}`` are formatted here so the React side never
    sees template tokens.
    """
    cfg = load_template_config()
    raw = cfg.get("agents", {}) or {}
    brand_name = get_brand_name()

    def _fmt(s: Any) -> Any:
        if isinstance(s, str):
            try:
                return s.format(brand_name=brand_name)
            except (KeyError, IndexError):
                return s
        return s

    sidebar = {
        key: {
            "label": _fmt(meta.get("label", key)),
            "color": meta.get("color", "#999999"),
            "description": _fmt(meta.get("description", "")),
        }
        for key, meta in (raw.get("sidebar") or {}).items()
    }

    demo_paths = []
    for path in raw.get("demo_paths", []) or []:
        demo_paths.append(
            {
                "title": _fmt(path.get("title", "")),
                "icon": path.get("icon", "\u25CF"),
                "questions": [_fmt(q) for q in path.get("questions", [])],
            }
        )

    name_mappings = list(raw.get("name_mappings", []) or [])

    return {
        "app_name": _fmt(raw.get("app_name", "AI Governance")),
        "app_subtitle": _fmt(raw.get("app_subtitle", "")),
        "app_icon": raw.get("app_icon", "\u2B22"),
        "powered_by": _fmt(raw.get("powered_by", "Databricks Agent Bricks")),
        "placeholder": _fmt(raw.get("placeholder", "Ask the supervisor\u2026")),
        # The Chat tab consumes the sidebar under the legacy key `agents`
        # (matching the deployed app's response shape) so existing TSX
        # iterates `Object.entries(config.agents)` unchanged.
        "agents": sidebar,
        "demo_paths": demo_paths,
        "name_mappings": name_mappings,
    }


# ---------------------------------------------------------------------------
# Workspace client / auth
# ---------------------------------------------------------------------------


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
