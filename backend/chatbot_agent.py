"""
chatbot_agent.py  —  AI agent frontend
Run:  python chatbot_agent.py   (port 8001)
Requires datapipeline_api.py running on port 8000 first.
"""

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import os
import re
import ast
import requests
import traceback
from typing import Union
from langchain_core.messages import HumanMessage, SystemMessage

try:
    from config import model
except ImportError:
    model = None

# ─── CONFIG ───────────────────────────────────────────────────────────────────
WORKING_DIR         = "pipeline_workspace"
KNOWLEDGE_BASE_FILE = os.path.join(WORKING_DIR, "final_records.json")

PIPELINE_BASE    = "http://127.0.0.1:8000"
SEARCH_API_URL   = f"{PIPELINE_BASE}/tools/housing_query"
STATS_API_URL    = f"{PIPELINE_BASE}/tools/housing_stats"

app = FastAPI(title="Agent Interface")

# CORS — allows the frontend (HTML file / different port) to reach this server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── MODELS ───────────────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    response: Union[dict, str]

# ─── HELPERS ──────────────────────────────────────────────────────────────────
def get_context_summary() -> str:
    if not os.path.exists(KNOWLEDGE_BASE_FILE):
        return "No data loaded yet."
    with open(KNOWLEDGE_BASE_FILE, "r") as f:
        return json.dumps(json.load(f), indent=2)


def parse_all_tool_calls(text: str) -> list:
    """
    Extract ALL JSON tool-call blocks from LLM text using brace-depth tracking.
    Handles multi-tool responses and ignores surrounding explanation text.
    """
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
    """Build a valid Vega-Lite v5 spec directly in Python — no LLM involved."""
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

    # Default → bar chart
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


def call_pipeline(url: str, payload: dict) -> dict:
    """Call datapipeline_api with error handling."""
    try:
        res = requests.post(url, json=payload, timeout=10)
        return res.json()
    except requests.exceptions.ConnectionError:
        raise RuntimeError(
            "Cannot reach datapipeline_api. "
            "Make sure datapipeline_api.py is running on port 8000."
        )


# ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    pipeline_ok = False
    try:
        r = requests.get(f"{PIPELINE_BASE}/health", timeout=2)
        pipeline_ok = r.status_code == 200
    except Exception:
        pass
    return {
        "agent":    "online",
        "model":    "loaded" if model else "MISSING — check config.py",
        "pipeline": "online" if pipeline_ok else "OFFLINE — start datapipeline_api.py on port 8000",
    }


