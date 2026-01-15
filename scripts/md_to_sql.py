#!/usr/bin/env python3
import os
import sqlite3
import json
import datetime
import re
import hashlib
from dotenv import load_dotenv

# --- CONFIGURATION ---
load_dotenv()

CONTENT_DIR = 'blogs'
OUTPUT_DIR = 'public/assets'
DB_NAME = 'db.sqlite'

# Auth Config
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "123abc")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "ghp_mock_token")

# Deps
try:
    import frontmatter
    HAS_FRONTMATTER = True
except ImportError:
    HAS_FRONTMATTER = False

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
    HAS_CRYPTO = True
except ImportError:
    HAS_CRYPTO = False
    print("⚠️  'cryptography' module missing. Admin auth updates will be skipped.")

# --- UTILS ---

def ensure_dir(d):
    if not os.path.exists(d): os.makedirs(d)

def get_slug(path, root):
    rel = os.path.relpath(path, root)
    clean = os.path.splitext(rel)[0]
    slug = '/' + clean.replace(os.sep, '/')
    if slug.endswith('/index'): slug = slug[:-6]
    return slug

def parse_blocks(text):
    blocks = []
    lines = text.split('\n')
    lst = []
    
    def flush():
        if lst:
            blocks.append({ "type": "list", "data": { "style": "unordered", "items": lst[:] }})
            lst.clear()

    for line in lines:
        s = line.strip()
        if not s: flush(); continue
        if re.match(r'^(#{1,6})\s+(.*)', s):
            hm = re.match(r'^(#{1,6})\s+(.*)', s)
            flush()
            blocks.append({ "type": "header", "data": { "text": hm.group(2), "level": len(hm.group(1)) }})
            continue
        if re.match(r'^[\-\*]\s+(.*)', s):
            lm = re.match(r'^[\-\*]\s+(.*)', s)
            lst.append(lm.group(1).replace('**', '<b>').replace('**', '</b>'))
            continue
        flush()
        blocks.append({ "type": "paragraph", "data": { "text": s.replace('**', '<b>').replace('**', '</b>') }})
    flush()
    return json.dumps({ "time": int(datetime.datetime.now().timestamp()*1000), "blocks": blocks })

def fmt_date(d):
    if isinstance(d, (datetime.date, datetime.datetime)): return d.isoformat().split('T')[0]
    return str(d) if d else None

# --- AUTH ---

def update_admin_auth(conn):
    if not HAS_CRYPTO:
        return "Skipped (Missing 'cryptography' lib)"
    
    print("🔐 Syncing Admin Credentials from .env...")
    
    salt = os.urandom(16)
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100000)
    key = kdf.derive(ADMIN_PASSWORD.encode())
    key_hash = hashlib.sha256(key).hexdigest()
    
    iv = os.urandom(12)
    aesgcm = AESGCM(key)
    encrypted = aesgcm.encrypt(iv, ADMIN_TOKEN.encode(), None)
    
    c = conn.cursor()
    c.execute("DELETE FROM auth_store")
    c.execute("INSERT INTO auth_store VALUES (?, ?, ?, ?)", 
              (salt.hex(), key_hash, iv.hex(), encrypted.hex()))
    conn.commit()
    return "Synced with .env"

# --- DB INIT ---

def validate_schema(conn, table):
    try:
        c = conn.cursor()
        cols = [r[1] for r in c.execute(f"PRAGMA table_info({table})").fetchall()]
        if not cols: return
        
        # Check if we have 'date' column for posts, if not, drop to recreate
        required_col = 'date' if table == 'posts' else 'slug'
        if required_col not in cols:
            print(f"⚠️  Schema mismatch in '{table}' (Missing {required_col}). Recreating...")
            c.execute(f"DROP TABLE {table}")
    except: pass

def init_db(conn):
    conn.execute("CREATE TABLE IF NOT EXISTS auth_store (salt TEXT, key_hash TEXT, iv TEXT, encrypted_payload TEXT)")
    conn.execute("CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY, post_id INTEGER, author TEXT, content TEXT, status TEXT)")
    conn.execute("CREATE TABLE IF NOT EXISTS v86_states (id INTEGER PRIMARY KEY, os_type TEXT, name TEXT, date TEXT, state_blob BLOB)")

    for t in ['posts', 'spec', 'resume']: validate_schema(conn, t)

    # UPDATED SCHEMA: 'published' -> 'date'
    conn.execute("""CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY, slug TEXT UNIQUE, title TEXT, date TEXT, updated TEXT, 
        draft INTEGER DEFAULT 0, description TEXT DEFAULT "", image TEXT DEFAULT "", 
        tags TEXT DEFAULT "[]", category TEXT DEFAULT "", lang TEXT DEFAULT "", 
        media_type TEXT DEFAULT "text", media_url TEXT DEFAULT "",
        prevTitle TEXT DEFAULT "", prevSlug TEXT DEFAULT "", nextTitle TEXT DEFAULT "", nextSlug TEXT DEFAULT "", 
        content TEXT
    )""")
    conn.execute("CREATE TABLE IF NOT EXISTS spec (id INTEGER PRIMARY KEY, slug TEXT UNIQUE, title TEXT, content TEXT)")
    conn.execute("CREATE TABLE IF NOT EXISTS resume (id INTEGER PRIMARY KEY, slug TEXT UNIQUE, title TEXT, description TEXT DEFAULT '', published TEXT, draft INTEGER DEFAULT 0, content TEXT)")
    conn.commit()

