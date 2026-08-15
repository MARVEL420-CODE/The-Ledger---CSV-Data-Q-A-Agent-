import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { loadCsvBuffer, getSchema, runReadOnlyQuery } from "./services/db.js";
import { questionToSql, rowsToAnswer } from "./services/gemini.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const uploadBody = express.raw({
  type: "text/csv",
  limit: MAX_UPLOAD_BYTES,
});


let ready = false;

app.get("/api/health", (req, res) => {
  res.json({ ok: true, ready });
});

app.get("/api/schema", (req, res) => {
  try {
    res.json(getSchema());
  } catch (e) {
    res.status(404).json({ error: "No dataset uploaded yet" });
  }
});

app.post("/api/upload", uploadBody, async (req, res) => {
  const encodedName = req.get("X-File-Name");
  const sourceFile = encodedName
    ? decodeURIComponent(encodedName)
    : "uploaded.csv";

  if (!sourceFile.toLowerCase().endsWith(".csv")) {
    return res.status(400).json({ error: "Please upload a CSV file." });
  }

  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: "Please choose a CSV file to upload." });
  }

  try {
    const schema = await loadCsvBuffer(req.body, sourceFile);
    ready = true;

    console.log(
      `Loaded ${schema.rowCount} rows from ${schema.sourceFile} into table "${schema.tableName}"`
    );
    console.log(
      "Columns:",
      schema.columns.map((c) => `${c.name}:${c.type}`).join(", ")
    );

    res.json(schema);
  } catch (e) {
    ready = false;
    console.error("Failed to load uploaded dataset:", e);
    res.status(422).json({
      error: e.message || "Could not parse the uploaded CSV.",
    });
  }
});

app.post("/api/ask", async (req, res) => {
  const { question } = req.body || {};

  if (!question || typeof question !== "string") {
    return res.status(400).json({ error: "Missing 'question' string in body" });
  }

  if (!ready) {
    return res.status(503).json({
      error: "Upload a CSV dataset before asking questions.",
    });
  }

  try {
    const schema = getSchema();

    // Step 1: NL question -> SQL
    const sql = await questionToSql(question, schema);

    // Step 2: execute the SQL for real, read-only, against the uploaded data
    let queryResult;
    try {
      queryResult = runReadOnlyQuery(sql);
    } catch (execErr) {
      return res.status(422).json({
        error: `Generated SQL failed to execute safely: ${execErr.message}`,
        sql,
      });
    }

    // Step 3: computed rows -> natural-language phrasing
    const answer = await rowsToAnswer(
      question,
      sql,
      queryResult.columns,
      queryResult.rows
    );

    res.json({
      question,
      sql,
      columns: queryResult.columns,
      rows: queryResult.rows,
      answer,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});



const PORT = process.env.PORT || 8787;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`CSV Q&A backend listening on http://localhost:${PORT}`);
  console.log("Waiting for a CSV upload...");
});
