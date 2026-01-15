const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Ensure directory exists
const dir = 'public';
if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
}

const DB_PATH = 'public/db_temp.sqlite';

// --- BLOG CONTENT ---
const TITLE = "Building a Serverless Decentralized OS & Blog in a Day";
const DATE = new Date().toISOString().split('T')[0];
const TAGS = "DevLog, WebAssembly, v86, React";

const CONTENT = JSON.stringify({
    time: Date.now(),
    blocks: [
        {
            type: "header",
            data: { text: "Project Requirements & Specs", level: 2 }
        },
        {
            type: "list",
            data: {
                style: "unordered",
                items: [
                    "<b>Core Stack:</b> React, TypeScript, Three.js (Graph Visualization).",
                    "<b>Database:</b> SQL.js-httpvfs (Serverless SQLite over HTTP).",
                    "<b>Emulator:</b> v86 (x86 virtualization) booting Linux/DOS.",
                    "<b>CMS:</b> Custom Admin Dashboard with Block Editor and Moderation Queue."
                ]
            }
        },
        {
            type: "header",
            data: { text: "Notable Fixes & Engineering Decisions", level: 2 }
        },
        {
            type: "paragraph",
            data: { text: "<b>1. The 'Found' Syntax Error:</b> curl was downloading HTML redirects instead of binary JS. <br><i>Fix:</i> Switched to <code>git clone</code> and direct CDN URLs." }
        },
        {
            type: "paragraph",
            data: { text: "<b>2. Webpack 5 Polyfills:</b> Manually injected <code>process</code> and <code>buffer</code> to support crypto libraries." }
        },
        {
            type: "paragraph",
            data: { text: "<b>3. xterm.js Crash:</b> Implemented <code>ResizeObserver</code> to prevent terminal initialization on hidden DOM elements." }
        },
        {
            type: "header",
            data: { text: "Project Stats", level: 3 }
        },
        {
            type: "list",
            data: {
                style: "unordered",
                items: [
                    "<b>Time:</b> ~6 Hours of iterative development.",
                    "<b>Cost:</b> $0 (Hosted on GitHub Pages).",
                    "<b>Team:</b> 1 Human Architect + 1 AI Agent."
                ]
            }
        },
        {
            type: "header",
            data: { text: "AI & User Collaboration", level: 2 }
        },
        {
            type: "paragraph",
            data: { text: "The user acted as <b>Navigator</b>, identifying specific errors (e.g., 'window is not defined') and defining goals. The AI acted as <b>Driver</b>, writing complex React/Worker code. Key moments included debugging binary asset corruption and implementing HKDF crypto." }
        },
        {
            type: "header",
            data: { text: "Introspection: AI Development Gotchas", level: 2 }
        },
        {
            type: "paragraph",
            data: { text: "<b>Binary Assets:</b> AI models assume downloads succeed. Always verify file headers (`head -c 20 file.wasm`)." }
        }
    ]
});

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
    // 1. Ensure Table Exists (Fixes 'no such table' error)
    db.run(`CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY, 
        title TEXT, 
        date TEXT, 
        tags TEXT, 
        media_type TEXT, 
        media_url TEXT, 
        content TEXT
    )`);

    // 2. Insert Post
    const stmt = db.prepare("INSERT INTO posts (title, date, tags, content, media_type) VALUES (?, ?, ?, ?, ?)");
    
    stmt.run(TITLE, DATE, TAGS, CONTENT, 'text', function(err) {
        if (err) {
            console.error("❌ Error inserting blog post:", err.message);
        } else {
            console.log(`✅ Blog Post inserted. ID: ${this.lastID}`);
        }
    });
    
    stmt.finalize();
});

db.close();
