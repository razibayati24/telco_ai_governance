# AI Governance Monitor — Databricks Apps Template

> **This is a parameterized template.** To deploy your own copy, follow
> [SETUP.md](./SETUP.md). The original AT&T-branded deployment lives on
> the `main` branch; this template lives on `template-refactor` and is
> intended for forks / clones.

An autonomous AI agent built on the Databricks Lakehouse Platform that
continuously monitors, analyzes, and acts on platform telemetry data to
ensure GenAI workloads are cost-effective, high-performing, and properly
governed.

The default branding is **`{BRAND_NAME} AI Landscape`** with placeholder
copy for "Acme Corp". Set `BRAND_NAME` (and friends) in your `.env` to
re-skin the app for your own organization.

---

## What you get

- **6 dashboard tabs** (Overview, Cost & Anomalies, Performance, Quality
  Evaluation, Query Optimization, Security Audit) backed by 11
  pre-aggregated `m_*` Delta tables built from Databricks system tables.
- **2 floating chat assistants** available from any tab:
  - **Genie Q&A** — natural-language analytics over the materialized
    governance tables, powered by your foundation model + live SQL.
  - **Policy Assistant** — RAG-based Q&A over your governance policy PDFs
    via Vector Search + the same foundation model.
- **Brand-configurable everything** — brand name, app title, suggested
  questions, system prompts, policy text are all driven by env vars +
  `template.config.json`. Zero TSX or Python edits needed.

## Architecture

```
  +---------------------+   +---------------------------+
  |    Genie Q&A        |   |   Policy Assistant (RAG)  |
  |    LLM endpoint     |   |   Vector Search +         |
  |    + SQL execution  |   |   LLM endpoint            |
  +---------+-----------+   +-------------+-------------+
            | floating chat popups        |
            | (available on every screen) |
+-----------v-----------------------------v---------------+
|             ${BRAND_NAME} AI Landscape (App)            |
|         React + FastAPI + Recharts (dark theme)         |
+----------+----------+----------+----------+-------------+
| Cost &   |Perform-  | Quality  |  Query   |  Security   |
|Anomalies | ance     | Eval     |  Optim   |  Audit      |
+----+-----+----+-----+----+-----+----+-----+----+--------+
     |          |          |          |          |
+----v----------v----------v----------v----------v-------+
|         Materialized Delta tables (30-day)            |
|         ${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.* |
+----+----------+----------+----------+----------+-------+
     |          |          |          |          |
+----v---+ +----v---+ +----v---+ +----v---+ +----v-----+
|system. | |system. | |system. | |system. | |system.   |
|serving | |ai_     | |billing | |access  | |mlflow /  |
|        | |gateway | |        | |        | |query     |
+--------+ +--------+ +--------+ +--------+ +----------+
```

## Customizable parameters

Everything below is set in `.env` (or, for finer-grained UI copy, in
`template.config.json`). See [SETUP.md](./SETUP.md) for the full list.

| Layer | Examples |
|-------|----------|
| **Workspace** | `DATABRICKS_CATALOG`, `DATABRICKS_SCHEMA`, `DATABRICKS_WAREHOUSE_ID` |
| **AI endpoints** | `DATABRICKS_LLM_ENDPOINT`, `DATABRICKS_VS_ENDPOINT`, `DATABRICKS_EMBEDDING_MODEL`, `DATABRICKS_GENIE_SPACE_ID` |
| **Branding** | `BRAND_NAME`, `BRAND_PARENT`, `BRAND_INDUSTRY`, `EMAIL_DOMAIN`, `APP_TITLE`, `APP_SUBTITLE` |
| **Deployment** | `DATABRICKS_APP_NAME`, `DATABRICKS_APP_SOURCE_PATH`, `SUPER_USER_GROUP_NAME` |
| **UI copy** | `template.config.json` (`policy_assistant.suggested_questions`, `genie_chat.system_prompt`, ...) |

## Quick start

```bash
git clone <your-fork-url> my-ai-governance
cd my-ai-governance
git checkout template-refactor

cp .env.example .env
# edit .env

# (optional) automate catalog/schema/volume + Genie creation
python bootstrap.py

# render workspace-specific app.yaml from .env
python render-app-yaml.py

# build frontend + deploy
(cd frontend && npm install && npm run build)
databricks sync . "$DATABRICKS_APP_SOURCE_PATH"
databricks apps create "$DATABRICKS_APP_NAME"
databricks apps deploy "$DATABRICKS_APP_NAME" --source-code-path "$DATABRICKS_APP_SOURCE_PATH"
```

