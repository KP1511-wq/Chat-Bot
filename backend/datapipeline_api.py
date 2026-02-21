import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import pandas as pd
import sqlite3
import json
import os
import uuid
import datetime
from typing import Optional, List, Any, Dict

CSV_FILE = "housing.csv"          # ← swap to any CSV filename


WORKING_DIR         = "pipeline_workspace"
KNOWLEDGE_BASE_FILE = os.path.join(WORKING_DIR, "final_records.json")
DB_FILE             = os.path.join(WORKING_DIR, os.path.splitext(os.path.basename(CSV_FILE))[0].strip().lower().replace(" ", "_").replace("-", "_") + ".db")

os.makedirs(WORKING_DIR, exist_ok=True)
if not os.path.exists(KNOWLEDGE_BASE_FILE):
    with open(KNOWLEDGE_BASE_FILE, "w") as f:
        json.dump({}, f)

app = FastAPI(title="Dynamic Data Pipeline")

# ─── DERIVE TABLE NAME FROM CSV FILENAME ─────────────────────────────────────
def csv_to_table_name(csv_path: str) -> str:
    """housing.csv → housing   |   my sales data.csv → my_sales_data"""
    base = os.path.splitext(os.path.basename(csv_path))[0]
    return base.strip().lower().replace(" ", "_").replace("-", "_")

TABLE_NAME = csv_to_table_name(CSV_FILE)

# ─── DATABASE INIT ────────────────────────────────────────────────────────────
def initialize_database():
    """Load CSV into SQLite. Runs once; skipped if DB already exists."""
    if os.path.exists(DB_FILE):
        print(f"✅ Database already exists at {DB_FILE}")
        return

    search_paths = [CSV_FILE, os.path.join("data", CSV_FILE)]
    for path in search_paths:
        if os.path.exists(path):
            try:
                print(f"📂 Loading {path} …")
                df = pd.read_csv(path)

                # Sanitise column names (remove spaces, special chars)
                df.columns = [
                    c.strip().lower().replace(" ", "_").replace("-", "_").replace("(", "").replace(")", "")
                    for c in df.columns
                ]

                conn = sqlite3.connect(DB_FILE)
                df.to_sql(TABLE_NAME, conn, if_exists="replace", index=False)
                conn.close()
                print(f"✅ Created table '{TABLE_NAME}' with {len(df):,} rows and {len(df.columns)} columns.")
                return
            except Exception as e:
                print(f"❌ Error loading CSV: {e}")
                return

    print(f"⚠️  '{CSV_FILE}' not found. Place it next to datapipeline_api.py and restart.")

initialize_database()

# ─── AUTO CONTEXT GENERATION (NEW FORMAT) ────────────────────────────────────
def infer_column_meaning(col_name: str, dtype: str, sample_vals: list) -> str:
    """
    Infer what a column represents based on its name and sample values.
    Returns a human-readable description.
    """
    name_lower = col_name.lower()
    
    # Common patterns
    if "price" in name_lower or "cost" in name_lower or "value" in name_lower:
        return f"The price or monetary value (measured in the dataset's currency unit)"
    elif "age" in name_lower:
        return f"The age or time period (in years)"
    elif "date" in name_lower or "time" in name_lower:
        return f"A timestamp or date value"
    elif "id" in name_lower or name_lower.endswith("_id"):
        return f"A unique identifier for each record"
    elif "name" in name_lower or "title" in name_lower:
        return f"A label or name"
    elif "count" in name_lower or "total" in name_lower or "num" in name_lower:
        return f"A count or quantity"
    elif "latitude" in name_lower or "lat" == name_lower:
        return f"Geographic latitude coordinate (degrees)"
    elif "longitude" in name_lower or "lon" == name_lower or "lng" == name_lower:
        return f"Geographic longitude coordinate (degrees)"
    elif "category" in name_lower or "type" in name_lower or "status" in name_lower:
        return f"A categorical label or classification"
    elif "percent" in name_lower or "rate" in name_lower or "ratio" in name_lower:
        return f"A percentage or rate value"
    elif dtype == "object" and sample_vals:
        return f"A categorical field with values like: {', '.join(map(str, sample_vals[:3]))}"
    else:
        # Generic description based on type
        if dtype in ["int64", "float64"]:
            return f"A numeric measurement or value"
        else:
            return f"A text or categorical field"


