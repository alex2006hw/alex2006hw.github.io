import React, { useState } from 'react';
import { deriveKey, computeKeyHash, decryptPayload } from '../utils/auth';
import { useDatabase } from '../hooks/useDatabase';
import { AdminEditor } from './AdminEditor';
import { AdminComments } from './AdminComments';
import { AdminTerminal } from './AdminTerminal';
import { AdminSettings } from './AdminSettings';
import { motion } from 'framer-motion';

export const AdminPanel: React.FC = () => {
    const { worker } = useDatabase();
    const [password, setPassword] = useState("");
    const [status, setStatus] = useState("Locked");
    const [adminToken, setAdminToken] = useState("");
    const [activeTab, setActiveTab] = useState<'editor' | 'comments' | 'terminal' | 'settings'>('editor');
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const handleLogin = async () => {
        if (!worker) return setStatus("DB Loading...");
        setStatus("Verifying...");
        
        try {
            const results = await worker.exec("SELECT * FROM auth_store LIMIT 1");
            if (!results || results.length === 0) return setStatus("Error: DB Empty");

            const { salt, key_hash, iv, encrypted_payload } = results[0];
            const key = await deriveKey(password, salt);
            const computedHash = await computeKeyHash(key);
            
            if (computedHash === key_hash) {
                const payload = await decryptPayload(key, iv, encrypted_payload);
                setAdminToken(payload);
                setStatus("Unlocked");
            } else {
                setStatus("Access Denied");
            }
        } catch (e) { setStatus("Crypto Error"); console.error(e); }
    };

    if (!adminToken) {
        return (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ width: '320px', padding: '40px', background: '#1a1a1a', borderRadius: '12px', border: '1px solid #333' }}>
                    <h2 style={{color:'white', textAlign:'center'}}>Admin Access</h2>
                    <input 
                        type="password" placeholder="Master Password" 
                        value={password} onChange={e => setPassword(e.target.value)} 
                        onKeyDown={e => e.key === 'Enter' && handleLogin()}
                        style={{ width: '100%', padding: '12px', marginBottom: '15px', background: '#000', border: '1px solid #333', color: 'white', boxSizing: 'border-box' }} 
                    />
                    <button onClick={handleLogin} style={{ width: '100%', padding: '12px', background: '#0070f3', border: 'none', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>Unlock</button>
                    <div style={{ marginTop: '20px', textAlign: 'center', color: '#888' }}>{status}</div>
                </div>
            </div>
        );
    }

    // AUTHENTICATED LAYOUT
    return (
        <div style={{ display: 'flex', height: '100%', background: '#111', color: 'white', overflow: 'hidden' }}>
            {/* SIDEBAR */}
            <motion.div 
                initial={{ width: 250 }}
                animate={{ width: sidebarOpen ? 250 : 60 }}
                transition={{ duration: 0.3 }}
                style={{ borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', overflow: 'hidden', whiteSpace: 'nowrap', background: '#161616' }}
            >
                <div style={{ padding: '15px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: sidebarOpen ? 'space-between' : 'center', height: '50px', boxSizing:'border-box' }}>
                    {sidebarOpen && <span style={{fontWeight:'bold', fontSize:'1.1rem'}}>Admin</span>}
                    <button 
                        onClick={() => setSidebarOpen(!sidebarOpen)} 
                        title={sidebarOpen ? "Collapse" : "Expand"}
                        style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.2rem', padding: '5px' }}
                    >
                        {sidebarOpen ? '«' : '»'}
                    </button>
                </div>
                
                <nav style={{ flex: 1, padding: '10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <SidebarBtn icon="📝" label="New Post" collapsed={!sidebarOpen} active={activeTab === 'editor'} onClick={() => setActiveTab('editor')} />
                    <SidebarBtn icon="💬" label="Comments" collapsed={!sidebarOpen} active={activeTab === 'comments'} onClick={() => setActiveTab('comments')} />
                    <SidebarBtn icon="💻" label="Terminal" collapsed={!sidebarOpen} active={activeTab === 'terminal'} onClick={() => setActiveTab('terminal')} />
                    <SidebarBtn icon="⚙️" label="Settings" collapsed={!sidebarOpen} active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
                </nav>
                
                {sidebarOpen && <div style={{ padding: 20, fontSize: '0.8rem', color: '#555' }}>Session: Active</div>}
            </motion.div>

            {/* CONTENT AREA */}
            <div style={{ flex: 1, overflowY: 'auto', background: '#0a0a0a', position: 'relative' }}>
                <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', height: '100%', boxSizing: 'border-box' }}>
                    {/* 
                       FIX: We use display: none instead of {condition && Component}.
                       This keeps all components mounted, preserving their state
                       and preventing the screen refresh/flicker.
                    */}
                    <div style={{ display: activeTab === 'editor' ? 'block' : 'none', height: '100%' }}>
                        <AdminEditor />
                    </div>
                    
                    <div style={{ display: activeTab === 'comments' ? 'block' : 'none', height: '100%' }}>
                        <AdminComments />
                    </div>

                    <div style={{ display: activeTab === 'terminal' ? 'block' : 'none', height: '100%' }}>
                        <AdminTerminal />
                    </div>

                    <div style={{ display: activeTab === 'settings' ? 'block' : 'none', height: '100%' }}>
                        <AdminSettings />
                    </div>
                </div>
            </div>
        </div>
    );
};

// Sidebar Button Helper
const SidebarBtn = ({ icon, label, active, onClick, collapsed }: any) => (
    <button 
        onClick={onClick}
        title={collapsed ? label : ''}
        style={{ 
            display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
            width: '100%', padding: '12px', 
            background: active ? '#0070f3' : 'transparent', 
            color: active ? 'white' : '#aaa',
            border: 'none', borderRadius: '4px', marginBottom: '5px', cursor: 'pointer',
            transition: 'background 0.2s, color 0.2s'
        }}
    >
        <span style={{ fontSize: '1.2rem', marginRight: collapsed ? 0 : '10px' }}>{icon}</span>
        {!collapsed && <span>{label}</span>}
    </button>
);