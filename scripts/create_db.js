const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const fs = require('fs');

const args = process.argv.slice(2);
const PASSWORD = args[0] || process.env.ADMIN_PASSWORD || "123abc";
const HIDDEN_PAYLOAD = process.env.ADMIN_TOKEN || "ghp_mock_token";
const DB_PATH = 'public/assets/db.sqlite';

if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

function precomputeAuth(password, payload) {
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
const auth = precomputeAuth(PASSWORD, HIDDEN_PAYLOAD);

const db = new sqlite3.Database(DB_PATH);
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS auth_store (salt TEXT, key_hash TEXT, iv TEXT, encrypted_payload TEXT)");
    const stmt = db.prepare("INSERT INTO auth_store VALUES (?, ?, ?, ?)");
    stmt.run(auth.salt, auth.keyHash, auth.iv, auth.encryptedPayload);
    stmt.finalize();

    db.run("CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY, title TEXT, date TEXT, tags TEXT, media_type TEXT, media_url TEXT, content TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY, post_id INTEGER, author TEXT, content TEXT, status TEXT)");

    // v86 States: Added 'os_type' column
    db.run("CREATE TABLE IF NOT EXISTS v86_states (id INTEGER PRIMARY KEY, os_type TEXT, name TEXT, date TEXT, state_blob BLOB)");

    // Seed Data
    db.run("INSERT INTO posts (title, date, tags, content) VALUES ('Welcome', '2025-01-01', 'General', 'AI integration.')");

    console.log("✅ Database created.");
});
db.close();
