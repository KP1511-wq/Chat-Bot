import uvicorn
import re
import ast
import traceback
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import sqlite3
import json
import os
import uuid
import datetime
from typing import Optional, List, Any, Dict, Union
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

try:
    from config import model
except ImportError:
    model = None

CSV_FILE = "housing.csv"          # default CSV (used when no user dataset loaded yet)
DEFAULT_TABLE = "housing"
UPLOAD_DIR   = "data"             # directory for user-uploaded CSVs

WORKING_DIR           = "pipeline_workspace"
KNOWLEDGE_BASE_FILE   = os.path.join(WORKING_DIR, "final_records.json")
ACTIVE_DATASET_FILE   = os.path.join(WORKING_DIR, "active_dataset.json")

os.makedirs(WORKING_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)
if not os.path.exists(KNOWLEDGE_BASE_FILE):
    with open(KNOWLEDGE_BASE_FILE, "w") as f:
        json.dump({}, f)


# ─── DERIVE TABLE NAME FROM CSV FILENAME ─────────────────────────────────────
def csv_to_table_name(csv_path: str) -> str:
    """housing.csv → housing   |   my sales data.csv → my_sales_data"""
    base = os.path.splitext(os.path.basename(csv_path))[0]
    return base.strip().lower().replace(" ", "_").replace("-", "_")


def get_active_dataset() -> dict:
    """Current dataset (user-provided or default). Keys: csv_file, table_name, db_file."""
    if os.path.exists(ACTIVE_DATASET_FILE):
        try:
            with open(ACTIVE_DATASET_FILE, "r") as f:
                d = json.load(f)
                if d.get("csv_file") and os.path.exists(d["csv_file"]):
                    return d
        except Exception:
            pass
    # Default
    base = os.path.splitext(os.path.basename(CSV_FILE))[0].strip().lower().replace(" ", "_").replace("-", "_")
    return {
        "csv_file":   CSV_FILE,
        "table_name": base or DEFAULT_TABLE,
        "db_file":    os.path.join(WORKING_DIR, (base or DEFAULT_TABLE) + ".db"),
    }


def get_current_csv_file() -> str:
    return get_active_dataset()["csv_file"]


def get_current_table_name() -> str:
    return get_active_dataset()["table_name"]


def get_current_db_file() -> str:
    return get_active_dataset()["db_file"]


def set_active_dataset(csv_file: str):
    """Persist the active dataset so all endpoints use it."""
    tname = csv_to_table_name(csv_file)
    db_file = os.path.join(WORKING_DIR, tname + ".db")
    with open(ACTIVE_DATASET_FILE, "w") as f:
        json.dump({"csv_file": csv_file, "table_name": tname, "db_file": db_file}, f, indent=2)


# Ensure active dataset file exists on first run
if not os.path.exists(ACTIVE_DATASET_FILE):
    set_active_dataset(CSV_FILE)

