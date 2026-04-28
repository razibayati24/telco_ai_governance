# Deploy Your Own Copy

This is a **parameterized Databricks Apps template**. Every workspace-specific
value lives in either ``.env`` (resource IDs and brand strings) or
``template.config.json`` (UI copy and suggested questions). Follow the steps
below to stand up your own instance.

> The default branding ("Acme Corp / Generic") is intentionally placeholder
> copy. The original AT&T deployment lives on `main`; new deployments should
> branch off `template-refactor` (or fork the repo) and customize from there.

---

## Prerequisites

- A Databricks workspace with **system tables** enabled
- **Account admin** access (only needed if you want a super-user mask group)
- **Databricks CLI ≥ 0.229** authenticated to your workspace
  (`databricks auth login` with a profile)
- **Python 3.10+** locally (for `bootstrap.py` and `render-app-yaml.py`)
- **Node 18+** + `npm` (for the React frontend build)
- A **SQL warehouse** (Serverless Pro recommended)
- A **Vector Search endpoint** (Standard tier)
- A **foundation model serving endpoint** you can `CAN_QUERY` (e.g.
  `databricks-claude-sonnet-4-5`)

---

## Step 1 — Configure

```bash
git clone <your-fork-url> my-ai-governance
cd my-ai-governance
git checkout template-refactor   # or your fork's main

cp .env.example .env
# edit .env with your catalog, warehouse ID, endpoint names, brand strings
```

Required variables (full list in `.env.example`):

| Variable | What it is |
|----------|-----------|
| `DATABRICKS_HOST` | https://...cloud.databricks.com (local dev only) |
| `DATABRICKS_PROFILE` | CLI profile (defaults to DEFAULT) |
| `DATABRICKS_CATALOG` | Unity Catalog name |
| `DATABRICKS_SCHEMA` | Schema (default `ai_governance`) |
| `DATABRICKS_WAREHOUSE_ID` | SQL Warehouse ID |
| `DATABRICKS_LLM_ENDPOINT` | FM serving endpoint name |
| `DATABRICKS_VS_ENDPOINT` | Vector Search endpoint name |
| `DATABRICKS_EMBEDDING_MODEL` | Embedding model (default `databricks-gte-large-en`) |
| `BRAND_NAME` | Customer name shown in header + AI prompts |
| `BRAND_PARENT` | Parent / holding company (optional) |
| `BRAND_INDUSTRY` | "Telco" / "Retail" / "Finance" / etc. |
| `EMAIL_DOMAIN` | Used for masking UDFs and sample audit data |
| `APP_TITLE` | Browser tab + page header (default "AI Governance & Observability") |
| `APP_SUBTITLE` | Header subtitle (default "AI Agentic FinOps Assistant") |
| `SUPER_USER_GROUP_NAME` | Account group for masking-bypass (optional) |
| `DATABRICKS_APP_NAME` | App name (must be unique in workspace) |
| `DATABRICKS_APP_SOURCE_PATH` | Workspace path to sync source to |

For finer-grained UI copy (suggested questions, system prompts, the policy
chat panel labels), edit `template.config.json` after copying `.env`.

---

## Step 2 — Run the setup notebooks

The notebooks must run on a Databricks cluster (they use Spark). Each notebook
exposes parameters via `dbutils.widgets.text(...)`.

Run **in order**:

```
notebooks/01_setup_governance_views.py
   widgets: catalog, schema
notebooks/02_setup_policy_knowledge_base.py
   widgets: catalog, schema, vs_endpoint, brand_name, embedding_model
notebooks/04_materialize_app_tables.py
   widgets: catalog, schema, window_days
notebooks/03_deploy_genie_room.py     # optional, sets up Genie
   widgets: catalog, schema, warehouse_id, brand_name
```

Pass the same `catalog` / `schema` / `brand_name` you set in `.env`. The brand
name flows into the policy text — `{BRAND}` placeholders inside the policy
chunks get replaced with the value of `brand_name` at notebook run time.

> The materialized `m_*` tables (notebook 04) are 30-day rolling snapshots. To
> keep them fresh, schedule notebook 04 as a daily Lakeflow job.

---

## Step 3 — (Optional) Create the super-user account group

Only required if you want a group of users to bypass dynamic data masking.

1. **Account console** → Settings → Identity → Groups → Create group
2. Name it the same value as `SUPER_USER_GROUP_NAME` in `.env`
3. Add yourself + any other operators
4. Assign the group to your workspace (Settings → Identity & Access)
5. Grant the group `USE CATALOG` / `USE SCHEMA` / `SELECT` on the governance
   schema, plus permission to read the unmasked source views

---

## Step 4 — (Optional) Set up Genie

You have two options:

**(a) via notebook 03** — runs the same Genie REST API call we'd run from the
terminal, and reports a `space_id`.

**(b) via `bootstrap.py`** — best-effort REST creation:

```bash
python bootstrap.py            # creates catalog/schema/volume + Genie
```

Either way, copy the resulting `space_id` into `.env` as
`DATABRICKS_GENIE_SPACE_ID=...` so the in-app Genie deep-link works.

---

## Step 5 — Knowledge Assistant (Agent Bricks UI)

