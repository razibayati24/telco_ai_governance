# Telecom AI Landscape - AI Agentic FinOps Assistant

An autonomous AI agent built on the Databricks Lakehouse Platform that continuously monitors, analyzes, and acts on platform telemetry data to ensure GenAI workloads are cost-effective, high-performing, and properly governed.

Built for telecom enterprises scaling AI across platform workspaces — providing real-time governance over model serving endpoints, foundation model APIs, AI agents, and data pipelines.

## Capabilities

The platform delivers **7 core capabilities** mapped directly to telecom AI governance requirements:

| # | Capability | Description | Frequency | App Location |
|---|-----------|-------------|-----------|--------------|
| 1 | **Cost Analysis** | Per-agent, per-model cost attribution and trend analysis. Tracks spending across Anthropic, OpenAI, Gemini, Model Training, and Real-Time Inference SKUs. Detects cost anomalies exceeding 2x the 7-day rolling average. | Hourly / On-demand | Cost & Anomalies tab |
| 2 | **Performance Monitoring** | Latency, throughput, and error rate tracking with SLA validation (GREEN < 2s, YELLOW < 5s, RED >= 5s). Per-model latency breakdown, token consumption trends, and TTFB tracking. | Real-time / Every 15 min | Performance tab |
| 3 | **Quality Evaluation** | MLflow experiment tracking with run success/failure rates, duration trends, and drift detection. Flags metrics where values exceed 2 standard deviations from baseline. | Daily / On-demand | Quality Evaluation tab |
| 4 | **Query Optimization** | Identifies expensive queries from agent workloads. Tracks query duration distribution, cache hit rates, data spill volumes, and surfaces the top 10 most expensive queries with user attribution. | Daily | Query Optimization tab |
| 5 | **Security Auditing** | Unauthorized access detection across AI services (modelServing, mlflow, aiGateway, vectorSearch, aibi). Monitors denied access trends, flags repeat offenders, and tracks access patterns by service. | Continuous / Every 5 min | Security Audit tab |
| 6 | **Anomaly Detection** | Cost spike detection (>2x rolling 7-day avg), latency anomalies, and quality degradation alerts. Combined with cost analysis in a unified view with visual anomaly markers. | Continuous | Cost & Anomalies tab |
| 7 | **Natural Language Interface** | Two AI-powered chat assistants available from any screen: **Genie Q&A** (queries live system table data via foundation model + SQL execution) and **Policy Assistant** (RAG-based Q&A over telecom governance policies via Vector Search + LLM). | On-demand | Floating chat popups |

## Architecture

```
  ┌─────────────────────┐   ┌───────────────────────────┐
  │    Genie Q&A        │   │   Policy Assistant (RAG)   │
  │    LLM Endpoint     │   │   Vector Search +          │
  │    + SQL Execution  │   │   LLM Endpoint             │
  └────────┬────────────┘   └────────────┬──────────────┘
           │  Floating chat popups       │
           │  (available on every screen)│
┌──────────▼─────────────────────────────▼────────────────┐
│                  Telecom AI Landscape (App)              │
│            React + FastAPI + Recharts (Dark Theme)       │
├──────────┬──────────┬──────────┬──────────┬─────────────┤
│ Cost &   │Perform-  │ Quality  │  Query   │  Security   │
│Anomalies │ ance     │ Eval     │  Optim   │  Audit      │
└────┬─────┴────┬─────┴────┬─────┴────┬─────┴─────┬───────┘
     │          │          │          │           │
┌────▼──────────▼──────────▼──────────▼───────────▼───────┐
│              Materialized Delta Tables (30-day)          │
│              <your_catalog>.ai_governance.*              │
└────┬──────────┬──────────┬──────────┬──────────┬────────┘
     │          │          │          │          │
┌────▼───┐ ┌───▼────┐ ┌───▼───┐ ┌───▼────┐ ┌───▼──────┐
│system. │ │system. │ │system.│ │system. │ │system.   │
│serving │ │ai_     │ │billing│ │access  │ │mlflow /  │
│        │ │gateway │ │       │ │        │ │query     │
└────────┘ └────────┘ └───────┘ └────────┘ └──────────┘
```

## System Tables & Materialized Data

All queries hit **pre-aggregated materialized Delta tables** (30-day snapshots) for sub-second dashboard performance. No live system table scans at query time.

### Source System Tables

