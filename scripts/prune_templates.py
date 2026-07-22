import sqlite3

def prune_templates():
    conn = sqlite3.connect('config.db')
    c = conn.cursor()
    
    # Check current count
    c.execute('SELECT COUNT(*) FROM dashboard_templates')
    total_before = c.fetchone()[0]
    
    # We want to keep templates that start with 'tpl_custom_'
    # and maybe a few representative others if they have 3D or specific tags.
    # To be aggressive, let's keep 'tpl_custom_%' and 'tpl_cockpit_ceo_1' and 'tpl_twin_factory_1'
    
    keep_list = [
        'tpl_cockpit_ceo_1',
        'tpl_twin_factory_1'
    ]
    
    placeholders = ','.join('?' * len(keep_list))
    query = f"DELETE FROM dashboard_templates WHERE template_id NOT LIKE 'tpl_custom_%' AND template_id NOT IN ({placeholders})"
    
    c.execute(query, keep_list)
    deleted = c.rowcount
    
    conn.commit()
    
    c.execute('SELECT COUNT(*) FROM dashboard_templates')
    total_after = c.fetchone()[0]
    
    conn.close()
    
    print(f"Total before: {total_before}")
    print(f"Deleted: {deleted}")
    print(f"Total after: {total_after}")

if __name__ == '__main__':
    prune_templates()
