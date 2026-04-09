"""API routes for AI Governance Monitor."""

import logging
from datetime import date, datetime, timedelta
from decimal import Decimal
from fastapi import APIRouter, Query
from pydantic import BaseModel
from server.config import (
    CATALOG_SCHEMA, get_databricks_host, get_access_token,
    TBL_SERVING, TBL_ENDPOINTS, TBL_ACCESS, TBL_GATEWAY, TBL_COST, TBL_GENIE,
    TBL_COST_ANOMALIES, TBL_MLFLOW_QUALITY, TBL_MLFLOW_METRICS,
    TBL_QUERY_OPT, TBL_EXPENSIVE_QUERIES,
)
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
# Overview KPIs  (single query to avoid round-trips)
# ---------------------------------------------------------------------------


@router.get("/overview/kpis")
def get_overview_kpis():
    """Get high-level KPI metrics for the overview tab."""
    try:
        rows = execute_query(f"""
            SELECT
              (SELECT COALESCE(SUM(total_dbus), 0) FROM {TBL_COST} WHERE usage_date >= DATEADD(DAY, -30, CURRENT_DATE())) AS total_cost_dbus,
              (SELECT ROUND(AVG(avg_latency_ms), 1) FROM {TBL_GATEWAY}) AS avg_latency_ms,
              (SELECT ROUND(
                  CASE WHEN SUM(succeeded) + SUM(failed) > 0
                       THEN SUM(succeeded) * 100.0 / (SUM(succeeded) + SUM(failed))
                       ELSE 0 END, 1)
               FROM {TBL_MLFLOW_QUALITY}) AS mlflow_success_rate,
              (SELECT ROUND(
                  CASE WHEN SUM(query_count) > 0
                       THEN SUM(failed) * 100.0 / SUM(query_count)
                       ELSE 0 END, 2)
               FROM {TBL_QUERY_OPT}) AS query_failure_rate,
              (SELECT COALESCE(SUM(event_count), 0) FROM {TBL_ACCESS} WHERE is_denied = true) AS denied_access,
              (SELECT COUNT(*) FROM {TBL_COST_ANOMALIES} WHERE is_anomaly = true) AS cost_anomalies
        """)
        r = rows[0] if rows else {}
        return {
            "total_cost_dbus_30d": serialize_value(r.get("total_cost_dbus", 0)),
            "avg_latency_ms": serialize_value(r.get("avg_latency_ms", 0)),
            "mlflow_success_rate": serialize_value(r.get("mlflow_success_rate", 0)),
            "query_failure_rate": serialize_value(r.get("query_failure_rate", 0)),
            "denied_access_30d": serialize_value(r.get("denied_access", 0)),
            "cost_anomalies": serialize_value(r.get("cost_anomalies", 0)),
        }
    except Exception as e:
        logger.error(f"Error fetching KPIs: {e}")
        return {"error": str(e)}


@router.get("/overview/daily-requests")
def get_daily_requests():
    rows = execute_query(f"""
        SELECT CAST(request_date AS DATE) as day,
               SUM(request_count) as total_requests,
               SUM(error_count) as total_errors
        FROM {TBL_SERVING}
        GROUP BY CAST(request_date AS DATE)
        ORDER BY day
    """)
    return serialize_rows(rows)


@router.get("/overview/daily-cost")
def get_daily_cost():
    rows = execute_query(f"""
        SELECT usage_date as day, cost_category, SUM(total_dbus) as total_dbus
        FROM {TBL_COST}

        GROUP BY usage_date, cost_category
        ORDER BY usage_date
    """)
    return serialize_rows(rows)


# ---------------------------------------------------------------------------
# Model Serving  (m_serving_endpoint_daily is already 30d)
# ---------------------------------------------------------------------------


@router.get("/serving/top-endpoints")
def get_top_endpoints(entity_type: str = Query(default=None)):
    where = "WHERE 1=1"
    if entity_type:
        where += f" AND entity_type = '{entity_type}'"
    rows = execute_query(f"""
        SELECT endpoint_name, entity_type,
               SUM(request_count) as total_requests,
               SUM(total_tokens) as total_tokens,
               SUM(error_count) as total_errors,
               ROUND(CASE WHEN SUM(request_count)>0 THEN SUM(error_count)*100.0/SUM(request_count) ELSE 0 END, 2) as error_rate_pct
        FROM {TBL_SERVING} {where}
        GROUP BY endpoint_name, entity_type
        ORDER BY total_requests DESC LIMIT 20
    """)
    return serialize_rows(rows)