| System Table | Records | What It Provides |
|---|---|---|
| `system.serving.endpoint_usage` | ~99M | Request-level model serving data: tokens, requester, status codes |
| `system.serving.served_entities` | Thousands | Endpoint configurations: model types, throughput settings |
| `system.ai_gateway.usage` | ~148K | AI Gateway routing, latency, token details per model |
| `system.billing.usage` | Large | Cost data by SKU (Anthropic, OpenAI, Gemini, Training, Inference) |
| `system.access.audit` | Large | Access audit logs: denied attempts, service-level actions |
| `system.access.assistant_events` | ~322K | Genie room and AI Assistant activity |
| `system.mlflow.runs_latest` | ~190K | MLflow experiment runs: status, duration, parameters |
| `system.mlflow.run_metrics_history` | ~3.3M | Run metric values over time for drift detection |
| `system.query.history` | ~50M | Query execution history: duration, bytes read, spill, cache |

### Materialized Tables (in `<your_catalog>.ai_governance`)

| Table | Source | Used By |
|---|---|---|
| `m_serving_endpoint_daily` | `system.serving.endpoint_usage` + `served_entities` | Cost & Anomalies, Performance, Overview |
| `m_ai_gateway_daily` | `system.ai_gateway.usage` | Performance (latency, throughput, SLA) |
| `m_ai_cost_daily` | `system.billing.usage` | Cost & Anomalies, Overview |
| `m_cost_anomalies` | Derived from `m_ai_cost_daily` | Cost & Anomalies (spike detection) |
| `m_ai_access_audit` | `system.access.audit` | Security Audit |
| `m_underutilized_endpoints` | `system.serving.*` | Overview (endpoint health KPIs) |
| `m_assistant_genie_usage` | `system.access.assistant_events` | Overview (Genie activity) |
| `m_mlflow_quality_daily` | `system.mlflow.runs_latest` + `experiments_latest` | Quality Evaluation |
| `m_mlflow_metrics_daily` | `system.mlflow.run_metrics_history` | Quality Evaluation (drift detection) |
| `m_query_optimization` | `system.query.history` | Query Optimization |
| `m_expensive_queries` | `system.query.history` (top 200, >30s) | Query Optimization (detail table) |

## Policy Knowledge Assistant

RAG-based Q&A over **6 telecom-specific governance policy documents**:

| Policy | Key Topics |
|--------|-----------|
| **Data Classification & Security Levels** | Four levels defined: **Unrestricted** (public data, coverage maps), **Sensitive** (internal KPIs, vendor pricing), **Secure** (CDRs, CPNI, SOX financials), **PII** (subscriber names, IMEI, location data) |
| **Internal Data Use & AI** | Approved uses (network optimization, fraud detection, churn prediction), prohibited uses (raw CDR training, subscriber profiling, external model PII exposure) |
| **Internal Access Levels & RBAC** | Level 1 (NOC), Level 2 (Business Analytics), Level 3 (Revenue Assurance/Fraud), Level 4 (Data Privacy/Compliance), Level 5 (Platform Admin) |
| **SOX Compliance for AI Systems** | SOX-relevant model controls, change management, audit trails, segregation of duties, quarterly testing requirements |
| **CPNI Protection & AI Compliance** | FCC 47 U.S.C. 222, CPNI in AI models, subscriber consent, breach response procedures |
| **Network Data Governance** | Cell tower data classification, RAN configs, real-time AI constraints, vendor data sharing rules |

Policy documents stored in: `Volumes/<your_catalog>/ai_governance/policy_documents/`
Vector Search index: `<your_catalog>.ai_governance.policy_chunks_vs_index` (GTE-Large embeddings)

## App Dashboard

| Tab | What It Shows |
|-----|---------------|
| **Overview** | KPIs: Total AI Cost, Avg Latency, MLflow Success Rate, Query Failure Rate, Denied Access, Cost Anomalies. Plus daily request and cost trend charts. |
| **Cost & Anomalies** | Stacked cost trends by provider with red anomaly markers, cost distribution pie chart, per-endpoint token consumption, anomaly alerts table |
| **Performance** | Latency by model, throughput trends, error rate trends, SLA validation table (GREEN/YELLOW/RED), token consumption by model |
| **Quality Evaluation** | MLflow run success rate trend, experiment run counts, duration trends, metrics table with drift detection, failed runs by user |
| **Query Optimization** | Daily query volume, cache hit rate, duration by statement type, data spill trends, top 10 expensive queries, users by duration |
| **Security Audit** | Denied access trends, top flagged users, access by service breakdown, recent denied events table |
| **Floating Popups** | Genie Q&A (NL queries with SQL execution) + Policy Assistant (RAG over telecom policies) — both available simultaneously from any tab |