def get_existing(conn, table):
    try: return set(r[0] for r in conn.execute(f"SELECT slug FROM {table}").fetchall())
    except: return set()

# --- MAIN ---

def main():
    ensure_dir(OUTPUT_DIR)
    db_path = os.path.join(OUTPUT_DIR, DB_NAME)
    print(f"🔌 Connecting to: {db_path}")
    conn = sqlite3.connect(db_path)
    init_db(conn)
    
    summary = []

    # 1. POSTS
    print("\n📂 Processing 'posts'...")
    existing = get_existing(conn, 'posts')
    added = 0
    skipped = 0
    new_items = []
    
    posts_dir = os.path.join(CONTENT_DIR, 'posts')
    if os.path.exists(posts_dir):
        for root, _, files in os.walk(posts_dir):
            for f in files:
                if not f.endswith('.md'): continue
                path = os.path.join(root, f)
                slug = get_slug(path, posts_dir)
                if slug in existing:
                    skipped += 1
                    continue
                
                post = frontmatter.load(path)
                meta = post.metadata
                new_items.append({
                    "slug": slug,
                    "title": meta.get('title', 'Untitled'),
                    "date": fmt_date(meta.get('date', meta.get('published'))), # Map published/date to date
                    "updated": fmt_date(meta.get('updated')),
                    "draft": 1 if meta.get('draft') else 0,
                    "description": meta.get('description', ''),
                    "image": meta.get('image', ''),
                    "tags": json.dumps(meta.get('tags', [])),
                    "category": meta.get('category', ''),
                    "lang": meta.get('lang', ''),
                    "media_type": meta.get('media_type', 'text'),
                    "media_url": meta.get('media_url', meta.get('image', '')),
                    "content": parse_blocks(post.content)
                })

        new_items.sort(key=lambda x: x['date'] or "", reverse=True)
        for i, item in enumerate(new_items):
            if i < len(new_items)-1: item['prevTitle'] = new_items[i+1]['title']; item['prevSlug'] = new_items[i+1]['slug']
            else: item['prevTitle'] = ""; item['prevSlug'] = ""
            if i > 0: item['nextTitle'] = new_items[i-1]['title']; item['nextSlug'] = new_items[i-1]['slug']
            else: item['nextTitle'] = ""; item['nextSlug'] = ""
            
            try:
                conn.execute("""INSERT INTO posts (slug, title, date, updated, draft, description, image, tags, category, lang, media_type, media_url, prevTitle, prevSlug, nextTitle, nextSlug, content) 
                             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                             (item['slug'], item['title'], item['date'], item['updated'], item['draft'], 
                              item['description'], item['image'], item['tags'], item['category'], item['lang'], 
                              item['media_type'], item['media_url'],
                              item['prevTitle'], item['prevSlug'], item['nextTitle'], item['nextSlug'], item['content']))
                print(f"   [+] Added: {item['slug']}")
                added += 1
            except: pass
    summary.append(f"Posts:  {added} new, {skipped} skipped")

    # 2. OTHERS
    for name, fields in [('spec', ['title']), ('resume', ['title', 'description', 'published', 'draft'])]:
        print(f"\n📂 Processing '{name}'...")
        d = os.path.join(CONTENT_DIR, name)
        ex = get_existing(conn, name)
        add = 0; skp = 0
        if os.path.exists(d):
            for root, _, files in os.walk(d):
                for f in files:
                    if not f.endswith('.md'): continue
                    path = os.path.join(root, f)
                    slug = get_slug(path, d)
                    if slug in ex: skp+=1; continue
                    
                    post = frontmatter.load(path)
                    vals = [slug]
                    for field in fields:
                        val = post.metadata.get(field)
                        if field == 'tags': val = json.dumps(val or [])
                        elif field == 'draft': val = 1 if val else 0
                        elif 'date' in field or 'published' in field: val = fmt_date(val)
                        vals.append(val or "")
                    vals.append(parse_blocks(post.content))
                    
                    try:
                        cols = f"slug, {', '.join(fields)}, content"
                        ph = ",".join(["?"]*len(vals))
                        conn.execute(f"INSERT INTO {name} ({cols}) VALUES ({ph})", vals)
                        print(f"   [+] Added: {slug}")
                        add += 1
                    except: pass
        summary.append(f"{name.capitalize()}: {add} new, {skp} skipped")

    # 3. AUTH UPDATE
    print("\n🔑 Updating Admin Security...")
    auth_status = update_admin_auth(conn)
    summary.append(f"Auth:   {auth_status}")

    conn.commit()
    conn.close()

    print("\n" + "="*40)
    print("📊 DATABASE UPDATE SUMMARY")
    print("="*40)
    for line in summary: print(line)
    print("="*40 + "\n")

if __name__ == "__main__":
    main()
