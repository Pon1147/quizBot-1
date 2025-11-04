import sqlite3
import json
import os
from pathlib import Path

# Paths
DB_PATH = Path(__file__).parent / "data" / "database.sqlite"
QUESTIONS_DIR = Path(__file__).parent / "data" / "questions"
JSON_FILE = QUESTIONS_DIR / "vehicles.json"  # Adjust nếu multiple files

def clean_questions_table(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Drop table nếu exist (fresh start)
    cursor.execute("DROP TABLE IF EXISTS questions;")
    print("✅ Dropped questions table.")
    
    # Recreate table (match model: no timestamps, unique composite)
    cursor.execute("""
        CREATE TABLE questions (
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
        );
    """)
    print("✅ Recreated questions table.")
    
    # Load JSON và INSERT OR IGNORE (handle dups)
    if not JSON_FILE.exists():
        print(f"❌ {JSON_FILE} not found!")
        return
    
    with open(JSON_FILE, 'r', encoding='utf-8') as f:
        questions = json.load(f)
    
    print(f"🔍 Loading {len(questions)} questions from {JSON_FILE.name}.")
    
    success_count = 0
    for q in questions:
        # Fix category mismatch: Set to "vehicles" if file is vehicles.json (adjust logic nếu multi files)
        if JSON_FILE.name == "vehicles.json":
            q['category'] = 'vehicles'  # Override sample "history" → "vehicles"
        
        correct_ans = (q.get('correct_answer', '') or '').upper()
        params = (
            q.get('category', 'unknown'),
            q.get('question_text', 'No text'),
            q.get('option_a', 'N/A'),
            q.get('option_b', 'N/A'),
            q.get('option_c', 'N/A'),
            q.get('option_d', 'N/A'),
            correct_ans,
            q.get('explanation'),
            q.get('image_url')
        )
        
        try:
            cursor.execute("""
                INSERT OR IGNORE INTO questions 
                (category, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, image_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, params)
            success_count += 1
        except sqlite3.IntegrityError as e:
            print(f"⚠️ Skip dup Q: {q.get('question_text', '')[:50]}... | Error: {e}")
    
    conn.commit()
    conn.close()
    
    # Verify
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM questions;")
    total = cursor.fetchone()[0]
    print(f"✅ Fixed DB: {success_count}/{len(questions)} unique questions inserted. Total rows: {total}")
    conn.close()

if __name__ == "__main__":
    if not DB_PATH.exists():
        print("❌ DB not found! Run migrate-db.js first.")
    else:
        clean_questions_table(DB_PATH)
        print("🔄 Run 'npm run dev' now.")