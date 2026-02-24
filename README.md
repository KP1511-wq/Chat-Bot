# 🤖 Data Chat Agent

A dataset-agnostic AI chatbot that lets you explore **any CSV or Excel dataset** using natural language. Upload your data, ask questions in plain English, and get instant answers — including tables, aggregations, and interactive charts.

![Python](https://img.shields.io/badge/Python-3.10+-blue?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js&logoColor=white)
![Gemini](https://img.shields.io/badge/Google%20Gemini-2.5%20Flash-4285F4?logo=google&logoColor=white)

## ✨ Features

- **Dataset Agnostic** — Upload any `.csv` or `.xlsx` file; the agent auto-detects the schema, column types, and generates context automatically.
- **Natural Language Queries** — Ask questions like *"Show me the top 5 records by price"* or *"Plot average salary by department"*.
- **Auto-Generated Visualizations** — Responses include interactive bar, pie, line, and scatter charts powered by Vega-Lite.
- **Dynamic Suggestions** — The UI suggests queries tailored to the currently loaded dataset's columns.
- **Text-to-SQL** — Converts plain English into safe, parameterized SQL queries under the hood.
- **File Upload** — Drag-and-drop CSV/Excel upload directly from the frontend.

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **AI Model** | Google Gemini 2.5 Flash (via LangChain) |
| **Backend** | Python · FastAPI · Uvicorn · SQLite |
| **Frontend** | Next.js 14 · React 18 · TypeScript · Tailwind CSS |
| **Charts** | Vega-Lite · Vega-Embed |

## � Example Queries

```
"Show the top 10 records by salary"
"Find employees where department is Engineering"
"Plot average age by city as a bar chart"
"Show count of records by status as a pie chart"
"What columns are in this dataset?"
```