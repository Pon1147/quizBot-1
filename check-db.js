const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const DB_PATH = path.join(__dirname, "data/database.sqlite");
const db = new sqlite3.Database(DB_PATH);

db.all(
  "SELECT category, COUNT(*) as count FROM questions GROUP BY category",
  (err, rows) => {
    if (err) {
      console.error("Query error:", err);
    } else {
      console.log("Categories in DB:");
      rows.forEach((row) =>
        console.log(`- ${row.category}: ${row.count} questions`)
      );
    }
    db.close();
  }
);