def build_column_descriptions(df: pd.DataFrame) -> dict:
    """
    Build column descriptions in the format:
    {
      "filename": "housing.csv",
      "columns": {
        "col1": "description of col1",
        "col2": "description of col2",
        ...
      }
    }
    """
    columns = {}
    for col in df.columns:
        dtype = str(df[col].dtype)
        sample_vals = df[col].dropna().unique().tolist()[:5]
        
        # Get semantic meaning
        meaning = infer_column_meaning(col, dtype, sample_vals)
        
        # Build description parts
        parts = [meaning]
        
        # Add statistics based on type
        if df[col].dtype in ["int64", "float64"]:
            parts.append(f"Range: {df[col].min():.2f} to {df[col].max():.2f}")
            parts.append(f"Average: {df[col].mean():.2f}")
        
        # Add categorical info
        nunique = df[col].nunique()
        if df[col].dtype == "object" or nunique <= 30:
            unique_vals = df[col].dropna().unique().tolist()[:5]
            if unique_vals:
                parts.append(f"Possible values: {', '.join(map(str, unique_vals))}")
        
        # Add null count if any
        null_count = df[col].isna().sum()
        if null_count > 0:
            parts.append(f"Note: {null_count} missing values")
        
        columns[col] = ". ".join(parts) + "."
    
    return {
        "filename": CSV_FILE,
        "columns": columns
    }


def auto_generate_context():
    """Auto-generates knowledge base on startup in simplified format."""
    with open(KNOWLEDGE_BASE_FILE, "r") as f:
        kb = json.load(f)

    # Check if existing KB was built from the same CSV file
    if kb and kb.get("filename") == CSV_FILE:
        print(f"✅ Knowledge base already populated for '{CSV_FILE}'.")
        return

    if kb and kb.get("filename") != CSV_FILE:
        print(f"🔄 CSV changed ({kb.get('filename')} → {CSV_FILE}). Regenerating context...")

    if not os.path.exists(DB_FILE):
        print("⚠️  DB not ready — skipping context generation.")
        return

    print("📚 Generating knowledge base context …")
    try:
        conn = sqlite3.connect(DB_FILE)
        df   = pd.read_sql_query(f"SELECT * FROM {TABLE_NAME}", conn)
        conn.close()

        context = build_column_descriptions(df)

        with open(KNOWLEDGE_BASE_FILE, "w") as f:
            json.dump(context, f, indent=2)

        print(f"✅ Context generated for '{CSV_FILE}' ({len(df.columns)} columns).")
    except Exception as e:
        print(f"❌ Context generation failed: {e}")

auto_generate_context()

# ─── HELPERS ─────────────────────────────────────────────────────────────────
def get_table_meta() -> dict:
    """Return the knowledge base record for the current table."""
    with open(KNOWLEDGE_BASE_FILE, "r") as f:
        return json.load(f)


def validate_column(col: str) -> bool:
    """Reject column names not in the schema to prevent SQL injection."""
    meta = get_table_meta()
    return col in meta.get("columns", {}).keys()


# ─── PYDANTIC MODELS ─────────────────────────────────────────────────────────
class DbIngestRequest(BaseModel):
    csv_file:   str = CSV_FILE
    table_name: str = TABLE_NAME

class DataQueryRequest(BaseModel):
    """
    Fully dynamic query — the agent passes column names it learned from context.
    filters: [{"column": "ocean_proximity", "op": "=",  "value": "INLAND"},
              {"column": "price",           "op": ">=", "value": 100000}]
    """
    filters:    Optional[List[Dict[str, Any]]] = None
    sort_by:    Optional[str]  = None
    sort_order: Optional[str]  = "ASC"
    limit:      Optional[int]  = 5
    columns:    Optional[List[str]] = None   # None = SELECT *

class DataStatsRequest(BaseModel):
    """
    Fully dynamic aggregation — agent passes real column names.
    filters: same format as DataQueryRequest
    """
    group_by:   str
    target_col: str
    agg_type:   Optional[str]  = "AVG"
    filters:    Optional[List[Dict[str, Any]]] = None


# ─── SAFE SQL BUILDER ────────────────────────────────────────────────────────
ALLOWED_OPS = {"=", "!=", ">", ">=", "<", "<=", "LIKE", "IN"}

def build_where(filters: Optional[List[Dict[str, Any]]]):
    """
    Build parameterised WHERE clause from a list of filter dicts.
    Returns (where_str, args_list).
    """
    if not filters:
        return "1=1", []

    clauses, args = [], []
    for f in filters:
        col = f.get("column", "")
        op  = str(f.get("op", "=")).upper()
        val = f.get("value")

        if not validate_column(col):
            continue          # silently skip unknown columns
        if op not in ALLOWED_OPS:
            continue

        clauses.append(f"{col} {op} ?")
        args.append(val)

    return (" AND ".join(clauses) if clauses else "1=1"), args


# ─── ENDPOINTS ───────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status":     "online",
        "table":      TABLE_NAME,
        "csv_source": CSV_FILE,
        "database":   "connected" if os.path.exists(DB_FILE) else "missing",
    }


