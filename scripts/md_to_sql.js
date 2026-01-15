require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const matter = require('gray-matter');
const Database = require('better-sqlite3');

// --- CONFIGURATION ---
const CONTENT_DIR = 'blogs';
const OUTPUT_DIR = path.join('public', 'assets');
const DB_PATH = path.join(OUTPUT_DIR, 'db.sqlite');

// Auth
const ARGS = process.argv.slice(2);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ARGS[0] || "123abc";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "ghp_mock_token";

// --- UTILS ---

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getSlug(filePath, baseDir) {
    const rel = path.relative(baseDir, filePath);
    const parsed = path.parse(rel);
    let slug = '/' + path.join(parsed.dir, parsed.name).split(path.sep).join('/');
    if (slug.endsWith('/index')) slug = slug.substring(0, slug.length - 6);
    return slug;
}

function parseMdToBlocks(text) {
    const blocks = [];
    const lines = text.split('\n');
    let currentList = [];

    const flushList = () => {
        if (currentList.length > 0) {
            blocks.push({ type: "list", data: { style: "unordered", items: [...currentList] } });
            currentList = [];
        }
    };

    for (let line of lines) {
        const stripped = line.trim();
        if (!stripped) { flushList(); continue; }

        const headerMatch = stripped.match(/^(#{1,6})\s+(.*)/);
        if (headerMatch) {
            flushList();
            blocks.push({ type: "header", data: { text: headerMatch[2], level: headerMatch[1].length } });
            continue;
        }

        const listMatch = stripped.match(/^[\-\*]\s+(.*)/);
        if (listMatch) {
            currentList.push(listMatch[1].replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'));
            continue;
        }

        flushList();
        blocks.push({ type: "paragraph", data: { text: stripped.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') } });
    }
    flushList();
    return JSON.stringify({ time: Date.now(), blocks: blocks });
}

function formatDate(dateObj) {
    if (!dateObj) return null;
    if (dateObj instanceof Date) return dateObj.toISOString().split('T')[0];
    return String(dateObj);
}

function* walkSync(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
        if (file.isDirectory()) yield* walkSync(path.join(dir, file.name));
        else yield path.join(dir, file.name);
    }
}

// --- AUTH ---

function generateAuth(password, payload) {
    const salt = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(payload, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return { salt: salt.toString('hex'), keyHash, iv: iv.toString('hex'), encryptedPayload: encrypted + authTag };
}

// --- DB INIT ---

function validateAndMigrate(db, tableName) {
    try {
        const info = db.pragma(`table_info(${tableName})`);
        if (info.length === 0) return;
        const cols = info.map(c => c.name);

        // Ensure 'date' column exists for posts
        const required = tableName === 'posts' ? 'date' : 'slug';
        if (!cols.includes(required)) {
            console.log(`⚠️  Schema mismatch in '${tableName}' (Missing ${required}). Recreating...`);
            db.exec(`DROP TABLE ${tableName}`);
        }
    } catch (err) { console.error(err); }
}

function initDb(db) {
    db.exec("CREATE TABLE IF NOT EXISTS auth_store (salt TEXT, key_hash TEXT, iv TEXT, encrypted_payload TEXT)");
    db.exec("CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY, post_id INTEGER, author TEXT, content TEXT, status TEXT)");
    db.exec("CREATE TABLE IF NOT EXISTS v86_states (id INTEGER PRIMARY KEY, os_type TEXT, name TEXT, date TEXT, state_blob BLOB)");

    ['posts', 'spec', 'resume'].forEach(t => validateAndMigrate(db, t));

    // UPDATED SCHEMA: 'published' -> 'date'
    db.exec(`
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY, slug TEXT UNIQUE, title TEXT, date TEXT, updated TEXT,
            draft INTEGER DEFAULT 0, description TEXT DEFAULT "", image TEXT DEFAULT "",
            tags TEXT DEFAULT "[]", category TEXT DEFAULT "", lang TEXT DEFAULT "",
            media_type TEXT DEFAULT "text", media_url TEXT DEFAULT "",
            prevTitle TEXT DEFAULT "", prevSlug TEXT DEFAULT "", nextTitle TEXT DEFAULT "", nextSlug TEXT DEFAULT "",
            content TEXT
        )
    `);
    db.exec(`CREATE TABLE IF NOT EXISTS spec (id INTEGER PRIMARY KEY, slug TEXT UNIQUE, title TEXT, content TEXT)`);
    db.exec(`CREATE TABLE IF NOT EXISTS resume (id INTEGER PRIMARY KEY, slug TEXT UNIQUE, title TEXT, description TEXT DEFAULT "", published TEXT, draft INTEGER DEFAULT 0, content TEXT)`);
}

function updateAdminAuth(db) {
    console.log("🔐 Syncing Admin Credentials from .env...");
    const auth = generateAuth(ADMIN_PASSWORD, ADMIN_TOKEN);
    const txn = db.transaction(() => {
        db.exec("DELETE FROM auth_store");
        db.prepare("INSERT INTO auth_store VALUES (?, ?, ?, ?)").run(
            auth.salt, auth.keyHash, auth.iv, auth.encryptedPayload
        );
    });
    txn();
    return "Synced with .env";
}

function getExistingSlugs(db, tableName) {
    try {
        return new Set(db.prepare(`SELECT slug FROM ${tableName}`).all().map(r => r.slug));
    } catch { return new Set(); }
}

// --- PROCESSORS ---

function processPosts(db, rootPath) {
    const existingSlugs = getExistingSlugs(db, 'posts');
    const newItems = [];
    let added = 0, skipped = 0;

    console.log(`   Scanning ${rootPath}...`);
    for (const filePath of walkSync(rootPath)) {
        if (!filePath.endsWith('.md')) continue;
        const slug = getSlug(filePath, rootPath);
        if (existingSlugs.has(slug)) { skipped++; continue; }

        const { data, content } = matter(fs.readFileSync(filePath, 'utf8'));
        newItems.push({
            slug,
            title: data.title || 'Untitled',
            date: formatDate(data.date || data.published || new Date()),
            updated: formatDate(data.updated),
            draft: data.draft ? 1 : 0,
            description: data.description || '',
            image: data.image || '',
            tags: JSON.stringify(data.tags || []),
            category: data.category || '',
            lang: data.lang || '',
            media_type: data.media_type || 'text',
            media_url: data.media_url || data.image || '',
            contentRaw: content
        });
    }

    newItems.sort((a, b) => new Date(b.date) - new Date(a.date));

    for (let i = 0; i < newItems.length; i++) {
        if (i < newItems.length - 1) { newItems[i].prevTitle = newItems[i+1].title; newItems[i].prevSlug = newItems[i+1].slug; }
        if (i > 0) { newItems[i].nextTitle = newItems[i-1].title; newItems[i].nextSlug = newItems[i-1].slug; }
    }

    const insert = db.prepare(`INSERT INTO posts (slug, title, date, updated, draft, description, image, tags, category, lang, media_type, media_url, prevTitle, prevSlug, nextTitle, nextSlug, content) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    const txn = db.transaction((items) => {
        for (const item of items) {
            try {
                insert.run(
                    item.slug, item.title, item.date, item.updated, item.draft,
                    item.description, item.image, item.tags, item.category, item.lang,
                    item.media_type, item.media_url,
                    item.prevTitle, item.prevSlug, item.nextTitle, item.nextSlug,
                    parseMdToBlocks(item.contentRaw)
                );
                console.log(`   [+] Added: ${item.slug}`);
                added++;
            } catch (e) { console.error(`   [!] Error ${item.slug}: ${e.message}`); }
        }
    });
    if (newItems.length) txn(newItems);
    return { added, skipped };
}

function processSimple(db, rootPath, tableName, fields) {
    const existing = getExistingSlugs(db, tableName);
    let added = 0, skipped = 0;

    console.log(`   Scanning ${rootPath}...`);
    const stmt = db.prepare(`INSERT INTO ${tableName} (slug, ${fields.join(', ')}, content) VALUES (?, ${fields.map(()=>'?').join(', ')}, ?)`);

    const txn = db.transaction(() => {
        for (const filePath of walkSync(rootPath)) {
            if (!filePath.endsWith('.md')) continue;
            const slug = getSlug(filePath, rootPath);
            if (existing.has(slug)) { skipped++; continue; }

            const { data, content } = matter(fs.readFileSync(filePath, 'utf8'));
            const values = [slug];
            for (const f of fields) {
                let v = data[f];
                if (f==='tags') v = JSON.stringify(v||[]);
                else if (f==='draft') v = v?1:0;
                else if (f==='published'||f.includes('date')) v = formatDate(v);
                values.push(v || "");
            }
            values.push(parseMdToBlocks(content));

            try { stmt.run(...values); added++; console.log(`   [+] Added: ${slug}`); }
            catch (e) { console.error(e.message); }
        }
    });
    txn();
    return { added, skipped };
}

function main() {
    ensureDir(OUTPUT_DIR);
    console.log(`🔌 Connecting to database: ${DB_PATH}`);
    const db = new Database(DB_PATH);
    initDb(db);

    const summary = [];

    console.log("\n📂 Processing 'posts'...");
    const p = processPosts(db, path.join(CONTENT_DIR, 'posts'));
    summary.push(`Posts:  ${p.added} new, ${p.skipped} skipped`);

    console.log("\n📂 Processing 'spec'...");
    const s = processSimple(db, path.join(CONTENT_DIR, 'spec'), 'spec', ['title']);
    summary.push(`Spec:   ${s.added} new, ${s.skipped} skipped`);

    console.log("\n📂 Processing 'resume'...");
    const r = processSimple(db, path.join(CONTENT_DIR, 'resume'), 'resume', ['title', 'description', 'published', 'draft']);
    summary.push(`Resume: ${r.added} new, ${r.skipped} skipped`);

    console.log("\n🔑 Updating Admin Security...");
    const authStatus = updateAdminAuth(db);
    summary.push(`Auth:   ${authStatus}`);

    db.close();

    console.log("\n" + "=".repeat(40));
    console.log("📊 DATABASE UPDATE SUMMARY");
    console.log("=".repeat(40));
    summary.forEach(line => console.log(line));
    console.log("=".repeat(40) + "\n");
}

main();
