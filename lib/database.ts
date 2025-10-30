import Database from "better-sqlite3";
import path from "path";

// Database file path
const dbPath = path.join(process.cwd(), "data", "timetracker.db");

// Initialize database
const db = new Database(dbPath);

// Create time_entries table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS time_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    duration INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Prepare statements for database operations
export const insertTimeEntry = db.prepare(`
  INSERT INTO time_entries (task_name, start_time, end_time, duration)
  VALUES (?, ?, ?, ?)
`);

export const getAllTimeEntries = db.prepare(`
  SELECT * FROM time_entries 
  ORDER BY created_at ASC
`);

export const getTimeEntryById = db.prepare(`
  SELECT * FROM time_entries WHERE id = ?
`);

export const deleteTimeEntry = db.prepare(`
  DELETE FROM time_entries WHERE id = ?
`);

export default db;
