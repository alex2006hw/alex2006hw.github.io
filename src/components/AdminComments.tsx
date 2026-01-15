import React, { useEffect, useState, useCallback } from 'react';
import { useDatabase } from '../hooks/useDatabase';

export const AdminComments: React.FC = () => {
    const { worker } = useDatabase();
    const [comments, setComments] = useState<any[]>([]);

    const fetchComments = useCallback(async () => {
        if (!worker) return;
        const res = await worker.exec("SELECT * FROM comments WHERE status = 'pending'");
        setComments(res || []);
    }, [worker]);

    useEffect(() => { 
        fetchComments(); 
    }, [fetchComments]);

    const handleAction = async (id: number, action: 'approved' | 'rejected') => {
        if(!worker) return;
        await worker.exec(`UPDATE comments SET status = '${action}' WHERE id = ${id}`);
        fetchComments();
    };

    return (
        <div style={{ padding: 20 }}>
            <h2>Moderation Queue</h2>
            {comments.length === 0 ? <p>No pending comments.</p> : (
                <div style={{ display: 'grid', gap: 10 }}>
                    {comments.map(c => (
                        <div key={c.id} style={{ background: '#222', padding: 15, borderRadius: 5, border: '1px solid #444' }}>
                            <div style={{ marginBottom: 5 }}><strong>{c.author}</strong> on Post #{c.post_id}</div>
                            <div style={{ color: '#ccc', fontStyle: 'italic', marginBottom: 10 }}>"{c.content}"</div>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button onClick={() => handleAction(c.id, 'approved')} style={{ background: 'green', color: 'white', border: 'none', padding: '5px 10px', cursor: 'pointer' }}>Approve</button>
                                <button onClick={() => handleAction(c.id, 'rejected')} style={{ background: 'red', color: 'white', border: 'none', padding: '5px 10px', cursor: 'pointer' }}>Reject</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