The Policy Assistant panel uses the Vector Search index created in
notebook 02. If you also want a managed **Knowledge Assistant** experience
on top of the contract / policy docs:

1. **Workspace UI** → AI/ML → Agent Bricks → Knowledge Assistants
2. **Source** → choose the UC volume `${CATALOG}.${SCHEMA}.policy_documents`
   (notebook 02 creates this; you can drop additional PDFs there)
3. Use the embedding model from `.env` (default `databricks-gte-large-en`)
4. Note the resulting endpoint name; you can wire it into a future custom
   route if you want to swap out the bare-LLM Policy Assistant.

> Today this app's Policy Assistant calls the Vector Search index directly
> (no Knowledge Assistant required). This step is for users who want the
> full Agent Bricks managed experience.

---

## Step 6 — Multi-Agent Supervisor (Agent Bricks UI, optional)

Agent Bricks Multi-Agent Supervisor is UI-only today. Skip if you're not
adding agentic features beyond what this app already ships.

1. **AI/ML → Agent Bricks → Multi-Agent Supervisor → Create**
2. Wire your child agents (e.g. Genie space, Knowledge Assistant) using
   parameterized descriptions. Reference your brand via `BRAND_NAME`.

---

## Step 7 — Permissions

Grant your **app service principal** (auto-created on first deploy) the
permissions it needs:

```sql
GRANT USE CATALOG  ON CATALOG  ${DATABRICKS_CATALOG}                  TO `<app-sp-uuid>`;
GRANT USE SCHEMA   ON SCHEMA   ${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA} TO `<app-sp-uuid>`;
GRANT SELECT       ON SCHEMA   ${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA} TO `<app-sp-uuid>`;
GRANT READ VOLUME  ON VOLUME   ${DATABRICKS_CATALOG}.${DATABRICKS_SCHEMA}.policy_documents TO `<app-sp-uuid>`;
```

Plus, in the workspace UI:
- **SQL Warehouse** → Permissions → grant the App SP `CAN USE`
- **Serving endpoint** (your LLM) → Permissions → `CAN QUERY`
- **Vector Search endpoint** → Permissions → `CAN USE`
- **Vector Search index** → Permissions → `CAN USE`
- **Genie space** (if using) → Permissions → `CAN VIEW` / `CAN RUN`

---

## Step 8 — Build the frontend

```bash
cd frontend
npm install
npm run build           # outputs frontend/dist
cd ..
```

The Python server (`app.py`) serves `frontend/dist` as static assets at
runtime, so the dist directory **must be present** in the deployed source.

---

## Step 9 — Render `app.yaml` and deploy

```bash
# Render workspace-specific app.yaml from .env
python render-app-yaml.py

# Sync source to the workspace
databricks sync . "$DATABRICKS_APP_SOURCE_PATH" --profile "$DATABRICKS_PROFILE"

# Create the app (first time only)
databricks apps create "$DATABRICKS_APP_NAME" \
    --description "AI Governance Monitor for $BRAND_NAME" \
    --profile "$DATABRICKS_PROFILE"

# Deploy
databricks apps deploy "$DATABRICKS_APP_NAME" \
    --source-code-path "$DATABRICKS_APP_SOURCE_PATH" \
    --profile "$DATABRICKS_PROFILE"
```

---

## Step 10 — Verify

```bash
# Get the public URL
databricks apps get "$DATABRICKS_APP_NAME" --profile "$DATABRICKS_PROFILE"

# Sanity-check the API
curl -fsSL "$APP_URL/api/health"
curl -fsSL "$APP_URL/api/config" | jq .brand
curl -fsSL "$APP_URL/api/overview/kpis" | jq .
```

If `/api/config` returns your brand name, the app is reading config
correctly. If KPIs return numbers > 0, the warehouse + permissions are wired
up.

---

## Troubleshooting

| Symptom | Likely cause |
|---------|-------------|
| Page shows "Acme Corp" header in production | `BRAND_NAME` not set in `app.yaml`. Re-render and redeploy. |
| KPIs are all 0 / empty | Notebook 04 hasn't been run, or the App SP lacks `SELECT` on the schema. |
| Policy Assistant says "Vector search error" | Index not yet ready, or App SP lacks `CAN USE` on the VS endpoint. |
| Genie panel says "Failed to reach Genie" | The chat panel uses the LLM endpoint (no Genie space required) — check the LLM endpoint permission. |
| Build fails with "Cannot find module ..." | Run `npm install` in `frontend/` and check that all build deps are in `dependencies`, not `devDependencies`. |
| `databricks apps deploy` says invalid YAML | Re-run `python render-app-yaml.py`. Don't hand-edit `app.yaml` for placeholders — it's regenerated. |

---

## Going further

- Replace the sample PDFs in `policies/` with your own governance docs and
  re-run notebook 02 to repopulate the policy KB.
- Edit `template.config.json` to add domain-specific suggested questions
  (e.g. "show me CDR processing costs" for a telco deploy).
- Schedule `notebooks/04_materialize_app_tables.py` as a daily Lakeflow job
  for fresh dashboards.
- For production, configure the App with an account-level `SUPER_USER_GROUP`
  group and apply masking UDFs in notebook 01 to scrub PII from non-admins.
