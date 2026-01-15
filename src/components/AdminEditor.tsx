import React, { useEffect, useRef } from 'react';
import EditorJS from '@editorjs/editorjs';
// @ts-ignore
import Header from '@editorjs/header';
// @ts-ignore
import List from '@editorjs/list';
import { useDatabase } from '../hooks/useDatabase';

export const AdminEditor: React.FC = () => {
    const ejInstance = useRef<EditorJS | null>(null);
    const { worker } = useDatabase();

    useEffect(() => {
        if (!ejInstance.current) {
            initEditor();
        }
        return () => {
            if (ejInstance.current && typeof ejInstance.current.destroy === 'function') {
                ejInstance.current.destroy();
                ejInstance.current = null;
            }
        };
    }, []);

    const initEditor = () => {
        const editor = new EditorJS({
            holder: 'editorjs',
            onReady: () => { ejInstance.current = editor; },
            tools: { header: Header, list: List },
            placeholder: 'Let`s write an awesome story!'
        });
    };

    const handleSave = async () => {
        if (!ejInstance.current) return;
        const savedData = await ejInstance.current.save();
        const titleBlock = savedData.blocks.find(b => b.type === 'header');
        const title = titleBlock ? titleBlock.data.text : 'Untitled Post';
        const contentJson = JSON.stringify(savedData);
        const date = new Date().toISOString().split('T')[0];

        if(worker) {
            try {
                // Escape single quotes for SQL
                const safeTitle = title.replace(/'/g, "''");
                const safeContent = contentJson.replace(/'/g, "''");
                
                await worker.exec(`INSERT INTO posts (title, date, tags, content, media_type) VALUES ('${safeTitle}', '${date}', 'Tech', '${safeContent}', 'text')`);
                alert("Post Saved to Memory!");
            } catch(e) { console.error(e); alert("Save failed"); }
        }
    };

    return (
        <div style={{ padding: 20, color: 'black', background: 'white', borderRadius: 8, maxWidth: 800 }}>
            <h2 style={{color:'#333'}}>New Blog Post</h2>
            <div id="editorjs" style={{ border: '1px solid #ccc', padding: 10, minHeight: 300 }}></div>
            <button onClick={handleSave} style={{ marginTop: 20, padding: '10px 20px', background: '#0070f3', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Publish Post
            </button>
        </div>
    );
};