# ─── CHAT ENDPOINT ────────────────────────────────────────────────────────────
@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    if not model:
        return ChatResponse(response="Error: AI model not loaded. Check config.py.")

    system_prompt = f"""You are a data agent for a California Housing dataset. Your ONLY job is to output a JSON tool call — no explanations, no commentary, no markdown.

DATABASE CONTEXT:
{get_context_summary()}

TOOLS:

housing_query — fetch individual records
  ocean_proximity: "NEAR OCEAN" | "INLAND" | "<1H OCEAN" | "NEAR BAY" | "ISLAND"
  min_price, max_price: float (filters on median_house_value)
  min_bedrooms, max_bedrooms: float (filters on total_bedrooms)
  sort_by: column name | sort_order: "ASC" or "DESC" | limit: int

housing_stats — aggregated stats for charts
  group_by: column to group (e.g. "ocean_proximity", "housing_median_age")
  target_col: column to aggregate (default "median_house_value")
  agg_type: "AVG" | "SUM" | "COUNT" | "MIN" | "MAX"
  filter_min_price: float (optional - scope stats to houses above this price)
  filter_max_price: float (optional - scope stats to houses below this price)
  filter_ocean_proximity: str (optional - scope stats to this location)

RULES:
- Output ONLY raw JSON. No text before or after. No explanations.
- If user asks to FIND, LIST, SHOW, GET → housing_query
- If user asks to PLOT, CHART, GRAPH, VISUALIZE → housing_stats
- If user asks BOTH (e.g. "find X and plot Y") → output TWO JSON blocks, one per line
- "under $200,000" / "below $200k"  → max_price: 200000
- "over $500,000"  / "above $500k"  → min_price: 500000
- "costliest" / "most expensive"    → sort_order: "DESC"
- "cheapest"  / "lowest price"      → sort_order: "ASC"
- For greetings → reply in plain text only (no JSON)

EXAMPLES:

User: Find the 5 most expensive houses
{{"tool":"housing_query","parameters":{{"sort_by":"median_house_value","sort_order":"DESC","limit":5}}}}

User: Show cheapest inland houses
{{"tool":"housing_query","parameters":{{"ocean_proximity":"INLAND","sort_by":"median_house_value","sort_order":"ASC","limit":5}}}}

User: Plot average price by ocean proximity
{{"tool":"housing_stats","parameters":{{"group_by":"ocean_proximity","target_col":"median_house_value","agg_type":"AVG"}}}}

User: Find houses under $200,000 and plot their age distribution
{{"tool":"housing_query","parameters":{{"max_price":200000,"sort_by":"median_house_value","sort_order":"ASC","limit":5}}}}
{{"tool":"housing_stats","parameters":{{"group_by":"housing_median_age","agg_type":"COUNT","filter_max_price":200000}}}}

User: Hello
Hello! I can help you explore the California Housing dataset. Try asking me to find houses, compare prices, or plot charts!
"""

    messages = [SystemMessage(content=system_prompt),
                HumanMessage(content=request.message)]

    try:
        # Step 1: LLM decides which tool(s) to call
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

            if tool_name == "housing_query":
                print(f"[housing_query] {params}")
                result_data = call_pipeline(SEARCH_API_URL, params)

                summary = model.invoke([HumanMessage(content=f"""
User asked: "{request.message}"
Results ({result_data.get('count', 0)} rows):
{json.dumps(result_data.get('result', []), indent=2)}

Summarise clearly and concisely.
Format prices with $ and commas (e.g. $240,084).
Highlight the most relevant facts. No raw JSON in reply.
""")]).content
                return ChatResponse(response=str(summary))

            elif tool_name == "housing_stats":
                print(f"[housing_stats] {params}")
                data = call_pipeline(STATS_API_URL, params)
                if not data.get("result"):
                    return ChatResponse(response="No data returned from the database.")
                return ChatResponse(response=build_vegalite_spec(data["result"], request.message))

        # ── MULTI-TOOL CALL (e.g. find + plot) ────────────────────────────
        query_calls = [tc for tc in tool_calls if tc.get("tool") == "housing_query"]
        stats_calls = [tc for tc in tool_calls if tc.get("tool") == "housing_stats"]

        if stats_calls:
            # Use filter params from query call to scope the stats
            stats_params = stats_calls[0].get("parameters", {})

            # If stats already has filters embedded, use them directly
            # Otherwise pull filters from the query call
            if query_calls and "filter_max_price" not in stats_params and "filter_min_price" not in stats_params:
                q_params = query_calls[0].get("parameters", {})
                if q_params.get("max_price") is not None:
                    stats_params["filter_max_price"] = q_params["max_price"]
                if q_params.get("min_price") is not None:
                    stats_params["filter_min_price"] = q_params["min_price"]
                if q_params.get("ocean_proximity"):
                    stats_params["filter_ocean_proximity"] = q_params["ocean_proximity"]

            print(f"[multi-tool housing_stats] {stats_params}")
            data = call_pipeline(STATS_API_URL, stats_params)
            if not data.get("result"):
                return ChatResponse(response="No data returned for the given filters.")
            return ChatResponse(response=build_vegalite_spec(data["result"], request.message))

        # Fallback: run the first query call
        result_data = call_pipeline(SEARCH_API_URL, query_calls[0].get("parameters", {}))
        summary = model.invoke([HumanMessage(content=f"""
User asked: "{request.message}"
Results ({result_data.get('count', 0)} rows):
{json.dumps(result_data.get('result', []), indent=2)}

Summarise clearly. Format prices with $ and commas. No raw JSON.
""")]).content
        return ChatResponse(response=str(summary))

    except RuntimeError as e:
        return ChatResponse(response=str(e))
    except Exception as e:
        traceback.print_exc()
        return ChatResponse(response=f"Error: {str(e)}")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)