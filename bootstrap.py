#!/usr/bin/env python3
"""bootstrap.py — automate the deployable-template setup steps.

This script reads ``.env`` (or current shell env) and performs as much of the
post-clone setup as the Databricks REST API allows:

* Verify auth / workspace reachability
* Create the catalog if missing (``CREATE CATALOG IF NOT EXISTS``)
* Create the schema if missing
* Create the policy_documents UC volume
* Optionally create a Genie space pointing at the governance views
* Print a clear "what's left for the human" checklist

What this script CANNOT automate (and why):

* **Knowledge Assistant (Agent Bricks)** — UI-only flow today
* **Multi-Agent Supervisor** — UI-only flow today
* **App resource permissions** — must be granted to the App service principal
  *after* the App is created (its SP is generated on first deploy)
* **Account-level super-user group** — requires Account Admin (separate UI)

Usage
-----
    python bootstrap.py                          # full run
    python bootstrap.py --dry-run                # print what it would do
    python bootstrap.py --skip-genie             # skip Genie creation
    python bootstrap.py --env path/to/.env       # use a different env file
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Dict, Optional


def _load_dotenv(path: Path) -> Dict[str, str]:
    out: Dict[str, str] = {}
    if not path.exists():
        return out
    for line in path.read_text().splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        v = v.strip()
        if (v.startswith('"') and v.endswith('"')) or (
            v.startswith("'") and v.endswith("'")
        ):
            v = v[1:-1]
        out[k.strip()] = v
    return out


def _require(env: Dict[str, str], key: str) -> str:
    val = os.environ.get(key) or env.get(key) or ""
    if not val:
        sys.exit(f"ERROR: {key} is required (set it in .env or shell env)")
    return val


def _opt(env: Dict[str, str], key: str, default: str = "") -> str:
    return os.environ.get(key) or env.get(key) or default


def _section(title: str) -> None:
    print("\n" + "=" * 72)
    print(f"  {title}")
    print("=" * 72)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--env", default=".env", type=Path)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--skip-genie", action="store_true", help="Skip creating the Genie space")
    p.add_argument(
        "--skip-catalog",
        action="store_true",
        help="Don't create the catalog (assumes it already exists)",
    )
    args = p.parse_args()

    env = _load_dotenv(args.env)
    catalog = _require(env, "DATABRICKS_CATALOG")
    schema = _opt(env, "DATABRICKS_SCHEMA", "ai_governance")
    warehouse_id = _require(env, "DATABRICKS_WAREHOUSE_ID")
    profile = _opt(env, "DATABRICKS_PROFILE", "DEFAULT")

    _section(f"AI Governance Monitor bootstrap  ({'DRY RUN' if args.dry_run else 'LIVE'})")
    print(f"  Catalog        : {catalog}")
    print(f"  Schema         : {schema}")
    print(f"  Warehouse ID   : {warehouse_id}")
    print(f"  CLI profile    : {profile}")
    print(f"  Env file       : {args.env}")

    # Defer SDK import until after arg parsing so --help works without auth.
    try:
        from databricks.sdk import WorkspaceClient
        from databricks.sdk.service.sql import StatementParameterListItem  # noqa: F401
    except ImportError:
        sys.exit(
            "ERROR: pip install databricks-sdk first (or activate the project venv)"
        )

    w = WorkspaceClient(profile=profile)
    print(f"\nWorkspace host : {w.config.host}")

    def run_sql(sql: str) -> None:
        print(f"  > {sql}")
        if args.dry_run:
            return
        resp = w.statement_execution.execute_statement(
            warehouse_id=warehouse_id, statement=sql, wait_timeout="30s"
        )
        if resp.status and resp.status.state and resp.status.state.value == "FAILED":
            err = resp.status.error.message if resp.status.error else "unknown error"
            sys.exit(f"  SQL failed: {err}")

    # ------------------------------------------------------------------
    # 1. Catalog + schema + volume
    # ------------------------------------------------------------------
    _section("Step 1: Catalog / schema / volume")
    if not args.skip_catalog:
        run_sql(f"CREATE CATALOG IF NOT EXISTS {catalog}")
    run_sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
    run_sql(
        f"CREATE VOLUME IF NOT EXISTS {catalog}.{schema}.policy_documents "
        f"COMMENT 'AI Governance policy PDFs for Knowledge Assistant'"
    )

    # ------------------------------------------------------------------
    # 2. Reminder about notebooks (these MUST run on a Databricks cluster
    #    with Spark; we cannot run %py notebooks from a vanilla Python).
    # ------------------------------------------------------------------
    _section("Step 2: Run setup notebooks (manual — needs Spark)")
    print(
        "Run these on a Databricks cluster, in order:\n"
        "  1) notebooks/01_setup_governance_views.py\n"
        "  2) notebooks/02_setup_policy_knowledge_base.py\n"
        "  3) notebooks/04_materialize_app_tables.py\n\n"
        "Pass the same catalog / schema / brand_name widgets values as above.\n"
        "You can do this via the Workspace UI, the Databricks CLI\n"
        "(`databricks workspace import`), or a Lakeflow Job."
    )

    # ------------------------------------------------------------------
    # 3. Genie space (best-effort)
    # ------------------------------------------------------------------
    _section("Step 3: Create Genie space (best-effort)")
    if args.skip_genie:
        print("  skipped (--skip-genie)")
    else:
        brand = _opt(env, "BRAND_NAME", "Acme Corp")
        title = f"{brand} AI Governance Q&A"
        payload = {
            "title": title,
            "description": (
                "Natural language Q&A to monitor AI usage, model serving costs, "
                "endpoint utilization, access patterns, and Genie/Assistant "
                "activity across the platform."
            ),
            "warehouse_id": warehouse_id,
            "serialized_space": json.dumps({"version": "2"}),
        }
        host = w.config.host.rstrip("/")
        url = f"{host}/api/2.0/genie/spaces"
        if args.dry_run:
            print(f"  (dry-run) POST {url}\n           {json.dumps(payload, indent=2)}")
        else:
            try:
                import requests  # type: ignore[import-not-found]
            except ImportError:
                requests = None  # type: ignore[assignment]
            try:
                token = w.config.authenticate().get("Authorization", "").replace("Bearer ", "")
                if not token:
                    print("  WARN: could not get token from SDK; skipping Genie creation.")
                elif requests is None:
                    print("  WARN: requests not installed; skipping Genie creation.")
                else:
                    resp = requests.post(
                        url,
                        headers={"Authorization": f"Bearer {token}"},
                        json=payload,
                        timeout=30,
                    )
                    if resp.status_code in (200, 201):
                        sid = resp.json().get("space_id")
                        print(f"  Created Genie space: {sid}")
                        print(f"  -> set DATABRICKS_GENIE_SPACE_ID={sid} in .env and re-render app.yaml")
                    else:
                        print(f"  Genie API returned {resp.status_code}: {resp.text[:200]}")
                        print("  (You can create the Genie space manually via notebook 03.)")
            except Exception as e:  # pragma: no cover
                print(f"  Genie creation failed: {e}")
                print("  (Fall back to running notebook 03 in the workspace UI.)")

    # ------------------------------------------------------------------
    # 4. What humans must still do
    # ------------------------------------------------------------------
    _section("Step 4: Manual steps (cannot be automated by this script)")
    print(
        "  [ ] Create / verify the SQL warehouse and Vector Search endpoint\n"
        "  [ ] Run notebooks 01, 02, 04 (and optionally 03 if you skipped Genie)\n"
        "  [ ] Render app.yaml:   python render-app-yaml.py\n"
        "  [ ] Build frontend:    (cd frontend && npm install && npm run build)\n"
        "  [ ] Sync source:       databricks sync . <workspace path>\n"
        "  [ ] Create app:        databricks apps create <app-name>\n"
        "  [ ] Deploy app:        databricks apps deploy <app-name> --source-code-path <workspace path>\n"
        "  [ ] Grant the App SP USE/SELECT on the catalog/schema and CAN_QUERY on the LLM endpoint\n"
        "  [ ] (Optional) Create the SUPER_USER_GROUP_NAME account group in the Account Console\n"
        "  [ ] (Optional) Set up Knowledge Assistant + Multi-Agent Supervisor via Agent Bricks UI"
    )

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