@router.get("/serving/all-endpoints")
def get_all_serving_endpoints(entity_type: str = Query(default=None)):
    where = "WHERE 1=1"
    if entity_type:
        where += f" AND entity_type = '{entity_type}'"
    rows = execute_query(f"""
        SELECT endpoint_name, entity_type, entity_name,
               COLLECT_SET(task)[0] as task,
               SUM(request_count) as total_requests,
               SUM(total_input_tokens) as total_input_tokens,
               SUM(total_output_tokens) as total_output_tokens,
               SUM(total_tokens) as total_tokens,
               SUM(error_count) as total_errors,
               ROUND(CASE WHEN SUM(request_count)>0 THEN SUM(error_count)*100.0/SUM(request_count) ELSE 0 END, 2) as error_rate_pct,
               COUNT(DISTINCT requester) as unique_users
        FROM {TBL_SERVING} {where}
        GROUP BY endpoint_name, entity_type, entity_name
        ORDER BY total_requests DESC
    """)
    return serialize_rows(rows)


@router.get("/serving/entity-types")
def get_entity_types():
    rows = execute_query(f"SELECT DISTINCT entity_type FROM {TBL_SERVING} ORDER BY entity_type")
    return [r["entity_type"] for r in rows]


# ---------------------------------------------------------------------------
# AI Gateway
# ---------------------------------------------------------------------------


@router.get("/gateway/by-model")
def get_gateway_by_model():
    rows = execute_query(f"""
        SELECT destination_model,
               SUM(request_count) as total_requests,
               SUM(total_input_tokens) as total_input_tokens,
               SUM(total_output_tokens) as total_output_tokens,
               SUM(total_tokens) as total_tokens,
               ROUND(AVG(avg_latency_ms),1) as avg_latency_ms,
               ROUND(AVG(avg_ttfb_ms),1) as avg_ttfb_ms,
               SUM(error_count) as total_errors
        FROM {TBL_GATEWAY}

        GROUP BY destination_model ORDER BY total_requests DESC
    """)
    return serialize_rows(rows)


@router.get("/gateway/daily-tokens")
def get_gateway_daily_tokens():
    rows = execute_query(f"""
        SELECT CAST(request_date AS DATE) as day, destination_model,
               SUM(total_input_tokens) as input_tokens,
               SUM(total_output_tokens) as output_tokens,
               SUM(total_tokens) as total_tokens
        FROM {TBL_GATEWAY}

        GROUP BY CAST(request_date AS DATE), destination_model ORDER BY day
    """)
    return serialize_rows(rows)


@router.get("/gateway/latency-by-model")
def get_latency_by_model():
    rows = execute_query(f"""
        SELECT destination_model,
               ROUND(AVG(avg_latency_ms),1) as avg_latency_ms,
               ROUND(AVG(avg_ttfb_ms),1) as avg_ttfb_ms,
               SUM(request_count) as total_requests
        FROM {TBL_GATEWAY}

        GROUP BY destination_model ORDER BY avg_latency_ms DESC
    """)
    return serialize_rows(rows)


# ---------------------------------------------------------------------------
# Cost Observatory
# ---------------------------------------------------------------------------


@router.get("/cost/daily")
def get_cost_daily():
    rows = execute_query(f"""
        SELECT usage_date as day, cost_category, SUM(total_dbus) as total_dbus
        FROM {TBL_COST}

        GROUP BY usage_date, cost_category ORDER BY usage_date
    """)
    return serialize_rows(rows)


@router.get("/cost/distribution")
def get_cost_distribution():
    rows = execute_query(f"""
        SELECT cost_category, SUM(total_dbus) as total_dbus
        FROM {TBL_COST}

        GROUP BY cost_category ORDER BY total_dbus DESC
    """)
    return serialize_rows(rows)


