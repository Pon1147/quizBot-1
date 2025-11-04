const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const DB_PATH = path.join(__dirname, "data/database.sqlite");
const QUESTIONS_DIR = path.join(__dirname, "data/questions");

const db = new sqlite3.Database(DB_PATH);

function loadQuestionsFromJson(filename) {
  console.log(`Đang load file: ${filename}`);
  const filePath = path.join(QUESTIONS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.error(`File không tồn tại: ${filePath}`);
    return;
  }

  let questions = JSON.parse(fs.readFileSync(filePath, "utf8"));

  // Fix category mismatch: Set to filename base (e.g., vehicles.json → "vehicles")
  const categoryFromFile = filename.replace(".json", "");
  questions = questions.map((q) => ({
    ...q,
    category: q.category || categoryFromFile,
  }));

  console.log(
    `Tìm thấy ${questions.length} questions (category: "${categoryFromFile}").`
  );

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO questions (category, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let successCount = 0;
  let pending = questions.length;

  questions.forEach((q) => {
    const correctAns = (q.correct_answer || "").toUpperCase();
    const params = [
      q.category || "unknown",
      q.question_text || "No text",
      q.option_a || "N/A",
      q.option_b || "N/A",
      q.option_c || "N/A",
      q.option_d || "N/A",
      correctAns,
      q.explanation || null,
      q.image_url || null,
    ];

    insertStmt.run(params, (err) => {
      if (err) {
        console.error(`Lỗi insert: ${err.message}`);
      } else {
        successCount++;
      }
      pending--;
      if (pending === 0) {
        console.log(
          `Đã load ${successCount}/${questions.length} questions thành công từ ${filename}`
        );
      }
    });
  });

  insertStmt.finalize((err) => {
    if (err) {
      console.error("Finalize error:", err);
    }
  });
}

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    question_text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    explanation TEXT,
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, question_text)
  )`);

  // Clear table để fresh load (dev mode)
  db.run("DELETE FROM questions");
  db.run("VACUUM");

  const jsonFiles = fs
    .readdirSync(QUESTIONS_DIR)
    .filter((f) => f.endsWith(".json"));
  jsonFiles.forEach(loadQuestionsFromJson);

  // Log total unique sau load
  db.get(
    "SELECT COUNT(DISTINCT question_text) as unique_count, COUNT(*) as total FROM questions",
    (err, row) => {
      if (err) console.error("Count error:", err);
      else
        console.log(
          `Final DB: ${row.total} rows, ${row.unique_count} unique questions`
        );
    }
  );

  console.log("✅ Hoàn tất load tất cả questions!");
});

db.close();
