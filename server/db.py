"""Database connection using databricks-sql-connector."""

import logging
from typing import Optional
from databricks.sql import connect
from databricks.sql.client import Connection
from server.config import get_access_token, get_databricks_host, WAREHOUSE_ID

logger = logging.getLogger(__name__)

_connection: Optional[Connection] = None


def get_connection() -> Connection:
    """Get or create a Databricks SQL connection."""
    global _connection
    if _connection is None:
        host = get_databricks_host().replace("https://", "").replace("http://", "")
        token = get_access_token()
        logger.info(f"Connecting to Databricks SQL: {host}, warehouse: {WAREHOUSE_ID}")
        _connection = connect(
            server_hostname=host,
            http_path=f"/sql/1.0/warehouses/{WAREHOUSE_ID}",
            access_token=token,
        )
    return _connection


def refresh_connection():
    """Refresh connection with new token."""
    global _connection
    if _connection:
        try:
            _connection.close()
        except Exception:
            pass
        _connection = None
    return get_connection()


def execute_query(sql: str, params: Optional[dict] = None) -> list[dict]:
    """Execute a SQL query and return results as list of dicts."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(sql)
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()
        cursor.close()
        return [dict(zip(columns, row)) for row in rows]
    except Exception as e:
        logger.error(f"Query error: {e}")
        # Try refreshing connection once
        try:
            conn = refresh_connection()
            cursor = conn.cursor()
            cursor.execute(sql)
            columns = [desc[0] for desc in cursor.description]
            rows = cursor.fetchall()
            cursor.close()
            return [dict(zip(columns, row)) for row in rows]
        except Exception as e2:
            logger.error(f"Query error after refresh: {e2}")
            raise


def close_connection():
    """Close the database connection."""
    global _connection
    if _connection:
        try:
            _connection.close()
        except Exception:
            pass
        _connection = None