@router.get("/cost/by-sku")
def get_cost_by_sku():
    rows = execute_query(f"""
        SELECT sku_name, cost_category, SUM(total_dbus) as total_dbus
        FROM {TBL_COST}

        GROUP BY sku_name, cost_category ORDER BY total_dbus DESC
    """)
    return serialize_rows(rows)


# ---------------------------------------------------------------------------
# Cost Anomalies
# ---------------------------------------------------------------------------


@router.get("/cost/anomalies")
def get_cost_anomalies():
    rows = execute_query(f"""
        SELECT usage_date, cost_category, daily_dbus, rolling_avg_7d,
               is_anomaly, pct_change
        FROM {TBL_COST_ANOMALIES}
        ORDER BY usage_date DESC
    """)
    return serialize_rows(rows)


@router.get("/cost/endpoint-tokens")
def get_cost_endpoint_tokens():
    """Top 15 endpoints by total token consumption."""
    rows = execute_query(f"""
        SELECT endpoint_name,
               SUM(total_input_tokens) as total_input_tokens,
               SUM(total_output_tokens) as total_output_tokens,
               SUM(total_tokens) as total_tokens
        FROM {TBL_SERVING}
        GROUP BY endpoint_name
        ORDER BY total_tokens DESC
        LIMIT 15
    """)
    return serialize_rows(rows)


# ---------------------------------------------------------------------------
# Performance Monitoring
# ---------------------------------------------------------------------------


@router.get("/performance/sla")
def get_performance_sla():
    """SLA validation - model latency vs thresholds."""
    rows = execute_query(f"""
        SELECT destination_model,
               ROUND(AVG(avg_latency_ms), 1) as avg_latency,
               ROUND(MAX(avg_latency_ms), 1) as max_latency,
               SUM(request_count) as total_requests,
               ROUND(CASE WHEN SUM(request_count) > 0
                    THEN SUM(error_count) * 100.0 / SUM(request_count)
                    ELSE 0 END, 2) as error_rate,
               CASE
                   WHEN AVG(avg_latency_ms) < 2000 THEN 'GREEN'
                   WHEN AVG(avg_latency_ms) < 5000 THEN 'YELLOW'
                   ELSE 'RED'
               END as sla_status
        FROM {TBL_GATEWAY}
        GROUP BY destination_model
        ORDER BY avg_latency DESC
    """)
    return serialize_rows(rows)


@router.get("/performance/daily-requests")
def get_performance_daily_requests():
    """Daily request count trend from gateway."""
    rows = execute_query(f"""
        SELECT CAST(request_date AS DATE) as day,
               SUM(request_count) as total_requests
        FROM {TBL_GATEWAY}
        GROUP BY CAST(request_date AS DATE)
        ORDER BY day
    """)
    return serialize_rows(rows)


@router.get("/performance/daily-errors")
def get_performance_daily_errors():
    """Daily error rate trend from gateway."""
    rows = execute_query(f"""
        SELECT CAST(request_date AS DATE) as day,
               SUM(request_count) as total_requests,
               SUM(error_count) as total_errors,
               ROUND(CASE WHEN SUM(request_count) > 0
                    THEN SUM(error_count) * 100.0 / SUM(request_count)
                    ELSE 0 END, 2) as error_rate_pct
        FROM {TBL_GATEWAY}
        GROUP BY CAST(request_date AS DATE)
        ORDER BY day
    """)
    return serialize_rows(rows)


@router.get("/performance/model-tokens")
def get_performance_model_tokens():
    """Top models by token consumption."""
    rows = execute_query(f"""
        SELECT destination_model,
               SUM(total_input_tokens) as total_input_tokens,
               SUM(total_output_tokens) as total_output_tokens,
               SUM(total_tokens) as total_tokens
        FROM {TBL_GATEWAY}
        GROUP BY destination_model
        ORDER BY total_tokens DESC
        LIMIT 15
    """)
    return serialize_rows(rows)


# ---------------------------------------------------------------------------
# Quality Evaluation  (MLflow)
# ---------------------------------------------------------------------------


