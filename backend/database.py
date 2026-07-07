import os
import sqlite3
import re

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "ecommerce.db")

def check_read_only(sql_query: str) -> bool:
    """Returns True if the query is read-only, False if it tries to perform mutations."""
    # Look for forbidden keywords as whole words
    forbidden_pattern = r"\b(insert|update|delete|drop|alter|create|replace|truncate|grant|revoke|vacuum|pragma)\b"
    if re.search(forbidden_pattern, sql_query, re.IGNORECASE):
        return False
    # Ensure it starts with SELECT or WITH
    cleaned = sql_query.strip().upper()
    if not (cleaned.startswith("SELECT") or cleaned.startswith("WITH") or cleaned.startswith("EXPLAIN") or cleaned.startswith("PRAGMA TABLE_INFO") or cleaned.startswith("PRAGMA INDEX_LIST")):
        return False
    return True

def execute_query(sql_query: str):
    """Executes a SQL query against the SQLite database and returns the columns and rows."""
    if not check_read_only(sql_query):
        raise ValueError("Mutations (INSERT, UPDATE, DELETE, DROP, etc.) are not allowed. Only read-only queries (SELECT) are permitted.")
    
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError("Database file not found. Please run the seeding script first.")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    try:
        cursor.execute(sql_query)
        rows = cursor.fetchall()
        
        # Get column names
        columns = [description[0] for description in cursor.description] if cursor.description else []
        
        # Convert sqlite3.Row to standard dicts
        result_rows = [dict(row) for row in rows]
        
        return {
            "columns": columns,
            "rows": result_rows,
            "count": len(result_rows)
        }
    except sqlite3.Error as e:
        raise Exception(f"Database error: {str(e)}")
    finally:
        conn.close()

def get_schema_info():
    """Fetches the table names and their column definitions dynamically from the SQLite schema."""
    if not os.path.exists(DB_PATH):
        return {}
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
        tables = [row[0] for row in cursor.fetchall()]
        
        schema = {}
        for table in tables:
            cursor.execute(f"PRAGMA table_info({table});")
            columns_info = cursor.fetchall()
            schema[table] = [
                {"name": col[1], "type": col[2], "pk": bool(col[5])}
                for col in columns_info
            ]
        return schema
    except sqlite3.Error as e:
        raise Exception(f"Failed to fetch schema information: {str(e)}")
    finally:
        conn.close()
