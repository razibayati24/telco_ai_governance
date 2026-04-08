"""API routes for AI Governance Monitor."""

import logging
from datetime import date, datetime, timedelta
from decimal import Decimal
from fastapi import APIRouter, Query
from pydantic import BaseModel
from server.config import CATALOG_SCHEMA, get_databricks_host, get_access_token
from server.db import execute_query

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


def serialize_value(v):
    """Convert non-JSON-serializable types."""
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    return v


def serialize_rows(rows: list[dict]) -> list[dict]:
    """Serialize all values in a list of dicts."""
    return [{k: serialize_value(v) for k, v in row.items()} for row in rows]


# ---------------------------------------------------------------------------
# Overview KPIs
# ---------------------------------------------------------------------------


@router.get("/overview/kpis")
def get_overview_kpis():
    """Get high-level KPI metrics for the overview tab."""
    try:
        # Total AI Requests (30d)
        requests_30d = execute_query(f"""
            SELECT COALESCE(SUM(request_count), 0) as total_requests
            FROM {CATALOG_SCHEMA}.v_serving_endpoint_daily
            WHERE request_date >= DATEADD(DAY, -30, CURRENT_DATE())
        """)

        # Total Tokens (30d)
        tokens_30d = execute_query(f"""
            SELECT COALESCE(SUM(total_tokens), 0) as total_tokens
            FROM {CATALOG_SCHEMA}.v_serving_endpoint_daily
            WHERE request_date >= DATEADD(DAY, -30, CURRENT_DATE())
        """)

        # Active Endpoints
        active_endpoints = execute_query(f"""
            SELECT COUNT(DISTINCT endpoint_name) as active_count
            FROM {CATALOG_SCHEMA}.v_underutilized_endpoints
            WHERE utilization_tier IN ('Active', 'Moderate')
        """)

        # Denied Access Attempts (30d)
        denied_access = execute_query(f"""
            SELECT COALESCE(SUM(event_count), 0) as denied_count
            FROM {CATALOG_SCHEMA}.v_ai_access_audit
            WHERE is_denied = true
              AND event_date >= DATEADD(DAY, -30, CURRENT_DATE())
        """)

        # Total AI Cost (30d DBUs)
        total_cost = execute_query(f"""
            SELECT COALESCE(SUM(total_dbus), 0) as total_dbus
            FROM {CATALOG_SCHEMA}.v_ai_cost_daily
            WHERE usage_date >= DATEADD(DAY, -30, CURRENT_DATE())
        """)

        # Total endpoints count
        total_endpoints = execute_query(f"""
            SELECT COUNT(DISTINCT endpoint_name) as total
            FROM {CATALOG_SCHEMA}.v_underutilized_endpoints
        """)

        return {
            "total_requests_30d": serialize_value(requests_30d[0]["total_requests"]) if requests_30d else 0,
            "total_tokens_30d": serialize_value(tokens_30d[0]["total_tokens"]) if tokens_30d else 0,
            "active_endpoints": serialize_value(active_endpoints[0]["active_count"]) if active_endpoints else 0,
            "denied_access_30d": serialize_value(denied_access[0]["denied_count"]) if denied_access else 0,
            "total_cost_dbus_30d": serialize_value(total_cost[0]["total_dbus"]) if total_cost else 0,
            "total_endpoints": serialize_value(total_endpoints[0]["total"]) if total_endpoints else 0,
        }
    except Exception as e:
        logger.error(f"Error fetching KPIs: {e}")
        return {"error": str(e)}


@router.get("/overview/daily-requests")
def get_daily_requests():
    """Daily request trend for the last 30 days."""
    rows = execute_query(f"""
        SELECT
            CAST(request_date AS DATE) as day,
            SUM(request_count) as total_requests,
            SUM(error_count) as total_errors
        FROM {CATALOG_SCHEMA}.v_serving_endpoint_daily
        WHERE request_date >= DATEADD(DAY, -30, CURRENT_DATE())
        GROUP BY CAST(request_date AS DATE)
        ORDER BY day
    """)
    return serialize_rows(rows)


