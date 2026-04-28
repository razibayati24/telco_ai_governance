#!/usr/bin/env python3
"""Render `app.yaml` from `app.yaml.template` + `.env`.

Why this script exists
======================
Databricks Apps does not interpolate environment variables inside the
``resources:`` block of ``app.yaml`` at deploy time — entries like
``sql_warehouse.id`` and ``serving_endpoint.name`` must be literal strings
when the YAML is parsed.  This script reads workspace-specific values from
``.env`` (or the current shell), substitutes ``{{ VAR }}`` placeholders in
``app.yaml.template``, and writes the rendered ``app.yaml`` next to it.

Usage
-----
    cp .env.example .env
    # edit .env with your values
    python render-app-yaml.py            # reads ./.env, writes ./app.yaml
    python render-app-yaml.py --env path/to/.env --out path/to/app.yaml

Supported placeholder syntax
----------------------------
* ``{{ NAME }}``                     — required; raises if NAME missing/blank
* ``{{ NAME | default("foo") }}``    — falls back to ``"foo"``
* ``{{ NAME | default('foo') }}``    — single quotes also fine

We deliberately do NOT depend on Jinja2 — only the standard library — so the
script works in any Python 3.8+ environment without ``pip install``.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path
from typing import Dict


PLACEHOLDER_RE = re.compile(
    r"\{\{\s*"                                     # opening braces
    r"(?P<name>[A-Z_][A-Z0-9_]*)"                  # variable name
    r"(?:\s*\|\s*default\(\s*"                     # optional |default(...)
    r"(?P<quote>[\"'])(?P<default>.*?)(?P=quote)"  # quoted default value
    r"\s*\))?"
    r"\s*\}\}"                                     # closing braces
)


def load_dotenv(path: Path) -> Dict[str, str]:
    """Parse a simple `.env` file. Comments (#) and blank lines are skipped.
    Quoted values are supported. Existing OS env vars take precedence.
    """
    values: Dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip()
        if (val.startswith('"') and val.endswith('"')) or (
            val.startswith("'") and val.endswith("'")
        ):
            val = val[1:-1]
        values[key] = val
    return values


def render(template_text: str, env: Dict[str, str]) -> str:
    missing: list[str] = []

    def _sub(m: re.Match) -> str:
        name = m.group("name")
        default = m.group("default")
        # OS env wins over .env values (so CI overrides etc. work)
        val = os.environ.get(name) or env.get(name) or ""
        if not val and default is not None:
            return default
        if not val:
            missing.append(name)
            return ""
        return val

    rendered = PLACEHOLDER_RE.sub(_sub, template_text)
    if missing:
        unique = sorted(set(missing))
        raise SystemExit(
            "Missing required values for placeholders: "
            + ", ".join(unique)
            + "\nSet them in your .env file (or as shell env vars) and re-run."
        )
    return rendered


def main() -> int:
    p = argparse.ArgumentParser(description="Render app.yaml from app.yaml.template + .env")
    p.add_argument("--env", default=".env", type=Path, help="Path to .env file (default: ./.env)")
    p.add_argument(
        "--template",
        default="app.yaml.template",
        type=Path,
        help="Template path (default: ./app.yaml.template)",
    )
    p.add_argument("--out", default="app.yaml", type=Path, help="Output path (default: ./app.yaml)")
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print rendered YAML to stdout without writing the file",
    )
    args = p.parse_args()

    if not args.template.exists():
        print(f"Template not found: {args.template}", file=sys.stderr)
        return 2

    env = load_dotenv(args.env)
    template_text = args.template.read_text()
    rendered = render(template_text, env)

    if args.dry_run:
        sys.stdout.write(rendered)
        return 0

    args.out.write_text(rendered)
    print(f"Wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
