import os
import re
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv

# Load env variables from .env if present
load_dotenv()

from database import execute_query, get_schema_info

app = FastAPI(title="Natural Language to SQL Engine API")

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class GenerateRequest(BaseModel):
    prompt: str

class ExecuteRequest(BaseModel):
    sql: str

@app.get("/api/schema")
def get_schema():
    """Returns the current database schema dynamically."""
    try:
        schema = get_schema_info()
        if not schema:
            return {"schema": {}, "warning": "Database is empty or not seeded."}
        return {"schema": schema}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate")
async def generate_sql(req: GenerateRequest, x_groq_api_key: Optional[str] = Header(None)):
    """Translates a natural language prompt into SQL using Groq."""
    prompt = req.prompt.strip()
    
    # 1. Validation for empty or too short input
    if not prompt or len(prompt) < 3:
        raise HTTPException(status_code=400, detail="Please write a meaningful request describing the data you need.")

    # 2. Get API key from header or environment variables
    api_key = x_groq_api_key or os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=401, 
            detail="Groq API Key is missing. Please provide it in the top settings bar or set GROQ_API_KEY in the environment."
        )

    # 3. Dynamic schema context assembly
    try:
        schema = get_schema_info()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read database schema: {str(e)}")

    if not schema:
        raise HTTPException(status_code=500, detail="Database is not seeded. Run seed.py first.")

    schema_desc = ""
    for table_name, columns in schema.items():
        cols_str = ", ".join([f"{col['name']} ({col['type']}{' PRIMARY KEY' if col['pk'] else ''})" for col in columns])
        schema_desc += f"- Table: {table_name}\n  Columns: {cols_str}\n"

    # Construct the instruction for Groq
    system_prompt = f"""You are a professional SQLite database assistant.
Given the following database schema, translate the user's natural language request into a valid SQLite SQL query.

Database Schema:
{schema_desc}

Guidelines:
1. Return ONLY the raw SQL query. Do not wrap the SQL query in markdown blocks (e.g., do not write ```sql ... ```), do not add any explanation, and do not output any text other than the SQL.
2. The query must be read-only (SELECT statements only). Do not generate INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, REPLACE, or TRUNCATE statements.
3. Be precise with table names and column names. Only use the tables and columns defined in the schema above.
4. If a query is ambiguous, make a reasonable assumption and generate a valid SELECT query.
5. Do not include semicolons at the end of the query.
6. Use case-insensitive matches where appropriate using LIKE or LOWER if the user query suggests searching text.
7. Use relational joins (e.g. JOIN orders ON orders.user_id = users.id) when data from multiple tables is required.
"""

    try:
        from groq import Groq
        client = Groq(api_key=api_key)
        
        # Call Groq API
        chat_completion = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.1,
        )
        
        sql = chat_completion.choices[0].message.content.strip()
        
        # Clean up code blocks if returned
        if sql.startswith("```"):
            sql = sql.replace("```sql", "").replace("```", "").strip()
        # Remove trailing semicolon
        if sql.endswith(";"):
            sql = sql[:-1].strip()
            
        return {"sql": sql}
        
    except ImportError:
        raise HTTPException(status_code=500, detail="Groq library is not installed on the server.")
    except Exception as e:
        # User-friendly Groq API error
        error_msg = str(e)
        if "API Key" in error_msg or "401" in error_msg:
            raise HTTPException(status_code=401, detail="Invalid Groq API Key. Please verify your key.")
        raise HTTPException(status_code=500, detail=f"Groq API Error: {error_msg}")

@app.post("/api/execute")
async def execute_sql(req: ExecuteRequest):
    """Executes SQL query against SQLite database and returns rows."""
    sql = req.sql.strip()
    
    if not sql:
        raise HTTPException(status_code=400, detail="SQL query is empty.")
        
    # Check for mutations
    forbidden_pattern = r"\b(insert|update|delete|drop|alter|create|replace|truncate|grant|revoke|vacuum|pragma)\b"
    if re.search(forbidden_pattern, sql, re.IGNORECASE):
         raise HTTPException(
             status_code=403, 
             detail="Security Alert: Write/Mutation operations are blocked. Only read-only queries (SELECT) are permitted."
         )
         
    try:
        results = execute_query(sql)
        return results
    except ValueError as val_err:
        raise HTTPException(status_code=403, detail=str(val_err))
    except FileNotFoundError as fnf_err:
        raise HTTPException(status_code=500, detail=str(fnf_err))
    except Exception as e:
        # SQLite error caught and wrapped as human-readable error
        err_msg = str(e)
        # Simplify common SQLite errors
        if "no such table" in err_msg.lower():
            table_name = re.findall(r"no such table: (\w+)", err_msg, re.IGNORECASE)
            tbl = f" '{table_name[0]}'" if table_name else ""
            friendly_detail = f"Syntax Error: The database table{tbl} does not exist. Please check the Schema Explorer in the sidebar."
        elif "no such column" in err_msg.lower():
            col_name = re.findall(r"no such column: ([\w\.]+)", err_msg, re.IGNORECASE)
            col = f" '{col_name[0]}'" if col_name else ""
            friendly_detail = f"Syntax Error: The column{col} referenced in the query does not exist in this database."
        else:
            friendly_detail = f"SQL Execution Error: {err_msg.replace('Database error: ', '')}"
            
        raise HTTPException(status_code=400, detail=friendly_detail)

# Mount frontend static files at the root
from fastapi.staticfiles import StaticFiles
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