@router.get("/overview/daily-cost")
def get_daily_cost():
    """Daily cost trend by category for the last 30 days."""
    rows = execute_query(f"""
        SELECT
            usage_date as day,
            cost_category,
            SUM(total_dbus) as total_dbus
        FROM {CATALOG_SCHEMA}.v_ai_cost_daily
        WHERE usage_date >= DATEADD(DAY, -30, CURRENT_DATE())
        GROUP BY usage_date, cost_category
        ORDER BY usage_date
    """)
    return serialize_rows(rows)


# ---------------------------------------------------------------------------
# Model Serving
# ---------------------------------------------------------------------------


@router.get("/serving/top-endpoints")
def get_top_endpoints(entity_type: str = Query(default=None)):
    """Top 20 endpoints by request volume."""
    where = "WHERE request_date >= DATEADD(DAY, -30, CURRENT_DATE())"
    if entity_type:
        where += f" AND entity_type = '{entity_type}'"
    rows = execute_query(f"""
        SELECT
            endpoint_name,
            entity_type,
            SUM(request_count) as total_requests,
            SUM(total_tokens) as total_tokens,
            SUM(error_count) as total_errors,
            ROUND(CASE WHEN SUM(request_count) > 0
                  THEN SUM(error_count) * 100.0 / SUM(request_count)
                  ELSE 0 END, 2) as error_rate_pct
        FROM {CATALOG_SCHEMA}.v_serving_endpoint_daily
        {where}
        GROUP BY endpoint_name, entity_type
        ORDER BY total_requests DESC
        LIMIT 20
    """)
    return serialize_rows(rows)


@router.get("/serving/all-endpoints")
def get_all_serving_endpoints(entity_type: str = Query(default=None)):
    """All endpoints with aggregated metrics."""
    where = "WHERE request_date >= DATEADD(DAY, -30, CURRENT_DATE())"
    if entity_type:
        where += f" AND entity_type = '{entity_type}'"
    rows = execute_query(f"""
        SELECT
            endpoint_name,
            entity_type,
            entity_name,
            COLLECT_SET(task)[0] as task,
            SUM(request_count) as total_requests,
            SUM(total_input_tokens) as total_input_tokens,
            SUM(total_output_tokens) as total_output_tokens,
            SUM(total_tokens) as total_tokens,
            SUM(error_count) as total_errors,
            ROUND(CASE WHEN SUM(request_count) > 0
                  THEN SUM(error_count) * 100.0 / SUM(request_count)
                  ELSE 0 END, 2) as error_rate_pct,
            COUNT(DISTINCT requester) as unique_users
        FROM {CATALOG_SCHEMA}.v_serving_endpoint_daily
        {where}
        GROUP BY endpoint_name, entity_type, entity_name
        ORDER BY total_requests DESC
    """)
    return serialize_rows(rows)


@router.get("/serving/entity-types")
def get_entity_types():
    """Get distinct entity types."""
    rows = execute_query(f"""
        SELECT DISTINCT entity_type
        FROM {CATALOG_SCHEMA}.v_serving_endpoint_daily
        ORDER BY entity_type
    """)
    return [r["entity_type"] for r in rows]


# ---------------------------------------------------------------------------
# AI Gateway
# ---------------------------------------------------------------------------


@router.get("/gateway/by-model")
def get_gateway_by_model():
    """Requests aggregated by destination model."""
    rows = execute_query(f"""
        SELECT
            destination_model,
            SUM(request_count) as total_requests,
            SUM(total_input_tokens) as total_input_tokens,
            SUM(total_output_tokens) as total_output_tokens,
            SUM(total_tokens) as total_tokens,
            ROUND(AVG(avg_latency_ms), 1) as avg_latency_ms,
            ROUND(AVG(avg_ttfb_ms), 1) as avg_ttfb_ms,
            SUM(error_count) as total_errors
        FROM {CATALOG_SCHEMA}.v_ai_gateway_daily
        WHERE request_date >= DATEADD(DAY, -30, CURRENT_DATE())
        GROUP BY destination_model
        ORDER BY total_requests DESC
    """)
    return serialize_rows(rows)