app = FastAPI(title="Dynamic Data Pipeline + Chat Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── DATABASE INIT ────────────────────────────────────────────────────────────
def initialize_database():
    """Load CSV into SQLite for the active dataset. Runs once per dataset."""
    csv_path = get_current_csv_file()
    db_file  = get_current_db_file()
    tname    = get_current_table_name()
    if os.path.exists(db_file):
        print(f"✅ Database already exists at {db_file}")
        return
    search_paths = [csv_path, os.path.join(UPLOAD_DIR, os.path.basename(csv_path)), os.path.join("data", os.path.basename(csv_path))]
    for path in search_paths:
        if os.path.exists(path):
            try:
                print(f"📂 Loading {path} …")
                df = pd.read_csv(path)
                df.columns = [
                    c.strip().lower().replace(" ", "_").replace("-", "_").replace("(", "").replace(")", "")
                    for c in df.columns
                ]
                conn = sqlite3.connect(db_file)
                df.to_sql(tname, conn, if_exists="replace", index=False)
                conn.close()
                print(f"✅ Created table '{tname}' with {len(df):,} rows and {len(df.columns)} columns.")
                return
            except Exception as e:
                print(f"❌ Error loading CSV: {e}")
                return
    print(f"⚠️  '{csv_path}' not found. Provide a CSV path or upload a file to load data.")

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


def build_column_descriptions(df: pd.DataFrame, filename: str = None) -> dict:
    """Build column descriptions. filename defaults to current dataset."""
    if filename is None:
        filename = get_current_csv_file()
    columns = {}
    for col in df.columns:
        dtype = str(df[col].dtype)
        sample_vals = df[col].dropna().unique().tolist()[:5]
        meaning = infer_column_meaning(col, dtype, sample_vals)
        parts = [meaning]
        if df[col].dtype in ["int64", "float64"]:
            parts.append(f"Range: {df[col].min():.2f} to {df[col].max():.2f}")
            parts.append(f"Average: {df[col].mean():.2f}")
        nunique = df[col].nunique()
        if df[col].dtype == "object" or nunique <= 30:
            unique_vals = df[col].dropna().unique().tolist()[:5]
            if unique_vals:
                parts.append(f"Possible values: {', '.join(map(str, unique_vals))}")
        null_count = df[col].isna().sum()
        if null_count > 0:
            parts.append(f"Note: {null_count} missing values")
        columns[col] = ". ".join(parts) + "."
    return {"filename": filename, "columns": columns}


def _run_auto_generate_context():
    """Auto-generates knowledge base on startup for the active dataset."""
    with open(KNOWLEDGE_BASE_FILE, "r") as f:
        kb = json.load(f)
    csv_path = get_current_csv_file()
    db_file  = get_current_db_file()
    tname    = get_current_table_name()
    if kb and kb.get("filename") == csv_path:
        print(f"✅ Knowledge base already populated for '{csv_path}'.")
        return
    if kb and kb.get("filename") != csv_path:
        print(f"🔄 CSV changed ({kb.get('filename')} → {csv_path}). Regenerating context...")
    if not os.path.exists(db_file):
        print("⚠️  DB not ready — skipping context generation.")
        return
    print("📚 Generating knowledge base context …")
    try:
        conn = sqlite3.connect(db_file)
        df   = pd.read_sql_query(f"SELECT * FROM {tname}", conn)
        conn.close()
        context = build_column_descriptions(df, filename=csv_path)
        with open(KNOWLEDGE_BASE_FILE, "w") as f:
            json.dump(context, f, indent=2)
        print(f"✅ Context generated for '{csv_path}' ({len(df.columns)} columns).")
    except Exception as e:
        print(f"❌ Context generation failed: {e}")

_run_auto_generate_context()

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
    table_name: str = DEFAULT_TABLE

class DataQueryRequest(BaseModel):
    """
    Fully dynamic query — the agent passes column names it learned from context.
    filters: [{"column": "some_col", "op": "=",  "value": "INLAND"},
              {"column": "price",    "op": ">=", "value": 100000}]
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
    group_by:   Optional[str]  = None
    target_col: Optional[str]  = None
    agg_type:   Optional[str]  = "AVG"
    filters:    Optional[List[Dict[str, Any]]] = None


class HistoryMessage(BaseModel):
    role: str       # "user" or "agent"
    content: str

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[HistoryMessage]] = None


class ChatResponse(BaseModel):
    response: Union[dict, str]


# ─── CHAT AGENT HELPERS ──────────────────────────────────────────────────────
def get_context_summary() -> str:
    if not os.path.exists(KNOWLEDGE_BASE_FILE):
        return "No data loaded yet."
    with open(KNOWLEDGE_BASE_FILE, "r") as f:
        return json.dumps(json.load(f), indent=2)


def parse_all_tool_calls(text: str) -> list:
    """Extract ALL JSON tool-call blocks from LLM text using brace-depth tracking."""
    text  = re.sub(r"```json\s*|\s*```", "", text)
    calls = []
    i     = 0
    while i < len(text):
        if text[i] == "{":
            depth = 0
            j     = i
            while j < len(text):
                if   text[j] == "{": depth += 1
                elif text[j] == "}":
                    depth -= 1
                    if depth == 0:
                        blob = text[i:j+1].replace("\n", " ")
                        blob = re.sub(r"\s+", " ", blob)
                        try:
                            obj = json.loads(blob)
                            if "tool" in obj:
                                calls.append(obj)
                        except Exception:
                            try:
                                obj = ast.literal_eval(blob)
                                if "tool" in obj:
                                    calls.append(obj)
                            except Exception:
                                pass
                        i = j + 1
                        break
                j += 1
            else:
                i += 1
        else:
            i += 1
    return calls


def build_vegalite_spec(data_values: list, user_message: str) -> dict:
    """Build a valid Vega-Lite v5 spec directly in Python."""
    msg         = user_message.lower()
    group_field = list(data_values[0].keys())[0]
    base        = {"$schema": "https://vega.github.io/schema/vega-lite/v5.json",
                   "data":    {"values": data_values}}

    if any(k in msg for k in ["pie", "distribution", "share", "proportion"]):
        return {**base, "width": 400, "height": 400,
                "mark": {"type": "arc", "outerRadius": 120},
                "encoding": {
                    "theta": {"field": "value", "type": "quantitative"},
                    "color": {"field": group_field, "type": "nominal",
                              "legend": {"title": group_field}}}}

    if any(k in msg for k in ["scatter", "correlation", "relationship"]):
        return {**base, "width": 700, "height": 500, "mark": "circle",
                "encoding": {
                    "x": {"field": group_field, "type": "quantitative"},
                    "y": {"field": "value",     "type": "quantitative"}}}

    if any(k in msg for k in ["line", "trend", "over time", "evolution"]):
        return {**base, "width": 700, "height": 500, "mark": "line",
                "encoding": {
                    "x": {"field": group_field, "type": "quantitative"},
                    "y": {"field": "value",     "type": "quantitative"}}}

    x_type = "quantitative" if any(
        isinstance(d.get(group_field), (int, float)) for d in data_values
    ) else "nominal"

    return {**base, "width": 700, "height": 450, "mark": "bar",
            "encoding": {
                "x": {"field": group_field, "type": x_type,
                      "sort": "-y" if x_type == "nominal" else None,
                      "axis": {"labelAngle": -30}},
                "y": {"field": "value", "type": "quantitative"},
                "tooltip": [
                    {"field": group_field, "type": x_type},
                    {"field": "value", "type": "quantitative", "format": ",.0f"}]}}


# ─── DYNAMIC SYSTEM PROMPT BUILDER ───────────────────────────────────────────
def pretty_dataset_name(raw_path: str) -> str:
    """Convert a raw file path into a clean, human-readable dataset name.
    'data/tested.csv' → 'Tested'   |   'data\\Heart_Disease_Prediction.csv' → 'Heart Disease Prediction'
    """
    base = os.path.splitext(os.path.basename(raw_path))[0]          # 'Heart_Disease_Prediction'
    name = base.replace("_", " ").replace("-", " ").strip()          # 'Heart Disease Prediction'
    return name.title() if name else "Dataset"                       # Title-case


def _build_column_list_for_prompt(meta: dict) -> str:
    """Format column metadata into a concise description for the LLM prompt."""
    columns = meta.get("columns", {})
    if not columns:
        return "No columns available."
    lines = []
    for col_name, description in columns.items():
        lines.append(f"  - {col_name}: {description}")
    return "\n".join(lines)


def _identify_column_types(meta: dict) -> Dict[str, List[str]]:
    """Classify columns into numeric and categorical for prompt examples."""
    columns = meta.get("columns", {})
    numeric_cols = []
    categorical_cols = []
    for col_name, desc in columns.items():
        desc_lower = desc.lower()
        if any(kw in desc_lower for kw in ["numeric", "range:", "average:", "price", "count", "quantity", "latitude", "longitude", "percentage", "rate"]):
            numeric_cols.append(col_name)
        elif any(kw in desc_lower for kw in ["categorical", "possible values:", "label", "classification", "text"]):
            categorical_cols.append(col_name)
        else:
            # Fallback: if it has "Range:" it's numeric
            if "range:" in desc_lower:
                numeric_cols.append(col_name)
            else:
                categorical_cols.append(col_name)
    return {"numeric": numeric_cols, "categorical": categorical_cols}


def build_dynamic_system_prompt() -> str:
    """Build a system prompt dynamically from the currently loaded dataset's metadata."""
    context_summary = get_context_summary()
    meta = get_table_meta()
    raw_filename = meta.get("filename", "unknown dataset")
    dataset_name = pretty_dataset_name(raw_filename)
    col_types = _identify_column_types(meta)
    numeric_cols = col_types["numeric"]
    categorical_cols = col_types["categorical"]
    all_cols = list(meta.get("columns", {}).keys())

    # Pick example columns for the prompt (use real column names from the dataset)
    example_numeric = numeric_cols[0] if numeric_cols else (all_cols[0] if all_cols else "value")
    example_numeric2 = numeric_cols[1] if len(numeric_cols) > 1 else example_numeric
    example_categorical = categorical_cols[0] if categorical_cols else (all_cols[-1] if all_cols else "category")

    prompt = f"""You are a data analysis agent for the dataset: "{dataset_name}".
Your ONLY job is to output a JSON tool call — no explanations, no commentary, no markdown.

DATABASE SCHEMA & CONTEXT:
{context_summary}

AVAILABLE COLUMNS:
{_build_column_list_for_prompt(meta)}

TOOLS:

data_query — fetch individual records from the dataset
  Parameters (all optional):
  filters: list of filter objects, each with "column", "op", and "value"
    - column: any column name from the schema above
    - op: "=" | "!=" | ">" | ">=" | "<" | "<=" | "LIKE" | "IN"
    - value: the filter value (string or number, matching the column type)
  columns: list of column names to return (omit for all columns)
  sort_by: column name to sort by
  sort_order: "ASC" or "DESC"
  limit: number of rows to return (default 5)

data_stats — aggregated statistics for charts and summaries
  Parameters:
  group_by: column name to group by (REQUIRED)
  target_col: column name to aggregate (REQUIRED)
  agg_type: "AVG" | "SUM" | "COUNT" | "MIN" | "MAX" (default "AVG")
  filters: same format as data_query filters (optional)

RULES:
- Output ONLY raw JSON. No text before or after. No explanations.
- Use ONLY column names that exist in the schema above. Never invent column names.
- If user asks to FIND, LIST, SHOW, GET, SEARCH → data_query
- If user asks to PLOT, CHART, GRAPH, VISUALIZE, COMPARE averages/totals → data_stats
- If user asks BOTH (e.g. "find X and plot Y") → output TWO JSON blocks, one per line
- For "most expensive", "highest", "top" → sort_order: "DESC"
- For "cheapest", "lowest", "bottom" → sort_order: "ASC"
- For greetings or questions unrelated to the data → reply in plain text only (no JSON)

EXAMPLES (using columns from the current dataset):

User: Show me the top 5 records by {example_numeric}
{{"tool":"data_query","parameters":{{"sort_by":"{example_numeric}","sort_order":"DESC","limit":5}}}}

User: Find records where {example_categorical} equals a specific value
{{"tool":"data_query","parameters":{{"filters":[{{"column":"{example_categorical}","op":"=","value":"EXAMPLE"}}],"limit":5}}}}

User: Plot average {example_numeric} by {example_categorical}
{{"tool":"data_stats","parameters":{{"group_by":"{example_categorical}","target_col":"{example_numeric}","agg_type":"AVG"}}}}

User: Show count of records grouped by {example_categorical}
{{"tool":"data_stats","parameters":{{"group_by":"{example_categorical}","target_col":"{example_numeric}","agg_type":"COUNT"}}}}

User: Hello
Hello! I can help you explore the "{dataset_name}" dataset. Try asking me to find records, compare values, or plot charts!
"""
    return prompt


# ─── DYNAMIC SUGGESTED QUERIES ───────────────────────────────────────────────
def generate_suggested_queries() -> List[Dict[str, str]]:
    """Generate dataset-aware suggested queries based on loaded schema."""
    try:
        meta = get_table_meta()
        columns = meta.get("columns", {})
        if not columns:
            return [
                {"icon": "📂", "text": "Load a dataset first to see suggestions"},
            ]

        col_types = _identify_column_types(meta)
        numeric_cols = col_types["numeric"]
        categorical_cols = col_types["categorical"]
        all_cols = list(columns.keys())
        filename = os.path.splitext(os.path.basename(meta.get("filename", "data")))[0]

        suggestions = []

        # 1. Top N by a numeric column
        if numeric_cols:
            col = numeric_cols[0]
            suggestions.append({"icon": "🏆", "text": f"Show the top 5 records by {col}"})

        # 2. Find records with a filter on a categorical column
        if categorical_cols:
            col = categorical_cols[0]
            # Try to get an example value
            desc = columns.get(col, "")
            example_val = ""
            if "Possible values:" in desc:
                vals_str = desc.split("Possible values:")[1].split(".")[0].strip()
                first_val = vals_str.split(",")[0].strip()
                if first_val:
                    example_val = first_val
            if example_val:
                suggestions.append({"icon": "🔍", "text": f"Find records where {col} is {example_val}"})
            else:
                suggestions.append({"icon": "🔍", "text": f"Find records filtered by {col}"})

        # 3. Plot average of numeric by categorical
        if numeric_cols and categorical_cols:
            suggestions.append({"icon": "📊", "text": f"Plot average {numeric_cols[0]} by {categorical_cols[0]}"})

        # 4. Count by category (pie chart)
        if categorical_cols:
            suggestions.append({"icon": "📈", "text": f"Show count of records by {categorical_cols[0]} as a pie chart"})

        # 5. Sort by another numeric column
        if len(numeric_cols) > 1:
            suggestions.append({"icon": "📉", "text": f"Show the bottom 5 records by {numeric_cols[1]}"})

        # 6. General explore
        suggestions.append({"icon": "💡", "text": f"What columns are in this dataset?"})

        return suggestions[:6]

    except Exception as e:
        print(f"[generate_suggested_queries ERROR] {e}")
        return [
            {"icon": "🔍", "text": "Show the first 5 records"},
            {"icon": "📊", "text": "Plot a chart of the data"},
        ]


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
        "table":      get_current_table_name(),
        "csv_source": get_current_csv_file(),
        "database":   "connected" if os.path.exists(get_current_db_file()) else "missing",
        "agent":      "online",
        "model":      "loaded" if model else "MISSING — check config.py",
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


@app.get("/schema/suggestions")
async def get_suggestions():
    """Return dynamic suggested queries based on the currently loaded dataset."""
    return {"suggestions": generate_suggested_queries()}


class ColumnUpdateRequest(BaseModel):
    """Update one or more column descriptions."""
    columns: Dict[str, str]   # {"col_name": "new description", ...}


@app.get("/context")
async def get_context_endpoint():
    """Return the full generated context/knowledge-base for the active dataset."""
    try:
        meta = get_table_meta()
        columns = meta.get("columns", {})
        raw_filename = meta.get("filename", "unknown")
        dataset_name = pretty_dataset_name(raw_filename)
        col_types = _identify_column_types(meta)

        # Row count
        row_count = 0
        db_file = get_current_db_file()
        tname = get_current_table_name()
        if os.path.exists(db_file):
            try:
                conn = sqlite3.connect(db_file)
                row_count = int(pd.read_sql_query(
                    f"SELECT COUNT(*) as n FROM {tname}", conn
                ).iloc[0]["n"])
                conn.close()
            except Exception:
                pass

        return {
            "dataset_name": dataset_name,
            "filename": raw_filename,
            "row_count": row_count,
            "total_columns": len(columns),
            "numeric_columns": col_types["numeric"],
            "categorical_columns": col_types["categorical"],
            "column_details": columns,
        }
    except Exception as e:
        raise HTTPException(500, detail=str(e))


@app.patch("/context/columns")
async def update_column_descriptions(request: ColumnUpdateRequest):
    """Update column descriptions in the knowledge base.
    The user can edit descriptions; the changes are saved to the JSON file
    and immediately reflected in the chatbot's system prompt."""
    try:
        with open(KNOWLEDGE_BASE_FILE, "r") as f:
            kb = json.load(f)

        existing_cols = kb.get("columns", {})
        updated = []
        unknown = []

        for col_name, new_desc in request.columns.items():
            if col_name in existing_cols:
                existing_cols[col_name] = new_desc
                updated.append(col_name)
            else:
                unknown.append(col_name)

        kb["columns"] = existing_cols

        with open(KNOWLEDGE_BASE_FILE, "w") as f:
            json.dump(kb, f, indent=2)

        print(f"[context/columns] Updated: {updated} | Unknown: {unknown}")
        return {
            "status": "updated",
            "updated_columns": updated,
            "unknown_columns": unknown,
        }
    except Exception as e:
        raise HTTPException(500, detail=str(e))


@app.post("/context/regenerate")
async def regenerate_context():
    """Force-regenerate the auto-detected context for the active dataset.
    This is useful if the user wants to reset all manual edits back to auto-detected values."""
    try:
        csv_path = get_current_csv_file()
        db_file  = get_current_db_file()
        tname    = get_current_table_name()
        if not os.path.exists(db_file):
            raise HTTPException(400, detail="No database found. Upload data first.")
        conn = sqlite3.connect(db_file)
        df   = pd.read_sql_query(f"SELECT * FROM {tname}", conn)
        conn.close()
        context = build_column_descriptions(df, filename=csv_path)
        with open(KNOWLEDGE_BASE_FILE, "w") as f:
            json.dump(context, f, indent=2)
        return {
            "status": "regenerated",
            "filename": csv_path,
            "columns": len(context.get("columns", {})),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, detail=str(e))



def _do_ingest(csv_path: str) -> dict:
    """Load CSV/Excel, build DB and context, set as active dataset. Returns summary dict."""
    ext = os.path.splitext(csv_path)[1].lower()
    if ext in (".xlsx", ".xls"):
        df = pd.read_excel(csv_path)
    else:
        df = pd.read_csv(csv_path)
    df.columns = [
        c.strip().lower().replace(" ", "_").replace("-", "_").replace("(", "").replace(")", "")
        for c in df.columns
    ]
    tname   = csv_to_table_name(csv_path)
    db_file = os.path.join(WORKING_DIR, tname + ".db")
    conn = sqlite3.connect(db_file)
    df.to_sql(tname, conn, if_exists="replace", index=False)
    conn.close()
    context = build_column_descriptions(df, filename=csv_path)
    with open(KNOWLEDGE_BASE_FILE, "w") as f:
        json.dump(context, f, indent=2)
    set_active_dataset(csv_path)
    return {"filename": csv_path, "columns": list(df.columns), "rows": len(df)}


@app.post("/ingest/generate_context")
async def ingest_and_analyze(request: DbIngestRequest):
    """User provides path of CSV/Excel file → data understanding pipeline → JSON stored → info passed to agent."""
    try:
        path = request.csv_file.strip()
        if not os.path.exists(path):
            # Try relative to common dirs
            for base in [UPLOAD_DIR, "data", "."]:
                p = os.path.join(base, os.path.basename(path))
                if os.path.exists(p):
                    path = p
                    break
            else:
                raise HTTPException(400, detail=f"File not found: {request.csv_file}")
        result = _do_ingest(path)
        return {"status": "Context Generated", **result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, detail=str(e))


@app.post("/ingest/upload")
async def ingest_upload(file: UploadFile = File(...)):
    """User uploads a CSV file → saved, then data understanding pipeline runs → JSON stored → info passed to agent."""
    if not file.filename or not file.filename.lower().endswith((".csv", ".xlsx", ".xls")):
        raise HTTPException(400, detail="Please upload a CSV or Excel file (.csv, .xlsx, .xls)")
    safe_name = os.path.basename(file.filename).replace(" ", "_")
    path = os.path.join(UPLOAD_DIR, safe_name)
    try:
        content = await file.read()
        with open(path, "wb") as f:
            f.write(content)
        result = _do_ingest(path)
        return {"status": "Context Generated", **result}
    except Exception as e:
        if os.path.exists(path):
            try:
                os.remove(path)
            except Exception:
                pass
        raise HTTPException(500, detail=str(e))


@app.get("/ingest/active")
async def get_active_dataset_info():
    """Return the currently loaded dataset (for UI)."""
    d = get_active_dataset()
    db_file = d["db_file"]
    tname = d["table_name"]
    row_count = 0
    if os.path.exists(db_file):
        try:
            conn = sqlite3.connect(db_file)
            row_count = pd.read_sql_query(f"SELECT COUNT(*) as n FROM {tname}", conn).iloc[0]["n"]
            conn.close()
        except Exception:
            pass
    return {
        "csv_file": d["csv_file"],
        "table_name": tname,
        "row_count": int(row_count),
        "display_name": pretty_dataset_name(d["csv_file"]),
    }


@app.post("/tools/data_query")
async def data_query(request: DataQueryRequest):
    """
    Generic row-level query. Fully dynamic — no hardcoded column names.
    """
    try:
        tname    = get_current_table_name()
        db_file  = get_current_db_file()
        if request.columns:
            safe_cols = [c for c in request.columns if validate_column(c)]
            select = ", ".join(safe_cols) if safe_cols else "*"
        else:
            select = "*"
        where, args = build_where(request.filters)
        sort_col = request.sort_by
        if sort_col and not validate_column(sort_col):
            sort_col = None
        order    = "DESC" if str(request.sort_order or "ASC").upper() == "DESC" else "ASC"
        order_clause = f"ORDER BY {sort_col} {order}" if sort_col else ""
        limit = int(request.limit or 5)
        query = f"SELECT {select} FROM {tname} WHERE {where} {order_clause} LIMIT {limit}"
        print(f"[data_query] {query} | args={args}")
        conn = sqlite3.connect(db_file)
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
        tname   = get_current_table_name()
        db_file = get_current_db_file()
        if not request.group_by:
            return {"result": [], "error": "group_by column is required"}
        if not request.target_col:
            return {"result": [], "error": "target_col column is required"}
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
        conn = sqlite3.connect(db_file)
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


# ─── CHAT ENDPOINT ───────────────────────────────────────────────────────────
@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    if not model:
        return ChatResponse(response="Error: AI model not loaded. Check config.py.")

    system_prompt = build_dynamic_system_prompt()

    # Build messages list with conversation history for context
    messages = [SystemMessage(content=system_prompt)]
    if request.history:
        for h in request.history:
            if h.role == "user":
                messages.append(HumanMessage(content=h.content))
            else:
                messages.append(AIMessage(content=h.content))
    messages.append(HumanMessage(content=request.message))

    try:
        raw = str(model.invoke(messages).content).strip()
        print(f"[LLM raw] {raw[:400]}")

        tool_calls = parse_all_tool_calls(raw)
        print(f"[tool_calls found] {len(tool_calls)}")

        # ── NO TOOL CALLS → plain text reply ──────────────────────────────
        if not tool_calls:
            return ChatResponse(response=raw)

        # ── SINGLE TOOL CALL ──────────────────────────────────────────────
        if len(tool_calls) == 1:
            tc        = tool_calls[0]
            tool_name = tc.get("tool")
            params    = tc.get("parameters", {})

            if tool_name == "data_query":
                print(f"[data_query] {params}")
                query_req = DataQueryRequest(
                    filters=params.get("filters"),
                    columns=params.get("columns"),
                    sort_by=params.get("sort_by"),
                    sort_order=params.get("sort_order", "ASC"),
                    limit=params.get("limit", 5),
                )
                result_data = await data_query(query_req)

                # Get dataset name for context-aware summary
                meta = get_table_meta()
                dataset_name = pretty_dataset_name(meta.get("filename", "dataset"))

                summary = model.invoke([HumanMessage(content=f"""
User asked: "{request.message}"
Dataset: {dataset_name}
Results ({result_data.get('count', 0)} rows):
{json.dumps(result_data.get('result', []), indent=2)}

Summarise clearly and concisely.
Format numeric values appropriately (use $ for monetary values, commas for large numbers).
Highlight the most relevant facts. No raw JSON in reply.
""")]).content
                return ChatResponse(response=str(summary))

            elif tool_name == "data_stats":
                print(f"[data_stats] {params}")
                group_by = params.get("group_by") or None
                target_col = params.get("target_col") or None
                if not group_by or not target_col:
                    # Fallback: try to infer from the dataset metadata
                    col_types = _identify_column_types(get_table_meta())
                    if not group_by and col_types["categorical"]:
                        group_by = col_types["categorical"][0]
                    if not target_col and col_types["numeric"]:
                        target_col = col_types["numeric"][0]
                if not group_by or not target_col:
                    return ChatResponse(response="Sorry, I couldn't determine which columns to use for the chart. Please specify a group-by column and a target column.")
                stats_req = DataStatsRequest(
                    group_by=group_by,
                    target_col=target_col,
                    agg_type=params.get("agg_type", "AVG"),
                    filters=params.get("filters"),
                )
                data = await data_stats(stats_req)
                if not data.get("result"):
                    return ChatResponse(response="No data returned from the database.")
                return ChatResponse(response=build_vegalite_spec(data["result"], request.message))

        # ── MULTI-TOOL CALL (e.g. find + plot) ────────────────────────────
        query_calls = [tc for tc in tool_calls if tc.get("tool") == "data_query"]
        stats_calls = [tc for tc in tool_calls if tc.get("tool") == "data_stats"]

        if stats_calls:
            stats_params = dict(stats_calls[0].get("parameters", {}))

            # If query call has filters, merge them into stats call if stats has none
            if query_calls and not stats_params.get("filters"):
                q_params = query_calls[0].get("parameters", {})
                if q_params.get("filters"):
                    stats_params["filters"] = q_params["filters"]

            print(f"[multi-tool data_stats] {stats_params}")
            group_by = stats_params.get("group_by") or None
            target_col = stats_params.get("target_col") or None
            if not group_by or not target_col:
                col_types = _identify_column_types(get_table_meta())
                if not group_by and col_types["categorical"]:
                    group_by = col_types["categorical"][0]
                if not target_col and col_types["numeric"]:
                    target_col = col_types["numeric"][0]
            if not group_by or not target_col:
                return ChatResponse(response="Sorry, I couldn't determine which columns to use for the chart. Please specify a group-by column and a target column.")
            stats_req = DataStatsRequest(
                group_by=group_by,
                target_col=target_col,
                agg_type=stats_params.get("agg_type", "AVG"),
                filters=stats_params.get("filters"),
            )
            data = await data_stats(stats_req)
            if not data.get("result"):
                return ChatResponse(response="No data returned for the given filters.")
            return ChatResponse(response=build_vegalite_spec(data["result"], request.message))

        # Fallback: run the first query call
        q_params = query_calls[0].get("parameters", {})
        query_req = DataQueryRequest(
            filters=q_params.get("filters"),
            columns=q_params.get("columns"),
            sort_by=q_params.get("sort_by"),
            sort_order=q_params.get("sort_order", "ASC"),
            limit=q_params.get("limit", 5),
        )
        result_data = await data_query(query_req)

        meta = get_table_meta()
        dataset_name = pretty_dataset_name(meta.get("filename", "dataset"))

        summary = model.invoke([HumanMessage(content=f"""
User asked: "{request.message}"
Dataset: {dataset_name}
Results ({result_data.get('count', 0)} rows):
{json.dumps(result_data.get('result', []), indent=2)}

Summarise clearly. Format numeric values appropriately. No raw JSON.
""")]).content
        return ChatResponse(response=str(summary))

    except Exception as e:
        traceback.print_exc()
        return ChatResponse(response=f"Error: {str(e)}")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