@router.get("/quality/run-trend")
def get_quality_run_trend():
    """Daily run counts with success/fail."""
    rows = execute_query(f"""
        SELECT run_date as day,
               SUM(run_count) as total_runs,
               SUM(succeeded) as succeeded,
               SUM(failed) as failed,
               ROUND(CASE WHEN SUM(succeeded) + SUM(failed) > 0
                    THEN SUM(succeeded) * 100.0 / (SUM(succeeded) + SUM(failed))
                    ELSE 0 END, 1) as success_rate
        FROM {TBL_MLFLOW_QUALITY}
        GROUP BY run_date
        ORDER BY run_date
    """)
    return serialize_rows(rows)


@router.get("/quality/experiments")
def get_quality_experiments():
    """Top experiments by run count."""
    rows = execute_query(f"""
        SELECT experiment_name,
               SUM(run_count) as total_runs,
               SUM(succeeded) as succeeded,
               SUM(failed) as failed,
               ROUND(AVG(avg_duration_sec), 1) as avg_duration_sec,
               COUNT(DISTINCT created_by) as unique_users
        FROM {TBL_MLFLOW_QUALITY}
        GROUP BY experiment_name
        ORDER BY total_runs DESC
        LIMIT 10
    """)
    return serialize_rows(rows)


@router.get("/quality/metrics")
def get_quality_metrics():
    """Top metrics with stats."""
    rows = execute_query(f"""
        SELECT metric_name,
               ROUND(AVG(avg_value), 4) as avg_value,
               ROUND(MIN(min_value), 4) as min_value,
               ROUND(MAX(max_value), 4) as max_value,
               ROUND(AVG(stddev_value), 4) as stddev_value,
               SUM(run_count) as total_runs
        FROM {TBL_MLFLOW_METRICS}
        GROUP BY metric_name
        ORDER BY total_runs DESC
        LIMIT 20
    """)
    return serialize_rows(rows)


@router.get("/quality/failed-runs")
def get_quality_failed_runs():
    """Failed runs grouped by user."""
    rows = execute_query(f"""
        SELECT created_by,
               SUM(failed) as total_failed,
               SUM(run_count) as total_runs,
               ROUND(CASE WHEN SUM(run_count) > 0
                    THEN SUM(failed) * 100.0 / SUM(run_count)
                    ELSE 0 END, 1) as failure_rate
        FROM {TBL_MLFLOW_QUALITY}
        WHERE failed > 0
        GROUP BY created_by
        ORDER BY total_failed DESC
        LIMIT 20
    """)
    return serialize_rows(rows)


@router.get("/quality/duration-trend")
def get_quality_duration_trend():
    """Average run duration per day."""
    rows = execute_query(f"""
        SELECT run_date as day,
               ROUND(AVG(avg_duration_sec), 1) as avg_duration_sec
        FROM {TBL_MLFLOW_QUALITY}
        GROUP BY run_date
        ORDER BY run_date
    """)
    return serialize_rows(rows)


# ---------------------------------------------------------------------------
# Query Optimization
# ---------------------------------------------------------------------------


@router.get("/queries/daily")
def get_queries_daily():
    """Daily aggregated query stats."""
    rows = execute_query(f"""
        SELECT query_date as day,
               SUM(query_count) as total_queries,
               ROUND(AVG(avg_duration_ms), 1) as avg_duration_ms,
               SUM(total_read_bytes) as total_read_bytes,
               SUM(total_spill_bytes) as total_spill_bytes,
               SUM(cache_hits) as cache_hits,
               SUM(succeeded) as succeeded,
               SUM(failed) as failed
        FROM {TBL_QUERY_OPT}
        GROUP BY query_date
        ORDER BY query_date
    """)
    return serialize_rows(rows)


@router.get("/queries/by-type")
def get_queries_by_type():
    """Query stats grouped by statement type."""
    rows = execute_query(f"""
        SELECT statement_type,
               SUM(query_count) as total_queries,
               ROUND(AVG(avg_duration_ms), 1) as avg_duration_ms,
               ROUND(MAX(max_duration_ms), 1) as max_duration_ms,
               SUM(total_duration_ms) as total_duration_ms,
               SUM(total_read_bytes) as total_read_bytes,
               SUM(total_spill_bytes) as total_spill_bytes,
               SUM(cache_hits) as cache_hits
        FROM {TBL_QUERY_OPT}
        GROUP BY statement_type
        ORDER BY total_queries DESC
    """)
    return serialize_rows(rows)