## Setup

### Prerequisites
- Databricks workspace with system tables enabled
- SQL warehouse (Serverless Pro recommended)
- Access to `system.*` schemas
- Foundation model serving endpoint (e.g., `databricks-claude-sonnet-4`)
- Vector Search endpoint

### Step 1: Configure Environment

Copy `.env.example` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABRICKS_CATALOG` | Yes | Your Unity Catalog name |
| `DATABRICKS_SCHEMA` | No | Schema name (default: `ai_governance`) |
| `DATABRICKS_WAREHOUSE_ID` | Yes | SQL Warehouse ID |
| `DATABRICKS_LLM_ENDPOINT` | Yes | Foundation model endpoint name |
| `DATABRICKS_VS_ENDPOINT` | Yes | Vector Search endpoint name |
| `DATABRICKS_GENIE_SPACE_ID` | No | Created by notebook 03 |
| `DATABRICKS_PROFILE` | No | CLI profile for local dev (default: `DEFAULT`) |

### Step 2: Run Notebooks

Run notebooks **in order** on your Databricks workspace. Each notebook prompts for **catalog** and **schema** via widgets:

```
01_setup_governance_views.py        -> Creates schema and v_* governance views on system tables
02_setup_policy_knowledge_base.py   -> Creates policy KB, chunks table, Vector Search index
03_deploy_genie_room.py             -> Creates Genie room with governance views
04_materialize_app_tables.py        -> Creates the 11 m_* Delta tables the app reads from
                                       (30-day rolling window; re-run daily to refresh)
```

Notebook 03 will output a `GENIE_SPACE_ID` — save it for your `app.yaml`.

**Important:** The app (`server/config.py`) queries the `m_*` materialized tables, *not* the `v_*`
views. Notebook 04 is **required** on a fresh workspace — skipping it will cause every dashboard tab
to return empty or error. To keep data fresh, schedule notebook 04 on a daily Lakeflow job.

### Step 3: Update `app.yaml`

Replace the `${...}` placeholders in `app.yaml` with your actual values:

```yaml
env:
  - name: 'DATABRICKS_WAREHOUSE_ID'
    value: '<your-warehouse-id>'
  - name: 'DATABRICKS_CATALOG'
    value: '<your-catalog>'
  - name: 'DATABRICKS_LLM_ENDPOINT'
    value: '<your-llm-endpoint>'
  # ... etc
resources:
  - name: sql-warehouse
    sql_warehouse:
      id: '<your-warehouse-id>'
      permission: CAN_USE
  - name: serving-endpoint
    serving_endpoint:
      name: '<your-llm-endpoint>'
      permission: CAN_QUERY
```

### Step 4: Deploy the App

```bash
databricks apps create ai-governance-monitor --profile=<your-profile>
databricks apps deploy ai-governance-monitor \
  --source-code-path /Workspace/Users/<you>/databricks_apps/ai-governance-monitor
```

### Step 5: Grant Service Principal Access

```sql
GRANT USE CATALOG ON CATALOG <your_catalog> TO `<app-sp-uuid>`;
GRANT USE SCHEMA ON SCHEMA <your_catalog>.ai_governance TO `<app-sp-uuid>`;
GRANT SELECT ON SCHEMA <your_catalog>.ai_governance TO `<app-sp-uuid>`;
```

### Refreshing Materialized Tables

All 11 `m_*` tables are 30-day snapshots built by `notebooks/04_materialize_app_tables.py`.
To refresh, simply re-run that notebook — each cell is an idempotent `CREATE OR REPLACE TABLE`.

Recommended: schedule notebook 04 as a daily Lakeflow Job so dashboards always show the last 30 days.
The `window_days` widget lets you override the rolling window (default 30).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python, FastAPI, databricks-sql-connector, databricks-sdk, openai SDK |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Recharts, Lucide icons |
| **Data** | Databricks System Tables, Unity Catalog, Delta Lake (materialized tables) |
| **AI - Genie Q&A** | Foundation Model API + live SQL execution |
| **AI - Policy Assistant** | Vector Search (GTE-Large embeddings) + Foundation Model (RAG) |
| **Infrastructure** | Databricks Apps (Serverless), SQL Warehouse (Serverless Pro) |
