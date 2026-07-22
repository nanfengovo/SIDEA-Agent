import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'config.db')

def upgrade_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Check if original_file_path column exists
    cursor.execute("PRAGMA table_info(agent_3d_models)")
    columns = [col[1] for col in cursor.fetchall()]
    
    if 'original_file_path' not in columns:
        print("Adding original_file_path column to agent_3d_models table...")
        cursor.execute("ALTER TABLE agent_3d_models ADD COLUMN original_file_path TEXT")
        conn.commit()
        print("Done.")
    else:
        print("Column original_file_path already exists.")
        
    conn.close()

if __name__ == '__main__':
    upgrade_db()
