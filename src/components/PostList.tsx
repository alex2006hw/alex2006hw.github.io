import React, { useEffect, useState } from 'react';
import { useDatabase } from '../hooks/useDatabase';
import { motion } from 'framer-motion';
import _ from 'lodash';

interface PostListProps {
    onPostClick: (node: any) => void;
}

// HELPER: Extract plain text from Editor.js JSON string
const getPreviewText = (jsonString: string, limit: number = 100) => {
    try {
        const data = JSON.parse(jsonString);
        if (data && Array.isArray(data.blocks)) {
            // Join text from all blocks
            const allText = data.blocks
                .map((block: any) => block.data?.text || "")
                .join(" ");
            
            // Remove Markdown links [text](url) -> text
            const cleanText = allText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
            
            // Remove HTML tags if present
            const noHtml = cleanText.replace(/<[^>]*>?/gm, '');

            return noHtml.substring(0, limit) + (noHtml.length > limit ? "..." : "");
        }
        return "";
    } catch (e) {
        // Fallback: It might be a plain string
        return String(jsonString).substring(0, limit);
    }
};

// HELPER: Parse Tags JSON string
const parseTags = (tagString: string) => {
    try {
        const tags = JSON.parse(tagString);
        if (Array.isArray(tags)) return tags.join(", ");
        return tagString;
    } catch {
        return tagString; // Return raw if parse fails
    }
};

export const PostList: React.FC<PostListProps> = ({ onPostClick }) => {
    const { worker } = useDatabase();
    const [posts, setPosts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        const fetchData = async () => {
            if (!worker) return;
            try {
                const postsData = await worker.exec("SELECT * FROM posts ORDER BY date DESC");
                const commentsData = await worker.exec("SELECT * FROM comments WHERE status = 'approved'");

                const combined = (postsData || []).map((p: any) => {
                    const postComments = (commentsData || []).filter((c: any) => c.post_id === p.id);
                    return { ...p, comments: postComments };
                });

                // DEDUPLICATION: Ensure unique IDs
                const uniquePosts = _.uniqBy(combined, 'id');
                setPosts(uniquePosts);
            } catch (e) {
                console.error("Failed to fetch feed:", e);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [worker]);

    // FILTERING: Check against title or the parsed preview text
    const filteredPosts = posts.filter(post => {
        const lowerTerm = searchTerm.toLowerCase();
        const preview = getPreviewText(post.content, 500).toLowerCase();
        
        return (
            post.title.toLowerCase().includes(lowerTerm) ||
            preview.includes(lowerTerm) ||
            String(post.tags).toLowerCase().includes(lowerTerm)
        );
    });

    if (loading) return <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>Loading Feed...</div>;

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div style={{ position: 'sticky', top: 0, background: '#0a0a0a', zIndex: 10, paddingBottom: '20px', borderBottom: '1px solid #333' }}>
                <h1 style={{ margin: '0 0 15px 0', color: 'white' }}>Latest Posts</h1>
                <input 
                    type="text" placeholder="🔍 Search posts..." 
                    value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #333', background: '#161616', color: 'white', fontSize: '1rem', outline: 'none', boxSizing: 'border-box' }}
                />
            </div>
            
            <div style={{ display: 'grid', gap: '20px', marginTop: '20px' }}>
                {filteredPosts.length === 0 && <div style={{ textAlign: 'center', color: '#666', padding: '20px' }}>No posts found.</div>}
                
                {filteredPosts.map((post, i) => (
                    <motion.div 
                        key={post.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        onClick={() => onPostClick({ id: `post_${post.id}`, label: post.title, group: 3, details: post })}
                        style={{ background: '#1a1a1a', borderRadius: '12px', border: '1px solid #333', overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
                        whileHover={{ scale: 1.01, borderColor: '#555' }}
                    >
                        {/* FIX: Only render media div if media_url exists and is not empty */}
                        {post.media_url && (
                            <div style={{ height: '200px', background: '#000', position: 'relative', overflow: 'hidden' }}>
                                {post.media_type === 'image' ? (
                                    <img src={post.media_url} alt={post.title} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <video src={post.media_url} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                )}
                            </div>
                        )}

                        <div style={{ padding: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '0.9rem', color: '#888' }}>
                                <span>{post.date}</span>
                                {/* FIX: Parse tags nicely */}
                                <span style={{ color: '#00ff88' }}>{parseTags(post.tags)}</span>
                            </div>
                            
                            <h2 style={{ margin: '0 0 10px 0', fontSize: '1.5rem', color: 'white' }}>{post.title}</h2>
                            
                            {/* FIX: Use helper to extract readable text from JSON */}
                            <p style={{ color: '#ccc', margin: '0 0 15px 0', lineHeight: '1.5' }}>
                                {getPreviewText(post.content)}
                            </p>
                            
                            <div style={{ display: 'flex', gap: '10px', fontSize: '0.85rem', color: '#666' }}>
                                <span>💬 {post.comments ? post.comments.length : 0} Comments</span>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};