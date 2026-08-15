import { useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8787";

const SAMPLE_QUESTIONS = [
  "How many rows are in the dataset?",
  "What are the column names and data types?",
  "Show 5 rows from the dataset.",
  "What is the average of each numeric column?",
];

function ResultTable({ columns, rows }) {
  if (!rows || rows.length === 0) {
    return <div className="row-note">Query returned no rows.</div>;
  }
  const shown = rows.slice(0, 15);
  return (
    <>
      <div className="result-table-wrap">
        <table className="result-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c}>{String(row[c])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > shown.length && (
        <div className="row-note">
          Showing {shown.length} of {rows.length} rows.
        </div>
      )}
    </>
  );
}

function EntryCard({ index, entry }) {
  const [showWork, setShowWork] = useState(false);

  return (
    <div className="q-card">
      <div className="index-stamp">{String(index).padStart(3, "0")}</div>
      <p className="question">{entry.question}</p>

      {entry.loading && <p className="loading">computing…</p>}
      {entry.error && <p className="answer is-error">{entry.error}</p>}
      {entry.answer && <p className="answer">{entry.answer}</p>}

      {!entry.loading && !entry.error && entry.sql && (
        <div className="toggle-row">
          <button onClick={() => setShowWork((s) => !s)}>
            {showWork ? "Hide the work" : "Show the work"}
          </button>
        </div>
      )}

      {showWork && entry.sql && (
        <>
          <div className="sql-block">{entry.sql}</div>
          <ResultTable columns={entry.columns} rows={entry.rows} />
        </>
      )}
    </div>
  );
}

function UploadPanel({ onUploaded, compact = false }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  function selectFile(nextFile) {
    setError(null);
    if (!nextFile) return;

    if (!nextFile.name.toLowerCase().endsWith(".csv")) {
      setError("Please choose a CSV file.");
      return;
    }

    setFile(nextFile);
  }

  async function uploadFile() {
    if (!file || uploading) return;

    setUploading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "text/csv",
          "X-File-Name": encodeURIComponent(file.name),
        },
        body: await file.arrayBuffer(),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload failed.");
      }

      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      onUploaded(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className={`upload-panel ${compact ? "upload-panel-compact" : ""}`}>
      <div className="upload-icon" aria-hidden="true">↑</div>
      <div className="upload-copy">
        <div className="upload-title">
          {compact ? "Upload a different CSV" : "Upload your CSV dataset"}
        </div>
        <div className="upload-description">
          {compact
            ? "Replace the current dataset. Questions will use the new file."
            : "Choose a CSV file to load it into the agent. Nothing is preloaded."}
        </div>

        <div
          className="drop-zone"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            selectFile(e.dataTransfer.files?.[0]);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => selectFile(e.target.files?.[0])}
            hidden
          />
          <strong>{file ? file.name : "Click to choose or drag & drop a CSV"}</strong>
          <span>Maximum file size: 25 MB</span>
        </div>

        {error && <p className="upload-error">{error}</p>}

        {file && (
          <button className="upload-button" onClick={uploadFile} disabled={uploading}>
            {uploading ? "Loading dataset…" : "Load dataset"}
          </button>
        )}
      </div>
    </section>
  );
}

export default function App() {
  const [schema, setSchema] = useState(null);
  const [schemaError, setSchemaError] = useState(null);
  const [question, setQuestion] = useState("");
  const [entries, setEntries] = useState([]);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/schema`)
      .then(async (r) => {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error("Backend not reachable yet");
        return r.json();
      })
      .then((data) => {
        if (data) setSchema(data);
      })
      .catch((e) => setSchemaError(e.message));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  function handleUploaded(nextSchema) {
    setSchema(nextSchema);
    setSchemaError(null);
    setEntries([]);
    setQuestion("");
  }

  async function ask(q) {
    const text = (q ?? question).trim();
    if (!text || busy || !schema) return;

    setQuestion("");
    setBusy(true);
    const localIndex = entries.length;
    setEntries((prev) => [...prev, { question: text, loading: true }]);

    try {
      const res = await fetch(`${API_BASE}/api/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await res.json();

      if (!res.ok) {
        setEntries((prev) => {
          const next = [...prev];
          next[localIndex] = {
            question: text,
            loading: false,
            error: data.error || "Something went wrong",
            sql: data.sql,
          };
          return next;
        });
      } else {
        setEntries((prev) => {
          const next = [...prev];
          next[localIndex] = { question: text, loading: false, ...data };
          return next;
        });
      }
    } catch (e) {
      setEntries((prev) => {
        const next = [...prev];
        next[localIndex] = {
          question: text,
          loading: false,
          error: `Could not reach backend: ${e.message}`,
        };
        return next;
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <span className="kicker">CSV / Data Q&amp;A Agent</span>
          <h1>The Ledger</h1>
        </div>

        <div className="meta">
          {schema ? (
            <>
              {schema.sourceFile} · {schema.rowCount} rows
            </>
          ) : schemaError ? (
            "backend unreachable"
          ) : (
            "waiting for dataset"
          )}
        </div>
      </header>

      {!schema ? (
        <main className="main upload-main">
          <div className="welcome">
            <span className="kicker">Start here</span>
            <h2>Your data, not a preloaded sample.</h2>
            <p>
              Upload any CSV and the agent will inspect its columns, generate
              read-only SQL for your questions, and return answers computed
              from that uploaded file.
            </p>
          </div>

          <UploadPanel onUploaded={handleUploaded} />

          {schemaError && (
            <p className="backend-error">
              {schemaError}. Start the backend and refresh this page.
            </p>
          )}
        </main>
      ) : (
        <>
          <aside className="sidebar">
            <div className="sidebar-heading">
              <h2>Table schema</h2>
              <button
                className="replace-button"
                onClick={() => document.getElementById("replace-upload")?.click()}
                disabled={busy}
              >
                Replace
              </button>
              <input
                id="replace-upload"
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  if (!file.name.toLowerCase().endsWith(".csv")) {
                    setSchemaError("Please choose a CSV file.");
                    return;
                  }

                  try {
                    const res = await fetch(`${API_BASE}/api/upload`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "text/csv",
                        "X-File-Name": encodeURIComponent(file.name),
                      },
                      body: await file.arrayBuffer(),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || "Upload failed.");
                    handleUploaded(data);
                  } catch (e) {
                    setSchemaError(e.message);
                  }
                }}
              />
            </div>

            <ul className="schema-list">
              {schema.columns.map((c) => (
                <li key={c.name}>
                  <span>{c.name}</span>
                  <span className="col-type">{c.type}</span>
                </li>
              ))}
            </ul>

            <h2>Try asking</h2>
            <div className="sample-questions">
              {SAMPLE_QUESTIONS.map((q) => (
                <button key={q} onClick={() => ask(q)} disabled={busy}>
                  {q}
                </button>
              ))}
            </div>
          </aside>

          <main className="main">
            <UploadPanel onUploaded={handleUploaded} compact />

            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                ask();
              }}
            >
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a plain-English question about the uploaded data…"
                disabled={busy}
              />
              <button type="submit" disabled={busy || !question.trim()}>
                Ask
              </button>
            </form>

            {entries.length === 0 ? (
              <p className="empty-state">
                Your uploaded CSV is ready. Ask a question and every answer
                will be computed from a real SQL query run against your data.
              </p>
            ) : (
              <div className="entries">
                {entries.map((entry, i) => (
                  <EntryCard key={i} index={i + 1} entry={entry} />
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </main>
        </>
      )}
    </div>
  );
}