For the full step-by-step (notebooks, permissions, troubleshooting), see
[SETUP.md](./SETUP.md).

## Repository layout

```
.
├── app.py                           FastAPI entry point
├── app.yaml                         Rendered (do not hand-edit; rerun render-app-yaml.py)
├── app.yaml.template                Source-of-truth Databricks Apps config
├── render-app-yaml.py               Substitutes .env into app.yaml.template
├── bootstrap.py                     Best-effort CLI: create catalog/schema/volume/Genie
├── template.config.json             Layered UI/UX config (brand, prompts, suggested Qs)
├── .env.example                     Documented template for .env
├── SETUP.md                         Step-by-step deployment guide
├── server/
│   ├── config.py                    Loads env + template.config.json
│   ├── db.py                        SQL warehouse connection
│   └── routes.py                    FastAPI routes (KPIs, KA, Genie, /api/config)
├── frontend/
│   └── src/
│       ├── App.tsx                  Header / tabs (uses useAppConfig)
│       ├── hooks/useAppConfig.ts    Fetches /api/config -> brand + UI copy
│       └── components/
│           ├── ChatPopups.tsx       Policy + Genie floating panels
│           └── ...                  Tab views
├── notebooks/
│   ├── 01_setup_governance_views.py     widgets: catalog, schema
│   ├── 02_setup_policy_knowledge_base.py widgets: catalog, schema, vs_endpoint, brand_name, embedding_model
│   ├── 03_deploy_genie_room.py          widgets: catalog, schema, warehouse_id, brand_name
│   └── 04_materialize_app_tables.py     widgets: catalog, schema, window_days
├── policies/                        Sample governance PDFs (replace with your own)
└── requirements.txt
```

## Capabilities (defaults)

| # | Capability | Description |
|---|-----------|-------------|
| 1 | **Cost Analysis** | Per-agent, per-model cost attribution and trend analysis. Tracks Anthropic / OpenAI / Gemini / training / RT-inference SKUs. Detects spikes >2x rolling 7-day avg. |
| 2 | **Performance Monitoring** | Latency, throughput, error rate, SLA validation (GREEN < 2s, YELLOW < 5s, RED >= 5s). |
| 3 | **Quality Evaluation** | MLflow run success/failure, duration trends, drift detection (>2 stddev). |
| 4 | **Query Optimization** | Top expensive queries, cache hit rate, spill volumes, user attribution. |
| 5 | **Security Auditing** | Unauthorized access detection across modelServing, mlflow, aiGateway, vectorSearch, aibi. |
| 6 | **Anomaly Detection** | Cost spike + latency + quality alerts in a unified anomaly view. |
| 7 | **Natural Language Interface** | Genie Q&A (LLM + live SQL) and Policy Assistant (RAG over your governance PDFs). |

## Source system tables

| System Table | What it provides |
|---|---|
| `system.serving.endpoint_usage` | Request-level model serving data: tokens, requester, status |
| `system.serving.served_entities` | Endpoint configurations |
| `system.ai_gateway.usage` | AI Gateway routing, latency, token details |
| `system.billing.usage` | Cost data by SKU |
| `system.access.audit` | Access audit logs |
| `system.access.assistant_events` | Genie / AI Assistant activity |
| `system.mlflow.runs_latest` | MLflow experiment runs |
| `system.mlflow.run_metrics_history` | Metric values for drift detection |
| `system.query.history` | Query execution history |

## Tech stack

| Layer | Technology |
|-------|-----------|
| Backend | Python, FastAPI, databricks-sql-connector, databricks-sdk, openai SDK |
| Frontend | React 18, TypeScript, Vite, Tailwind, Recharts, Lucide |
| Data | System Tables, Unity Catalog, Delta (materialized) |
| AI - Genie Q&A | Foundation Model API + live SQL |
| AI - Policy Assistant | Vector Search + Foundation Model (RAG) |
| Infrastructure | Databricks Apps (Serverless), SQL Warehouse |

## Known deployed instances

> Add your deployment here once it goes live.

| Customer | Industry | Branch / Fork | URL |
|----------|----------|---------------|-----|
| AT&T | Telco | `main` | (internal) |
| _your deployment here_ | — | — | — |

## Contributing

The `template-refactor` branch is the source of truth for the parameterized
template. PRs that re-introduce hardcoded brand strings, customer names, or
workspace-specific resource IDs will be sent back for cleanup. Use the
config layers (`.env`, `template.config.json`) instead.
