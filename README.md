# The Ledger — CSV / Data Q&A Agent

Upload a CSV, ask plain-English questions about it, and get answers backed by
**real, executed SQL** — not an LLM guessing numbers.

> "My agent takes a plain-English question about a sales CSV and produces an
> answer computed by SQL, along with the exact query and result table used to
> get there."

Built for the Rooman AI Challenge (Advanced track — CSV/Data Q&A Agent).

---

## How it avoids hallucination

The LLM (Gemini) is used in exactly two narrow, checkable ways — it never
does arithmetic:

1. **Question → SQL.** Gemini is given the table schema (column names/types
   and a few sample rows) and writes a single `SELECT` statement. It doesn't
   see the full dataset and can't invent numbers here — it's only writing a
   query.
2. **Rows → sentence.** After the SQL actually runs against the real data
   (via SQLite, loaded in-memory from the CSV), Gemini is given the
   **already-computed result rows** and asked only to phrase them as a
   sentence. It's explicitly told not to perform any new calculation.

Between those two calls sits a **SQL guardrail**: only a single `SELECT`
statement is allowed to execute — no `INSERT`/`UPDATE`/`DELETE`/`DROP`/`ALTER`,
no stacked statements, no PRAGMA tricks. If Gemini's SQL fails this check, the
request fails with an explanation rather than running anything unsafe.

Every answer in the UI ships with an expandable **"Show the work"** panel
containing the exact SQL and the result table it came from, so any answer can
be independently verified.

See [`sample-qa.md`](./sample-qa.md) for 10 worked examples with the SQL and
results.

## Architecture

```
React (Vite)  ──POST /api/ask──▶  Express
                                      │
                                      ├─ 1. Gemini: question + schema → SQL
                                      ├─ 2. Guardrail: validate SELECT-only
                                      ├─ 3. sql.js (in-memory SQLite): run SQL against the CSV
                                      └─ 4. Gemini: result rows → plain-English sentence
                                      │
              ◀── answer + sql + result table ──┘
```

- **Backend:** Node.js + Express. The CSV is parsed once at startup and loaded
  into an in-memory SQLite database via `sql.js` (SQLite compiled to
  WebAssembly — no native build step, so `npm install` just works anywhere
  Node runs).
- **Frontend:** React (Vite), no UI framework — a small ledger-styled chat
  interface: a schema sidebar, a question box, and answer cards that expand
  to show SQL + a result table.
- **Model:** Gemini (`gemini-2.0-flash`) via `@google/generative-ai`, used
  for the two narrow calls described above.

## Project layout

```
csv-qa-agent/
├── backend/
│   ├── server.js              # Express app, /api/ask + /api/schema
│   ├── services/
│   │   ├── db.js              # CSV → in-memory SQLite, SQL guardrail, query runner
│   │   └── gemini.js          # question→SQL and rows→answer, Gemini calls
│   ├── data/sales_sample.csv  # sample dataset (2,109 rows, 2023–2024)
│   └── .env.example
├── frontend/
│   ├── src/App.jsx            # UI: schema sidebar, composer, answer cards
│   ├── src/index.css
│   └── .env.example
├── sample-qa.md               # 10 worked questions with SQL + results
└── README.md
```

## Dataset workflow

The application does **not preload a dataset**. Start the backend and open the frontend, then upload a CSV from the UI. The uploaded file is parsed in memory and becomes the active dataset for the session. You can replace it at any time with another CSV.

Uploads are limited to 25 MB and only `.csv` files are accepted.

## Setup & running

Requires Node.js 18+.

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
# edit .env and set GEMINI_API_KEY=your_key_here
# (get one free at https://aistudio.google.com/apikey)
npm start
```

Starts the API on `http://localhost:8787` and waits for a CSV upload. You should see:

```
CSV Q&A backend listening on http://localhost:8787
Waiting for a CSV upload...
```

The `CSV_PATH` setting is no longer required; datasets are selected by the user through the upload UI.

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
cp .env.example .env   # only needed if your backend isn't on localhost:8787
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). The schema
sidebar and sample questions load automatically once the backend is up.

### 3. Try it

Click any of the sample questions in the left sidebar, or type your own,
e.g.:

- "Which region grew fastest from 2023 to 2024?"
- "What is the best-selling product category by units sold?"

Click **"Show the work"** under any answer to see the exact SQL and the
result table it was computed from.

## The sample dataset

`backend/data/sales_sample.csv` — an optional 2,109-row synthetic example (2023–2024,
4 regions × 5 product categories). It is kept in the repository for testing/reference
only and is **never loaded automatically**.

| column | type | description |
|---|---|---|
| order_id | int | unique order id |
| order_date | text (ISO date) | date of the order |
| region | text | North / South / East / West |
| product_category | text | Electronics / Apparel / Home & Garden / Sports / Books |
| units_sold | int | units in the order |
| revenue | real | order revenue |
| cost | real | order cost (for margin questions) |

Region growth rates were deliberately made unequal (West grows fastest) so
"which region grew fastest" has a clear, checkable answer — see
`sample-qa.md`.

## Tradeoffs & what I'd improve with more time

- **SQL-generation over pandas/code-gen.** I chose "Gemini writes SQL,
  SQLite executes it" over "Gemini writes and runs arbitrary Python/pandas
  code." SQL is easier to sandbox (a simple `SELECT`-only regex/keyword
  guardrail is enough) and SQLite's aggregate functions are well-tested, so
  I trust the arithmetic more than I'd trust an LLM-generated pandas script
  run with `exec()`. The cost: SQL can't express everything (no easy
  linear regression, for instance), so some analytical questions would need
  a fallback code-gen path — noted below.
- **In-memory SQLite (`sql.js`) over a real database.** Keeps setup to
  `npm install` with no native compilation or external DB server, which
  matters for a 24-hour, "reviewer must be able to run this" constraint.
  It won't scale past a CSV that fits comfortably in memory — for large
  files I'd switch to DuckDB (which reads CSVs directly and scales much
  further) or stream-load into a file-backed SQLite DB.
- **Two Gemini calls per question.** Splitting "generate SQL" from "phrase
  the answer" keeps each call narrow and auditable, at the cost of latency
  (two round trips instead of one). A single combined call is faster but
  makes it easier for the model to blend query-writing and
  number-reporting into one less-checkable step.
- **The SQL guardrail is keyword/shape-based, not a full parser.** It blocks
  the practical attack surface (writes, schema changes, stacked statements)
  but a proper SQL parser (e.g. `node-sql-parser`) would be more robust
  against edge cases and is the first thing I'd swap in with more time.
- **No conversation memory.** Each question is independent — "what about
  just for 2024?" as a follow-up won't know what "that" refers to. With
  more time I'd pass recent Q&A pairs into the SQL-generation prompt so
  follow-up questions work.
- **Fallback for genuinely code-shaped questions** (e.g. "fit a trend line
  and project next quarter") isn't implemented — SQL can't do this well. A
  natural next step is: try SQL first, and if the question needs real
  statistics/modeling, fall back to a sandboxed, restricted Python
  execution path.
