import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDatabase } from '../hooks/useDatabase';

// Helper to convert Markdown links [text](url) to HTML <a> tags
const parseText = (text: string) => {
    return text.replace(
        /\[([^\]]+)\]\(([^)]+)\)/g, 
        '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: #00aaff; text-decoration: none;">$1</a>'
    );
};

export const BlogViewer: React.FC<{ node: any; onClose: () => void }> = ({ node, onClose }) => {
    const { details, id } = node;
    const { worker } = useDatabase();
    
    // CACHING: Initialize state from LocalStorage
    const [author, setAuthor] = useState(() => localStorage.getItem('draft_author') || "Guest");
    const [comment, setComment] = useState(() => localStorage.getItem('draft_comment') || "");

    // CACHING: Save to LocalStorage on every change
    useEffect(() => { localStorage.setItem('draft_author', author); }, [author]);
    useEffect(() => { localStorage.setItem('draft_comment', comment); }, [comment]);

    const existingComments = details.comments || [];

    // --- CONTENT PARSING LOGIC ---
    const contentBlocks = useMemo(() => {
        try {
            // 1. Attempt to parse JSON string if it is a string
            const raw = typeof details.content === 'string' ? JSON.parse(details.content) : details.content;
            
            // 2. Check if it fits the Editor.js structure (has "blocks")
            if (raw && Array.isArray(raw.blocks)) {
                return raw.blocks.map((block: any, index: number) => {
                    // Safe html parsing for links inside text
                    const htmlContent = block.data?.text ? parseText(block.data.text) : "";

                    switch (block.type) {
                        case 'header':
                            // FIX: Use React.ElementType for dynamic tag
                            const level = block.data.level || 3;
                            const HeaderTag = `h${level}` as React.ElementType;
                            return (
                                <HeaderTag 
                                    key={index} 
                                    style={{ color: '#fff', marginTop: '20px', marginBottom: '10px' }}
                                    dangerouslySetInnerHTML={{ __html: htmlContent }} 
                                />
                            );
                        case 'paragraph':
                            return (
                                <p 
                                    key={index} 
                                    style={{ marginBottom: '15px' }}
                                    dangerouslySetInnerHTML={{ __html: htmlContent }}
                                />
                            );
                        case 'list':
                            const ListTag = block.data.style === 'ordered' ? 'ol' : 'ul';
                            return (
                                <ListTag key={index} style={{ paddingLeft: '20px', marginBottom: '15px' }}>
                                    {block.data.items.map((item: string, i: number) => (
                                        <li key={i} dangerouslySetInnerHTML={{ __html: parseText(item) }} />
                                    ))}
                                </ListTag>
                            );
                        default:
                            return null;
                    }
                });
            }
            // Fallback: It's just a plain string
            return <p>{String(details.content)}</p>;
        } catch (e) {
            // Error Fallback: Return raw string if JSON parse failed
            return <p>{String(details.content)}</p>;
        }
    }, [details.content]);

    const handleSubmit = async () => {
        if(!comment.trim()) return;
        const dbId = id.toString().replace('post_', '');
        const sql = `INSERT INTO comments (post_id, author, content, status) VALUES ('${dbId}', '${author}', '${comment}', 'pending')`;

        if (worker) {
            try {
                await worker.exec(sql);
                console.log("Comment submitted for review.");
                setComment("");
                localStorage.removeItem('draft_comment');
            } catch(e) {
                console.warn("SQL Error:", e);
            }
        }
    };

    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
                style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50, display: 'flex', justifyContent: 'flex-end', backdropFilter: 'blur(3px)' }}
            >
                <motion.div 
                    initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} onClick={(e) => e.stopPropagation()}
                    style={{ width: '600px', maxWidth: '90vw', background: '#0a0a0a', height: '100%', overflowY: 'auto', padding: '30px', borderLeft: '1px solid #333' }}
                >
                    <div style={{ marginBottom: 20 }}>
                        <h1 style={{ margin: '0 0 10px 0', color: '#fff', fontSize: '2rem' }}>{details.title}</h1>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666' }}>
                            <span>{details.date}</span><span style={{ color: '#00aaff' }}>{details.tags}</span>
                        </div>
                    </div>
                    
                    <div style={{ margin: '20px 0', borderRadius: '12px', overflow: 'hidden', border: '1px solid #222' }}>
                        {/* {details.media_type === 'image' ? <img src={details.media_url} alt="Asset" crossOrigin="anonymous" style={{ width: '100%' }} /> : <video src={details.media_url} controls crossOrigin="anonymous" style={{ width: '100%' }} />} */}
                        {/* FIX: Only render media block if a URL actually exists */}
                        {details.media_url && (
                            <div style={{ margin: '20px 0', borderRadius: '12px', overflow: 'hidden', border: '1px solid #222' }}>
                                {details.media_type === 'image' ? (
                                    <img 
                                        src={details.media_url} 
                                        alt="Asset" 
                                        crossOrigin="anonymous" 
                                        style={{ width: '100%' }} 
                                    />
                                ) : (
                                    <video 
                                        src={details.media_url} 
                                        controls 
                                        crossOrigin="anonymous" 
                                        style={{ width: '100%' }} 
                                    />
                                )}
                            </div>
                        )}
                    </div>

                    <div style={{ lineHeight: '1.8', color: '#ddd', fontSize: '1.1rem', marginBottom: '40px' }}>
                        {contentBlocks}
                    </div>

                    <hr style={{ borderColor: '#222', margin: '40px 0' }} />

                    <div style={{ marginBottom: '40px' }}>
                        <h3 style={{ color: '#fff' }}>Comments ({existingComments.length})</h3>
                        {existingComments.length === 0 && <p style={{color:'#666'}}>No comments yet.</p>}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            {existingComments.map((c: any, i: number) => (
                                <div key={i} style={{ background: '#161616', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                        <strong style={{ color: '#00ff88' }}>{c.author}</strong><span style={{ fontSize: '0.8rem', color: '#666' }}># {i + 1}</span>
                                    </div>
                                    <div style={{ color: '#ccc' }}>{c.content}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ background: '#111', padding: '20px', borderRadius: '8px', border: '1px solid #222' }}>
                        <h3 style={{ color: '#fff', marginTop: 0 }}>Leave a Comment</h3>
                        <p style={{fontSize:'0.8em', color:'#666'}}>Draft saved automatically.</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Your Name" style={{ padding: '12px', background: '#000', border: '1px solid #333', color: 'white', borderRadius: '4px', outline: 'none' }} />
                            <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Write your thoughts..." style={{ padding: '12px', background: '#000', border: '1px solid #333', color: 'white', minHeight: '100px', borderRadius: '4px', outline: 'none', resize: 'vertical' }} />
                            <button onClick={handleSubmit} disabled={!comment.trim()} style={{ padding: '12px', background: comment.trim() ? '#0070f3' : '#333', border: 'none', color: 'white', fontWeight: 'bold', borderRadius: '4px', cursor: comment.trim() ? 'pointer' : 'not-allowed' }}>Submit for Review</button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};