@router.get("/gateway/daily-tokens")
def get_gateway_daily_tokens():
    """Daily token consumption by model."""
    rows = execute_query(f"""
        SELECT
            CAST(request_date AS DATE) as day,
            destination_model,
            SUM(total_input_tokens) as input_tokens,
            SUM(total_output_tokens) as output_tokens,
            SUM(total_tokens) as total_tokens
        FROM {CATALOG_SCHEMA}.v_ai_gateway_daily
        WHERE request_date >= DATEADD(DAY, -30, CURRENT_DATE())
        GROUP BY CAST(request_date AS DATE), destination_model
        ORDER BY day
    """)
    return serialize_rows(rows)


@router.get("/gateway/latency-by-model")
def get_latency_by_model():
    """Average latency by model."""
    rows = execute_query(f"""
        SELECT
            destination_model,
            ROUND(AVG(avg_latency_ms), 1) as avg_latency_ms,
            ROUND(AVG(avg_ttfb_ms), 1) as avg_ttfb_ms,
            SUM(request_count) as total_requests
        FROM {CATALOG_SCHEMA}.v_ai_gateway_daily
        WHERE request_date >= DATEADD(DAY, -30, CURRENT_DATE())
        GROUP BY destination_model
        ORDER BY avg_latency_ms DESC
    """)
    return serialize_rows(rows)


# ---------------------------------------------------------------------------
# Cost Observatory
# ---------------------------------------------------------------------------


@router.get("/cost/daily")
def get_cost_daily():
    """Daily costs by category."""
    rows = execute_query(f"""
        SELECT
            usage_date as day,
            cost_category,
            SUM(total_dbus) as total_dbus
        FROM {CATALOG_SCHEMA}.v_ai_cost_daily
        WHERE usage_date >= DATEADD(DAY, -30, CURRENT_DATE())
        GROUP BY usage_date, cost_category
        ORDER BY usage_date
    """)
    return serialize_rows(rows)


@router.get("/cost/distribution")
def get_cost_distribution():
    """Cost distribution by category (30d)."""
    rows = execute_query(f"""
        SELECT
            cost_category,
            SUM(total_dbus) as total_dbus
        FROM {CATALOG_SCHEMA}.v_ai_cost_daily
        WHERE usage_date >= DATEADD(DAY, -30, CURRENT_DATE())
        GROUP BY cost_category
        ORDER BY total_dbus DESC
    """)
    return serialize_rows(rows)


@router.get("/cost/by-sku")
def get_cost_by_sku():
    """Cost breakdown by SKU."""
    rows = execute_query(f"""
        SELECT
            sku_name,
            cost_category,
            SUM(total_dbus) as total_dbus
        FROM {CATALOG_SCHEMA}.v_ai_cost_daily
        WHERE usage_date >= DATEADD(DAY, -30, CURRENT_DATE())
        GROUP BY sku_name, cost_category
        ORDER BY total_dbus DESC
    """)
    return serialize_rows(rows)


# ---------------------------------------------------------------------------
# Access & Security
# ---------------------------------------------------------------------------


@router.get("/access/denied-trend")
def get_denied_trend():
    """Denied access attempts over time."""
    rows = execute_query(f"""
        SELECT
            CAST(event_date AS DATE) as day,
            SUM(event_count) as denied_count
        FROM {CATALOG_SCHEMA}.v_ai_access_audit
        WHERE is_denied = true
          AND event_date >= DATEADD(DAY, -30, CURRENT_DATE())
        GROUP BY CAST(event_date AS DATE)
        ORDER BY day
    """)
    return serialize_rows(rows)


@router.get("/access/top-denied-users")
def get_top_denied_users():
    """Top users with denied access attempts."""
    rows = execute_query(f"""
        SELECT
            user_email,
            SUM(event_count) as denied_count,
            COUNT(DISTINCT CAST(event_date AS DATE)) as days_with_denials
        FROM {CATALOG_SCHEMA}.v_ai_access_audit
        WHERE is_denied = true
          AND event_date >= DATEADD(DAY, -30, CURRENT_DATE())
        GROUP BY user_email
        ORDER BY denied_count DESC
        LIMIT 15
    """)
    return serialize_rows(rows)