@router.get("/queries/expensive")
def get_queries_expensive():
    """Top expensive queries."""
    rows = execute_query(f"""
        SELECT start_time, executed_by, statement_type,
               statement_preview, total_duration_ms,
               execution_duration_ms, read_bytes, read_rows,
               spilled_local_bytes, warehouse_id, execution_status
        FROM {TBL_EXPENSIVE_QUERIES}
        ORDER BY total_duration_ms DESC
        LIMIT 10
    """)
    return serialize_rows(rows)


@router.get("/queries/by-user")
def get_queries_by_user():
    """Top users by total query duration."""
    rows = execute_query(f"""
        SELECT executed_by,
               SUM(query_count) as total_queries,
               SUM(total_duration_ms) as total_duration_ms,
               ROUND(AVG(avg_duration_ms), 1) as avg_duration_ms,
               SUM(total_read_bytes) as total_read_bytes,
               SUM(total_spill_bytes) as total_spill_bytes
        FROM {TBL_QUERY_OPT}
        GROUP BY executed_by
        ORDER BY total_duration_ms DESC
        LIMIT 15
    """)
    return serialize_rows(rows)


# ---------------------------------------------------------------------------
# Access & Security  (m_ai_access_audit is already 30d)
# ---------------------------------------------------------------------------


@router.get("/access/denied-trend")
def get_denied_trend():
    rows = execute_query(f"""
        SELECT CAST(event_date AS DATE) as day, SUM(event_count) as denied_count
        FROM {TBL_ACCESS} WHERE is_denied = true
        GROUP BY CAST(event_date AS DATE) ORDER BY day
    """)
    return serialize_rows(rows)


@router.get("/access/top-denied-users")
def get_top_denied_users():
    rows = execute_query(f"""
        SELECT user_email, SUM(event_count) as denied_count,
               COUNT(DISTINCT CAST(event_date AS DATE)) as days_with_denials
        FROM {TBL_ACCESS} WHERE is_denied = true
        GROUP BY user_email ORDER BY denied_count DESC LIMIT 15
    """)
    return serialize_rows(rows)


@router.get("/access/by-service")
def get_access_by_service():
    rows = execute_query(f"""
        SELECT service_name, action_name,
               SUM(CASE WHEN is_denied THEN event_count ELSE 0 END) as denied_count,
               SUM(CASE WHEN NOT is_denied THEN event_count ELSE 0 END) as allowed_count,
               SUM(event_count) as total_count
        FROM {TBL_ACCESS}
        GROUP BY service_name, action_name ORDER BY total_count DESC LIMIT 30
    """)
    return serialize_rows(rows)


@router.get("/access/recent-denied")
def get_recent_denied():
    rows = execute_query(f"""
        SELECT CAST(event_date AS DATE) as event_date, user_email, action_name,
               service_name, source_ip_address, status_code, event_count
        FROM {TBL_ACCESS} WHERE is_denied = true
        ORDER BY event_date DESC LIMIT 50
    """)
    return serialize_rows(rows)


# ---------------------------------------------------------------------------
# Endpoint Health  (m_underutilized_endpoints is already snapshot)
# ---------------------------------------------------------------------------


@router.get("/health/utilization-tiers")
def get_utilization_tiers():
    rows = execute_query(f"""
        SELECT utilization_tier, COUNT(*) as endpoint_count
        FROM {TBL_ENDPOINTS}
        GROUP BY utilization_tier
        ORDER BY CASE utilization_tier
            WHEN 'Idle' THEN 1 WHEN 'Very Low' THEN 2
            WHEN 'Low' THEN 3 WHEN 'Moderate' THEN 4 WHEN 'Active' THEN 5 END
    """)
    return serialize_rows(rows)


