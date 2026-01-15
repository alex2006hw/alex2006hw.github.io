import React, { useState } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import './App.css';
import { NetworkGraph } from './components/NetworkGraph';
import { BlogViewer } from './components/BlogViewer';
import { AdminPanel } from './components/AdminPanel';
import { PostList } from './components/PostList';
import { SEO } from './components/SEO';

function App() {
  const [selectedNode, setSelectedNode] = useState<any>(null);
  // State for active view: 'network' | 'posts' | 'admin'
  const [activeView, setActiveView] = useState<'network' | 'posts' | 'admin'>('network');

  // Helper to determine the base title when no post is selected
  const getViewTitle = () => {
      switch(activeView) {
          case 'admin': return 'Admin Panel';
          case 'posts': return 'Latest Posts';
          default: return 'Interactive Graph';
      }
  };

  return (
    <HelmetProvider>
        <div className="App" style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'black', color: 'white' }}>
        
        {/* SEO MANAGEMENT */}
        {/* Only render "Page Level" SEO if no specific node is selected. 
            When a node is selected, the BlogViewer component handles the SEO tags. */}
        {!selectedNode && (
            <SEO 
                title={getViewTitle()}
                description="Explore Alex2006HW's digital garden featuring a 3D interactive time-spiral of recipes, technology, and thoughts."
                keywords="react, 3d graph, blog, recipes, tech, spiral time"
                url={window.location.href}
            />
        )}

        {/* Top Header */}
        <header style={{ padding: '0 20px', height: '50px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '10px', height: '10px', background: '#00ff88', borderRadius: '50%' }}></div>
                <strong>Alex2006HW Blog</strong>
            </div>
            <span style={{fontSize: '0.75rem', color: '#666', border: '1px solid #333', padding: '2px 6px', borderRadius: '4px'}}>V 1.0.0</span>
        </header>

        {/* Main Content Area */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            
            {/* VIEW 1: Network Graph (Kept in DOM to preserve WebGL context) */}
            <div style={{ 
                width: '100%', height: '100%', 
                visibility: activeView === 'network' ? 'visible' : 'hidden',
                position: 'absolute', top: 0, left: 0, zIndex: 1
            }}>
                <NetworkGraph onNodeClick={setSelectedNode} />
            </div>

            {/* VIEW 2: Posts Feed */}
            <div style={{ 
                width: '100%', height: '100%', 
                display: activeView === 'posts' ? 'block' : 'none',
                position: 'absolute', top: 0, left: 0, zIndex: 2,
                background: '#0a0a0a'
            }}>
                <PostList onPostClick={setSelectedNode} />
            </div>

            {/* VIEW 3: Admin Panel */}
            <div style={{ 
                width: '100%', height: '100%', 
                display: activeView === 'admin' ? 'block' : 'none',
                position: 'absolute', top: 0, left: 0, zIndex: 2,
                background: '#0a0a0a'
            }}>
                <AdminPanel />
            </div>

            {/* GLOBAL OVERLAY: Blog Viewer (Works on top of any view) */}
            {selectedNode && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }}>
                    <BlogViewer node={selectedNode} onClose={() => setSelectedNode(null)} />
                </div>
            )}

        </div>

        {/* Bottom Navigation Bar */}
        <nav style={{ 
            height: '60px', background: '#161616', borderTop: '1px solid #333',
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '40px' 
        }}>
            <NavButton 
                active={activeView === 'network'} 
                onClick={() => setActiveView('network')} 
                icon="🕸️" 
                label="Graph" 
            />
            <NavButton 
                active={activeView === 'posts'} 
                onClick={() => setActiveView('posts')} 
                icon="📰" 
                label="Posts" 
            />
            <NavButton 
                active={activeView === 'admin'} 
                onClick={() => setActiveView('admin')} 
                icon="🛡️" 
                label="Admin" 
            />
        </nav>
        </div>
    </HelmetProvider>
  );
}

// Sub-component for buttons
const NavButton = ({ active, onClick, icon, label }: any) => (
    <button 
        onClick={onClick}
        style={{ 
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
            color: active ? '#fff' : '#555',
            transform: active ? 'scale(1.1)' : 'scale(1)',
            transition: 'all 0.2s'
        }}
    >
        <span style={{ fontSize: '1.2rem' }}>{icon}</span>
        <span style={{ fontSize: '0.7rem', fontWeight: active ? 'bold' : 'normal' }}>{label}</span>
    </button>
);

export default App;