@router.get("/access/by-service")
def get_access_by_service():
    """Access events by service and action."""
    rows = execute_query(f"""
        SELECT
            service_name,
            action_name,
            SUM(CASE WHEN is_denied = true THEN event_count ELSE 0 END) as denied_count,
            SUM(CASE WHEN is_denied = false THEN event_count ELSE 0 END) as allowed_count,
            SUM(event_count) as total_count
        FROM {CATALOG_SCHEMA}.v_ai_access_audit
        WHERE event_date >= DATEADD(DAY, -30, CURRENT_DATE())
        GROUP BY service_name, action_name
        ORDER BY total_count DESC
        LIMIT 30
    """)
    return serialize_rows(rows)


@router.get("/access/recent-denied")
def get_recent_denied():
    """Recent denied access events."""
    rows = execute_query(f"""
        SELECT
            CAST(event_date AS DATE) as event_date,
            user_email,
            action_name,
            service_name,
            source_ip_address,
            status_code,
            event_count
        FROM {CATALOG_SCHEMA}.v_ai_access_audit
        WHERE is_denied = true
        ORDER BY event_date DESC
        LIMIT 50
    """)
    return serialize_rows(rows)


# ---------------------------------------------------------------------------
# Endpoint Health
# ---------------------------------------------------------------------------


@router.get("/health/utilization-tiers")
def get_utilization_tiers():
    """Distribution of endpoints by utilization tier."""
    rows = execute_query(f"""
        SELECT
            utilization_tier,
            COUNT(*) as endpoint_count
        FROM {CATALOG_SCHEMA}.v_underutilized_endpoints
        GROUP BY utilization_tier
        ORDER BY
            CASE utilization_tier
                WHEN 'Idle' THEN 1
                WHEN 'Very Low' THEN 2
                WHEN 'Low' THEN 3
                WHEN 'Moderate' THEN 4
                WHEN 'Active' THEN 5
            END
    """)
    return serialize_rows(rows)


@router.get("/health/endpoints")
def get_health_endpoints():
    """All endpoints with health/utilization data."""
    rows = execute_query(f"""
        SELECT
            endpoint_name,
            entity_type,
            entity_name,
            task,
            created_by,
            last_config_change,
            total_requests_30d,
            total_tokens_30d,
            unique_users_30d,
            last_request_time,
            utilization_tier
        FROM {CATALOG_SCHEMA}.v_underutilized_endpoints
        ORDER BY
            CASE utilization_tier
                WHEN 'Idle' THEN 1
                WHEN 'Very Low' THEN 2
                WHEN 'Low' THEN 3
                WHEN 'Moderate' THEN 4
                WHEN 'Active' THEN 5
            END,
            endpoint_name
    """)
    return serialize_rows(rows)


# ---------------------------------------------------------------------------
# Genie / Assistant Usage
# ---------------------------------------------------------------------------


@router.get("/genie/usage")
def get_genie_usage():
    """Genie/Assistant usage trends."""
    rows = execute_query(f"""
        SELECT
            CAST(event_date AS DATE) as day,
            SUM(event_count) as total_events,
            COUNT(DISTINCT initiated_by) as unique_users
        FROM {CATALOG_SCHEMA}.v_assistant_genie_usage
        WHERE event_date >= DATEADD(DAY, -30, CURRENT_DATE())
        GROUP BY CAST(event_date AS DATE)
        ORDER BY day
    """)
    return serialize_rows(rows)


@router.get("/genie/top-users")
def get_genie_top_users():
    """Top Genie/Assistant users."""
    rows = execute_query(f"""
        SELECT
            initiated_by,
            SUM(event_count) as total_events
        FROM {CATALOG_SCHEMA}.v_assistant_genie_usage
        WHERE event_date >= DATEADD(DAY, -30, CURRENT_DATE())
        GROUP BY initiated_by
        ORDER BY total_events DESC
        LIMIT 10
    """)
    return serialize_rows(rows)


# ---------------------------------------------------------------------------
# Knowledge Assistant (Policy RAG)
# ---------------------------------------------------------------------------

