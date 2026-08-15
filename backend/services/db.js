import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import initSqlJs from "sql.js";

let SQL = null;
let db = null;
let schema = null; // { tableName, columns: [{name, type}], sampleRows: [...] , rowCount }

const TABLE_NAME = "data_table";

// Infer a SQLite column type from a column's values.
function inferColumnTypes(records, columns) {
  const types = {};
  for (const col of columns) {
    let allInt = true;
    let allFloat = true;
    for (const row of records) {
      const v = row[col];
      if (v === "" || v === undefined || v === null) continue;
      if (!/^-?\d+$/.test(v)) allInt = false;
      if (!/^-?\d*\.?\d+$/.test(v)) allFloat = false;
      if (!allInt && !allFloat) break;
    }
    if (allInt) types[col] = "INTEGER";
    else if (allFloat) types[col] = "REAL";
    else types[col] = "TEXT";
  }
  return types;
}

async function loadRecords(records, sourceFile) {
  if (!SQL) {
    SQL = await initSqlJs();
  }

  const nextDb = new SQL.Database();

  if (!records || records.length === 0) {
    nextDb.close();
    throw new Error("CSV appears to be empty");
  }

  const columns = Object.keys(records[0]);
  if (columns.length === 0) {
    throw new Error("CSV has no columns");
  }

  const colTypes = inferColumnTypes(records, columns);

  const createSql = `CREATE TABLE ${TABLE_NAME} (${columns
    .map((c) => `"${c}" ${colTypes[c]}`)
    .join(", ")});`;
  nextDb.run(createSql);

  const placeholders = columns.map(() => "?").join(", ");
  const insertSql = `INSERT INTO ${TABLE_NAME} (${columns
    .map((c) => `"${c}"`)
    .join(", ")}) VALUES (${placeholders});`;

  const stmt = nextDb.prepare(insertSql);
  nextDb.run("BEGIN TRANSACTION;");
  try {
    for (const row of records) {
      const values = columns.map((c) => {
        const v = row[c];
        if (colTypes[c] === "INTEGER") return v === "" ? null : parseInt(v, 10);
        if (colTypes[c] === "REAL") return v === "" ? null : parseFloat(v);
        return v;
      });
      stmt.run(values);
    }
    nextDb.run("COMMIT;");
  } catch (e) {
    nextDb.run("ROLLBACK;");
    nextDb.close();
    throw e;
  } finally {
    stmt.free();
  }

  if (db) db.close();
  db = nextDb;

  schema = {
    tableName: TABLE_NAME,
    columns: columns.map((c) => ({ name: c, type: colTypes[c] })),
    sampleRows: records.slice(0, 5),
    rowCount: records.length,
    sourceFile: path.basename(sourceFile || "uploaded.csv"),
  };

  return schema;
}

export async function loadCsv(csvPath) {
  const raw = fs.readFileSync(csvPath, "utf-8");
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  return loadRecords(records, csvPath);
}

export async function loadCsvBuffer(buffer, sourceFile) {
  const raw = buffer.toString("utf-8");
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
  return loadRecords(records, sourceFile);
}

export function getSchema() {
  if (!schema) throw new Error("No CSV loaded yet");
  return schema;
}

// Only allow a single, read-only SELECT statement.
const FORBIDDEN =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|PRAGMA|REPLACE|TRUNCATE|VACUUM)\b/i;

export function runReadOnlyQuery(sql) {
  if (!db) throw new Error("No CSV loaded yet");

  const trimmed = sql.trim().replace(/;+\s*$/g, "");
  if (!/^select\b/i.test(trimmed)) {
    throw new Error("Only SELECT statements are allowed");
  }
  if (trimmed.includes(";")) {
    throw new Error("Stacked/multiple statements are not allowed");
  }
  if (FORBIDDEN.test(trimmed)) {
    throw new Error("Query contains a forbidden keyword");
  }

  const result = db.exec(trimmed);
  if (result.length === 0) {
    return { columns: [], rows: [] };
  }

  const { columns, values } = result[0];
  const rows = values.map((row) =>
    Object.fromEntries(row.map((v, i) => [columns[i], v]))
  );
  return { columns, rows };
}
