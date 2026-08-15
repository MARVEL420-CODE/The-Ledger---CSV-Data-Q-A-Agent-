import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI = null;
let model = null;

function getModel() {
  if (!model) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set. Add it to backend/.env");
    }
    genAI = new GoogleGenerativeAI(apiKey);
    model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });
  }
  return model;
}

function schemaToPromptBlock(schema) {
  const colLines = schema.columns
    .map((c) => `  - ${c.name} (${c.type})`)
    .join("\n");
  const sampleLines = schema.sampleRows
    .map((r) => JSON.stringify(r))
    .join("\n");
  return `Table name: ${schema.tableName}
Row count: ${schema.rowCount}
Columns:
${colLines}

Sample rows (for context only, not the full data):
${sampleLines}`;
}

// Turns a plain-English question into a single read-only SQLite SELECT query.
// The model NEVER computes the answer itself here - it only writes the query.
export async function questionToSql(question, schema) {
  const m = getModel();
  const prompt = `You are a SQL generator for a SQLite database. Given the table schema and a user's plain-English question, output ONE single SQLite SELECT statement that answers the question.

Rules:
- Output ONLY the SQL query. No explanation, no markdown fences, no semicolon at the end.
- Use only SELECT - never INSERT/UPDATE/DELETE/DROP/ALTER/etc.
- Use only the table and columns listed below - do not invent column names.
- If the question involves "growth", compute it from existing columns (e.g. compare aggregates across time periods using date columns) - do not assume a pre-existing growth column.
- Prefer aggregate functions (SUM, AVG, COUNT, MIN, MAX) and GROUP BY / ORDER BY / LIMIT as needed so the result directly answers the question.
- If the question is ambiguous, make the most reasonable interpretation and still return a single query.

${schemaToPromptBlock(schema)}

Question: ${question}

SQL query:`;

  const result = await m.generateContent(prompt);
  let text = result.response.text().trim();
  // Strip markdown code fences if the model added them despite instructions.
  text = text.replace(/^```sql\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  return text;
}

// Turns the computed result rows into a natural-language sentence. The model
// is given the ALREADY-COMPUTED numbers as ground truth - it only phrases
// them, it never does arithmetic here.
export async function rowsToAnswer(question, sql, columns, rows) {
  const m = getModel();
  const rowsPreview = rows.slice(0, 20);
  const prompt = `A user asked a question about a dataset. A SQL query was run and produced the result below. Write a short, direct, plain-English answer (1-3 sentences) using ONLY the numbers/values shown in the result. Do not perform any new calculations - just report and interpret what's in the result. If the result is empty, say so plainly.

Question: ${question}

SQL used: ${sql}

Result columns: ${JSON.stringify(columns)}
Result rows (up to 20 shown): ${JSON.stringify(rowsPreview)}
Total result rows: ${rows.length}

Answer:`;

  const result = await m.generateContent(prompt);
  return result.response.text().trim();
}