VS_INDEX = "cmegdemos_catalog.ai_governance.policy_chunks_vs_index"
VS_ENDPOINT = "mas-b3feefeb-endpoint"


class KAQuery(BaseModel):
    question: str


def _search_policies(question: str, num_results: int = 5) -> list[dict]:
    """Search policy chunks via Vector Search index."""
    import json as _json
    import subprocess
    host = get_databricks_host()
    token = get_access_token()

    import urllib.request
    url = f"{host}/api/2.0/vector-search/indexes/{VS_INDEX}/query"
    body = _json.dumps({
        "columns": ["chunk_id", "policy_name", "chunk_text"],
        "query_text": question,
        "num_results": num_results,
    }).encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = _json.loads(resp.read())
        results = []
        columns = [c["name"] for c in data.get("manifest", {}).get("columns", [])]
        for row in data.get("result", {}).get("data_array", []):
            results.append(dict(zip(columns, row)))
        return results
    except Exception as e:
        logger.error(f"Vector search error: {e}")
        # Fallback: use SQL LIKE search
        safe_q = question.replace("'", "''")
        keywords = [w for w in safe_q.split() if len(w) > 3][:5]
        if not keywords:
            keywords = [safe_q[:50]]
        where_clauses = " OR ".join([f"lower(chunk_text) LIKE '%{kw.lower()}%'" for kw in keywords])
        rows = execute_query(f"""
            SELECT chunk_id, policy_name, chunk_text
            FROM {CATALOG_SCHEMA}.policy_chunks
            WHERE {where_clauses}
            LIMIT {num_results}
        """)
        return rows


def _generate_answer(question: str, context_chunks: list[dict]) -> str:
    """Generate answer using foundation model via serving endpoint."""
    from openai import OpenAI
    host = get_databricks_host()
    token = get_access_token()

    client = OpenAI(base_url=f"{host}/serving-endpoints", api_key=token)

    context = "\n\n---\n\n".join([
        f"**{c.get('policy_name', 'Policy')}**:\n{c.get('chunk_text', '')}"
        for c in context_chunks
    ])

    response = client.chat.completions.create(
        model="databricks-claude-sonnet-4",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are the MT&T AI Governance Policy Assistant. Answer questions about "
                    "AI governance policies, data access regulations, security controls, cost "
                    "management, and platform acceptable use based ONLY on the provided policy "
                    "context. Be specific, cite the relevant policy by name, and provide "
                    "actionable guidance. If the context doesn't contain the answer, say so."
                ),
            },
            {
                "role": "user",
                "content": f"Policy Context:\n{context}\n\n---\n\nQuestion: {question}",
            },
        ],
        max_tokens=1024,
        temperature=0.1,
    )
    return response.choices[0].message.content


@router.post("/ka/ask")
def knowledge_assistant_ask(query: KAQuery):
    """Ask the Knowledge Assistant a question about AI governance policies."""
    try:
        # Step 1: Retrieve relevant policy chunks
        chunks = _search_policies(query.question, num_results=5)
        if not chunks:
            return {
                "answer": "I couldn't find relevant policy information for your question. Please try rephrasing or ask about specific topics like data access, model governance, cost management, security, Genie rooms, or acceptable use.",
                "sources": [],
            }

        # Step 2: Generate answer with LLM
        answer = _generate_answer(query.question, chunks)

        # Step 3: Return answer with sources
        sources = list({c.get("policy_name", "Unknown") for c in chunks})
        return {
            "answer": answer,
            "sources": sources,
        }
    except Exception as e:
        logger.error(f"Knowledge Assistant error: {e}")
        return {"answer": f"Error processing your question: {str(e)}", "sources": []}


@router.get("/ka/policies")
def get_policy_list():
    """Get list of available policies."""
    rows = execute_query(f"""
        SELECT DISTINCT policy_name, source_file, COUNT(*) as chunk_count
        FROM {CATALOG_SCHEMA}.policy_chunks
        GROUP BY policy_name, source_file
        ORDER BY policy_name
    """)
    return serialize_rows(rows)