@app.get("/schema")
async def get_schema():
    """Return full schema + column metadata for the active table."""
    try:
        meta = get_table_meta()
        return {
            "filename": meta.get("filename"),
            "columns":  list(meta.get("columns", {}).keys()),
            "column_descriptions": meta.get("columns", {}),
        }
    except Exception as e:
        raise HTTPException(500, detail=str(e))


@app.post("/ingest/generate_context")
async def ingest_and_analyze(request: DbIngestRequest):
    """Re-ingest a (new) CSV file and rebuild the knowledge base."""
    try:
        # Load CSV
        df = pd.read_csv(request.csv_file)
        df.columns = [
            c.strip().lower().replace(" ", "_").replace("-", "_")
            for c in df.columns
        ]
        tname = csv_to_table_name(request.csv_file)

        # Write to DB
        conn = sqlite3.connect(DB_FILE)
        df.to_sql(tname, conn, if_exists="replace", index=False)
        conn.close()

        context = build_column_descriptions(df)

        # Overwrite knowledge base with new record
        with open(KNOWLEDGE_BASE_FILE, "w") as f:
            json.dump(context, f, indent=2)

        return {
            "status":  "Context Generated",
            "filename": request.csv_file,
            "columns": list(df.columns),
        }
    except Exception as e:
        raise HTTPException(500, detail=str(e))


@app.post("/tools/data_query")
async def data_query(request: DataQueryRequest):
    """
    Generic row-level query. Fully dynamic — no hardcoded column names.
    """
    try:
        meta = get_table_meta()
        tname = TABLE_NAME

        # SELECT clause
        if request.columns:
            safe_cols = [c for c in request.columns if validate_column(c)]
            select = ", ".join(safe_cols) if safe_cols else "*"
        else:
            select = "*"

        # WHERE clause
        where, args = build_where(request.filters)

        # ORDER BY
        sort_col = request.sort_by
        if sort_col and not validate_column(sort_col):
            sort_col = None
        order    = "DESC" if str(request.sort_order or "ASC").upper() == "DESC" else "ASC"
        order_clause = f"ORDER BY {sort_col} {order}" if sort_col else ""

        limit = int(request.limit or 5)

        query = f"SELECT {select} FROM {tname} WHERE {where} {order_clause} LIMIT {limit}"
        print(f"[data_query] {query} | args={args}")

        conn = sqlite3.connect(DB_FILE)
        df   = pd.read_sql_query(query, conn, params=args)
        conn.close()

        return {"result": df.to_dict(orient="records"), "count": len(df)}
    except Exception as e:
        print(f"[data_query ERROR] {e}")
        return {"result": [], "error": str(e)}


@app.post("/tools/data_stats")
async def data_stats(request: DataStatsRequest):
    """
    Generic aggregation / stats. Fully dynamic — no hardcoded column names.
    """
    try:
        meta  = get_table_meta()
        tname = TABLE_NAME

        # Validate columns
        if not validate_column(request.group_by):
            return {"result": [], "error": f"Unknown column: {request.group_by}"}
        if not validate_column(request.target_col):
            return {"result": [], "error": f"Unknown column: {request.target_col}"}

        agg_map = {"average": "AVG", "mean": "AVG", "avg": "AVG",
                   "sum": "SUM", "count": "COUNT", "min": "MIN", "max": "MAX"}
        sql_agg = agg_map.get(str(request.agg_type or "AVG").lower(), "AVG")

        where, args = build_where(request.filters)

        query = (f"SELECT {request.group_by}, {sql_agg}({request.target_col}) as value "
                 f"FROM {tname} WHERE {where} "
                 f"GROUP BY {request.group_by} ORDER BY value DESC")

        print(f"[data_stats] {query} | args={args}")

        conn = sqlite3.connect(DB_FILE)
        df   = pd.read_sql_query(query, conn, params=args)
        conn.close()

        return {
            "result": df.to_dict(orient="records"),
            "count":  len(df),
            "query_params": {
                "group_by":   request.group_by,
                "target_col": request.target_col,
                "agg_type":   sql_agg,
            },
        }
    except Exception as e:
        print(f"[data_stats ERROR] {e}")
        return {"result": [], "error": str(e)}


if __name__ == "__main__":
    import asyncio
    import sys

    async def serve():
        config = uvicorn.Config(app, host="0.0.0.0", port=8000)
        server = uvicorn.Server(config)
        await server.serve()

    if sys.platform == "win32":
        # SelectorEventLoop avoids ProactorEventLoop connection-reset noise (Python 3.12+)
        loop = asyncio.SelectorEventLoop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(serve())
    else:
        asyncio.run(serve())