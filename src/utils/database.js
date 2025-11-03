const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const DB_PATH = path.join(__dirname, "../../data/database.sqlite"); // Từ src/utils về root/data

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, ""); // Tạo empty file

function initDatabase() {
  const db = new sqlite3.Database(DB_PATH);

  db.on("error", (err) => console.error("DB Error:", err));

  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      creator_username TEXT NOT NULL,
      category TEXT NOT NULL,
      questions_count INTEGER NOT NULL,
      time_per_question INTEGER NOT NULL,
      channel_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      finished_at DATETIME,
      deleted_at DATETIME
    )`);

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
      UNIQUE(category, question_text)  -- Prevent duplicates
    )`);

    // quiz_participants: THÊM UNIQUE(quiz_id, user_id)
    db.run(`CREATE TABLE IF NOT EXISTS quiz_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      total_score INTEGER DEFAULT 0,
      correct_answers INTEGER DEFAULT 0,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id),
      UNIQUE(quiz_id, user_id)  -- THÊM ĐÂY
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS quiz_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id TEXT NOT NULL,
      question_id INTEGER NOT NULL,
      question_number INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      answer TEXT NOT NULL,
      is_correct INTEGER NOT NULL,
      time_taken REAL NOT NULL,
      points_earned INTEGER NOT NULL,
      answered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id),
      FOREIGN KEY (question_id) REFERENCES questions(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS used_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id TEXT NOT NULL,
      question_id INTEGER NOT NULL,
      used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id),
      FOREIGN KEY (question_id) REFERENCES questions(id),
      UNIQUE(quiz_id, question_id)
    )`);

    db.run(
      `CREATE INDEX IF NOT EXISTS idx_quizzes_server ON quizzes(server_id)`
    );
    db.run(`CREATE INDEX IF NOT EXISTS idx_quizzes_status ON quizzes(status)`);
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_participants_quiz ON quiz_participants(quiz_id)`
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_answers_quiz ON quiz_answers(quiz_id)`
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_used_quiz ON used_questions(quiz_id)`
    );
  });

  db.getQuizById = (id, callback) =>
    db.get("SELECT * FROM quizzes WHERE id = ?", [id], callback);
  db.getActiveQuiz = (serverId, callback) =>
    db.get(
      'SELECT * FROM quizzes WHERE server_id = ? AND status IN ("starting", "running")',
      [serverId],
      callback
    );

  return db;
}

module.exports = { initDatabase };
