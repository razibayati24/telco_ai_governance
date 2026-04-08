# MT&T AI Governance & Observability Platform

An intelligence layer on top of Databricks system tables to govern, monitor, and optimize AI usage across platform workspaces.

## Architecture

```
                    +---------------------------+
                    |   AI Governance App (UI)   |
                    |   React + FastAPI          |
                    +---------------------------+
                           |           |
              +------------+           +-------------+
              |                                      |
    +---------v----------+              +------------v-----------+
    |   Genie Room       |              |  Policy Knowledge      |
    |   (NL Q&A over     |              |  Assistant (RAG)       |
    |    system tables)  |              |  Vector Search +       |
    |                    |              |  Foundation Model      |
    +--------+-----------+              +------------+-----------+
             |                                       |
    +--------v-----------------------------------+---v---+
    |           Governance Views Layer                    |
    |  cmegdemos_catalog.ai_governance.*                 |
    +----------------------------------------------------+
             |           |          |          |
    +--------v--+ +------v----+ +--v-------+ +v-----------+
    | system.   | | system.   | | system.  | | system.    |
    | serving   | | ai_gateway| | billing  | | access     |
    +-----------+ +-----------+ +----------+ +------------+
```

## Components

### 1. System Table Views (`notebooks/01_setup_governance_views.py`)

| View | Source | Purpose |
|------|--------|---------|
| `v_serving_endpoint_daily` | `system.serving.endpoint_usage` + `served_entities` | Request volume, tokens, error rates by endpoint/user |
| `v_ai_gateway_daily` | `system.ai_gateway.usage` | AI Gateway routing, latency, model-level tokens |
| `v_ai_cost_daily` | `system.billing.usage` | AI costs by provider (Anthropic, OpenAI, Gemini, Training, Inference) |
| `v_assistant_genie_usage` | `system.access.assistant_events` | Genie room & AI Assistant usage tracking |
| `v_underutilized_endpoints` | `system.serving.*` | Idle/underutilized endpoint detection with utilization tiers |
| `v_ai_access_audit` | `system.access.audit` | Unauthorized/denied access to AI services |

### 2. Databricks App (Dashboard)

**URL**: [ai-governance-monitor](https://ai-governance-monitor-7474656585748611.aws.databricksapps.com)

8 dashboard tabs:
- **Overview** - KPI cards + trend charts
- **Model Serving** - Top endpoints, filterable by entity type
- **AI Gateway** - Model-level request/latency/token analysis
- **Cost Observatory** - Stacked cost trends by provider
- **Access & Security** - Denied access trends, flagged users
- **Endpoint Health** - Utilization tier distribution, idle endpoint alerts
- **Policy Assistant** - RAG-based Q&A over governance policy documents
- **Genie Q&A** - Embedded Genie room for natural language analytics

### 3. Genie Room (`notebooks/03_deploy_genie_room.py`)

Natural language Q&A over all 6 governance views.

**URL**: [AI Governance Genie](https://fevm-cmegdemos.cloud.databricks.com/genie/rooms/01f1336d23c21dbeaf01c8b966940ff8)

### 4. Policy Knowledge Assistant (`notebooks/02_setup_policy_knowledge_base.py`)

RAG-based assistant that answers questions about 6 AI governance policy documents:
1. AI Data Access Regulation Policy
2. AI Model Governance and Lifecycle Policy
3. AI Cost Management and FinOps Policy
4. AI Security and Access Control Policy
5. Genie Room and AI Assistant Governance Policy
6. AI Platform Acceptable Use Policy

Policy PDFs are stored in: `Volumes/cmegdemos_catalog/ai_governance/policy_documents/`

## Monitoring Capabilities

| Capability | How |
|-----------|-----|
| AI Usage Patterns | `v_serving_endpoint_daily` - request volume, tokens by endpoint/user |
| Model Serving Endpoints | `v_serving_endpoint_daily` + `v_underutilized_endpoints` |
| Unauthorized Access | `v_ai_access_audit` - denied attempts, flagged users |
| Underutilized Endpoints | `v_underutilized_endpoints` - Idle/Very Low/Low/Moderate/Active tiers |
| Cost Observability | `v_ai_cost_daily` - by provider (Anthropic, OpenAI, Gemini, Training, Inference) |
| Genie Room Usage | `v_assistant_genie_usage` - daily events, user adoption |
| AI Gateway Routing | `v_ai_gateway_daily` - model routing, latency, token details |
| Error Rate Monitoring | `v_serving_endpoint_daily` - error_count, error_rate_pct |
| Token Budget Tracking | All views - input/output tokens by user, endpoint, model |

## Setup

### Prerequisites
- Databricks workspace with system tables enabled
- SQL warehouse with CAN_USE permission
- Access to `system.*` schemas

### Deployment Steps

1. **Run notebooks in order:**
   ```
   01_setup_governance_views.py   -> Creates schema and 6 views
   02_setup_policy_knowledge_base.py -> Creates policy KB with vector search
   03_deploy_genie_room.py        -> Creates Genie room
   ```

2. **Deploy the app:**
   ```bash
   databricks apps create ai-governance-monitor --profile=<your-profile>
   databricks apps deploy ai-governance-monitor --source-code-path /Workspace/Users/<you>/databricks_apps/ai-governance-monitor
   ```

3. **Configure app resources in `app.yaml`:**
   - SQL warehouse access
   - Serving endpoint access (for Policy Assistant LLM)

## Workspace

- **Workspace**: https://fevm-cmegdemos.cloud.databricks.com
- **Catalog**: `cmegdemos_catalog`
- **Schema**: `ai_governance`
- **Warehouse**: `9cd919d96b11bf1c` (Apps & Agents Warehouse)

## Tech Stack

- **Backend**: Python, FastAPI, databricks-sql-connector, openai SDK
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Recharts
- **Data**: Databricks System Tables, Unity Catalog, Delta Lake
- **AI**: Vector Search (GTE-Large embeddings), Claude Sonnet 4 (RAG generation)
- **Analytics**: Genie Room (natural language Q&A)
