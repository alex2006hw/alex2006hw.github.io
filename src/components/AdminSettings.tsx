import React from 'react';
import { useDatabase } from '../hooks/useDatabase';
import { saveAs } from 'file-saver';

export const AdminSettings: React.FC = () => {
    const { worker } = useDatabase();

    const handleExport = async () => {
        if (!worker) return;
        
        // In a real httpvfs setup, we can't easily "download" the whole sqlite file if it's chunked remotely.
        // However, we can dump the tables to JSON.
        const posts = await worker.exec("SELECT * FROM posts");
        const comments = await worker.exec("SELECT * FROM comments");
        const states = await worker.exec("SELECT id, name, date FROM v86_states"); // Don't dump blobs to JSON, too heavy
        
        const dump = { posts, comments, states };
        const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
        saveAs(blob, `db_export_${Date.now()}.json`);
    };

    return (
        <div style={{ padding: 20 }}>
            <h2>System Settings</h2>
            <div style={{ background: '#1a1a1a', padding: 20, borderRadius: 8 }}>
                <h3>Database Sync</h3>
                <p style={{ color: '#888' }}>Export current memory state to JSON. Use this to update the backend.</p>
                <button onClick={handleExport} style={{ padding: '10px 20px', background: 'orange', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>
                    ⬇️ Download DB Dump
                </button>
            </div>
        </div>
    );
};