@router.get("/health/endpoints")
def get_health_endpoints():
    rows = execute_query(f"""
        SELECT endpoint_name, entity_type, entity_name, task, created_by,
               last_config_change, total_requests_30d, total_tokens_30d,
               unique_users_30d, last_request_time, utilization_tier
        FROM {TBL_ENDPOINTS}
        ORDER BY CASE utilization_tier
            WHEN 'Idle' THEN 1 WHEN 'Very Low' THEN 2
            WHEN 'Low' THEN 3 WHEN 'Moderate' THEN 4 WHEN 'Active' THEN 5 END,
            endpoint_name
    """)
    return serialize_rows(rows)


# ---------------------------------------------------------------------------
# Genie / Assistant Usage
# ---------------------------------------------------------------------------


@router.get("/genie/usage")
def get_genie_usage():
    rows = execute_query(f"""
        SELECT CAST(event_date AS DATE) as day,
               SUM(event_count) as total_events,
               COUNT(DISTINCT initiated_by) as unique_users
        FROM {TBL_GENIE}

        GROUP BY CAST(event_date AS DATE) ORDER BY day
    """)
    return serialize_rows(rows)


@router.get("/genie/top-users")
def get_genie_top_users():
    rows = execute_query(f"""
        SELECT initiated_by, SUM(event_count) as total_events
        FROM {TBL_GENIE}

        GROUP BY initiated_by ORDER BY total_events DESC LIMIT 10
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
        safe_q = question.replace("'", "''")
        keywords = [w for w in safe_q.split() if len(w) > 3][:5]
        if not keywords:
            keywords = [safe_q[:50]]
        where_clauses = " OR ".join([f"lower(chunk_text) LIKE '%{kw.lower()}%'" for kw in keywords])
        rows = execute_query(f"""
            SELECT chunk_id, policy_name, chunk_text
            FROM {CATALOG_SCHEMA}.policy_chunks
            WHERE {where_clauses} LIMIT {num_results}
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
            {"role": "system", "content": (
                "You are the Telecom AI Governance Policy Assistant. Answer questions about "
                "telecom data classification levels (Unrestricted, Sensitive, Secure, PII), "
                "internal access levels (Level 1-5), SOX compliance for AI systems, CPNI "
                "protection, network data governance, and approved/prohibited AI uses based "
                "ONLY on the provided policy context. Be specific, cite the relevant policy "
                "by name, and provide actionable guidance. If the context doesn't contain "
                "the answer, say so. Keep answers concise - one to two paragraphs max."
            )},
            {"role": "user", "content": f"Policy Context:\n{context}\n\n---\n\nQuestion: {question}"},
        ],
        max_tokens=1024,
        temperature=0.1,
    )
    return response.choices[0].message.content


@router.post("/ka/ask")
def knowledge_assistant_ask(query: KAQuery):
    try:
        chunks = _search_policies(query.question, num_results=5)
        if not chunks:
            return {
                "answer": "I couldn't find relevant policy information for your question. Please try rephrasing.",
                "sources": [],
            }
        answer = _generate_answer(query.question, chunks)
        sources = list({c.get("policy_name", "Unknown") for c in chunks})
        return {"answer": answer, "sources": sources}
    except Exception as e:
        logger.error(f"Knowledge Assistant error: {e}")
        return {"answer": f"Error processing your question: {str(e)}", "sources": []}


@router.get("/ka/policies")
def get_policy_list():
    rows = execute_query(f"""
        SELECT DISTINCT policy_name, source_file, COUNT(*) as chunk_count
        FROM {CATALOG_SCHEMA}.policy_chunks
        GROUP BY policy_name, source_file ORDER BY policy_name
    """)
    return serialize_rows(rows)


# ---------------------------------------------------------------------------
# Genie Room In-App Chat (API proxy)
# ---------------------------------------------------------------------------

GENIE_SPACE_ID = "01f1336d23c21dbeaf01c8b966940ff8"


class GenieQuery(BaseModel):
    question: str
    conversation_id: str | None = None


@router.post("/genie/ask")
def genie_ask(query: GenieQuery):
    """Answer questions about AI operations using foundation model + SQL.
    Uses the same approach as the Policy Assistant but queries governance tables directly.
    """
    from openai import OpenAI
    host = get_databricks_host()
    token = get_access_token()

    try:
        # Use foundation model to generate SQL and answer
        client = OpenAI(base_url=f"{host}/serving-endpoints", api_key=token)

        table_context = """Available tables in cmegdemos_catalog.ai_governance (all pre-aggregated, 30-day window):

1. m_serving_endpoint_daily: request_date, endpoint_name, entity_type (FOUNDATION_MODEL/CUSTOM_MODEL/EXTERNAL_MODEL), entity_name, task, requester, status_code, request_count, total_input_tokens, total_output_tokens, total_tokens, error_count, error_rate_pct

2. m_ai_gateway_daily: request_date, endpoint_name, destination_type, destination_name, destination_model, requester, requester_type, api_type, status_code, request_count, total_input_tokens, total_output_tokens, total_tokens, avg_latency_ms, avg_ttfb_ms, error_count

3. m_ai_cost_daily: usage_date, sku_name, cost_category (Anthropic Model Serving/OpenAI Model Serving/Gemini Model Serving/Model Training/Real-Time Inference), total_dbus

4. m_underutilized_endpoints: endpoint_name, entity_type, entity_name, task, created_by, last_config_change, total_requests_30d, total_tokens_30d, unique_users_30d, last_request_time, utilization_tier (Idle/Very Low/Low/Moderate/Active)

5. m_ai_access_audit: event_date, user_email, action_name, service_name, source_ip_address, status_code, is_denied (boolean), event_count

6. m_cost_anomalies: usage_date, cost_category, daily_dbus, rolling_avg_7d, is_anomaly (boolean), pct_change

7. m_mlflow_quality_daily: run_date, experiment_name, experiment_id, created_by, status, run_count, avg_duration_sec, succeeded, failed

8. m_query_optimization: query_date, executed_by, statement_type, compute_type, warehouse_id, client_application, query_count, avg_duration_ms, max_duration_ms, total_duration_ms, avg_exec_ms, avg_compile_ms, total_read_bytes, total_read_rows, total_spill_bytes, succeeded, failed, cache_hits"""

        response = client.chat.completions.create(
            model="databricks-claude-sonnet-4",
            messages=[
                {"role": "system", "content": f"""You are an AI FinOps analyst for the Telecom AI Landscape platform.

{table_context}

Rules:
- Be brief. Respond in one short paragraph with the key numbers and insight.
- Do NOT show SQL queries in your response. Generate them silently in a hidden ```sql block so the system can execute them, but never surface them to the user.
- Use concrete numbers (e.g. "12.1M DBUs", "7,729 idle endpoints", "avg latency 342ms").
- If you spot something concerning, call it out in one sentence.
- No bullet lists, no headers, no verbose explanations. Just a concise paragraph."""},
                {"role": "user", "content": query.question},
            ],
            max_tokens=1024,
            temperature=0.1,
        )
        answer = response.choices[0].message.content

        # Extract and execute SQL silently, enrich the answer with real data
        sql_text = None
        if "```sql" in answer:
            parts = answer.split("```sql")
            if len(parts) > 1:
                sql_text = parts[1].split("```")[0].strip()
            # Strip the SQL block from the visible answer
            clean = answer
            while "```sql" in clean:
                before = clean[:clean.index("```sql")]
                after_block = clean[clean.index("```sql") + 6:]
                if "```" in after_block:
                    after = after_block[after_block.index("```") + 3:]
                else:
                    after = ""
                clean = before + after
            answer = clean.strip()

        if sql_text:
            try:
                rows = execute_query(sql_text)
                if rows:
                    result_lines = []
                    cols = list(rows[0].keys())
                    result_lines.append(" | ".join(cols))
                    result_lines.append("-" * len(result_lines[0]))
                    for row in rows[:10]:
                        vals = [str(serialize_value(row.get(c, "")))[:30] for c in cols]
                        result_lines.append(" | ".join(vals))
                    if len(rows) > 10:
                        result_lines.append(f"... and {len(rows) - 10} more rows")
                    answer += "\n\n" + "\n".join(result_lines)
            except Exception as sql_err:
                logger.warning(f"SQL execution failed: {sql_err}")

        return {
            "answer": answer,
            "conversation_id": "llm",
            "sql": sql_text,
        }
    except Exception as e:
        logger.error(f"Genie ask error: {e}")
        return {"answer": f"Error: {str(e)}", "conversation_id": None, "sql": None}
