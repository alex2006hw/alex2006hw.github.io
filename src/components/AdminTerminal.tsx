import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { useDatabase } from '../hooks/useDatabase';
import _ from 'lodash';

// OS Configs
const OS_CONFIGS: any = {
    'linux4': {
        name: 'Linux 4 (Buildroot)',
        cdrom: { url: "/assets/v86/linux4.iso" },
        memory_size: 64 * 1024 * 1024,
        vga_memory_size: 2 * 1024 * 1024,
        cmdline: "console=ttyS0 root=/dev/sr0" 
    },
    'linux3': {
        name: 'Linux 3',
        cdrom: { url: "/assets/v86/linux3.iso" },
        memory_size: 64 * 1024 * 1024,
        vga_memory_size: 2 * 1024 * 1024,
        cmdline: "console=ttyS0"
    },
    'freedos': {
        name: 'FreeDOS 7.22',
        fda: { url: "/assets/v86/freedos722.img" },
        memory_size: 32 * 1024 * 1024,
    },
    'bzimage': {
        name: 'Buildroot (BzImage)',
        bzimage: { url: "/assets/v86/buildroot-bzimage68.bin" },
        cmdline: "console=ttyS0 root=/dev/ram0 rw",
        memory_size: 64 * 1024 * 1024,
    }
};

export const AdminTerminal: React.FC = () => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const workerRef = useRef<Worker | null>(null);
    
    const [selectedOS, setSelectedOS] = useState('linux4');
    const [status, setStatus] = useState("Idle");
    const { worker: dbWorker } = useDatabase();

    const dbWorkerRef = useRef(dbWorker);
    useEffect(() => { dbWorkerRef.current = dbWorker; }, [dbWorker]);

    // --- SAVE LOGIC ---
    const requestSave = (isAuto: boolean) => {
        if (!workerRef.current) return;
        setStatus(isAuto ? "Auto-Saving..." : "Saving...");
        workerRef.current.postMessage({ cmd: 'save' });
    };

    const debouncedSave = useMemo(() => _.debounce(() => requestSave(true), 5000), []);
    useEffect(() => () => debouncedSave.cancel(), [debouncedSave]);

    // --- TERMINAL & WORKER ---
    useEffect(() => {
        if (!terminalRef.current) return;

        // 1. Setup xterm.js
        terminalRef.current.innerHTML = "";
        const term = new Terminal({ 
            cursorBlink: true, 
            fontSize: 14, 
            fontFamily: 'Menlo, Monaco, "Courier New", monospace', // Ensure monospace
            theme: { background: '#111' },
            convertEol: true,
            logLevel: 'off' // Prevents parsing error warnings
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        
        // 2. Init Loop (Wait for visibility)
        const initSystem = () => {
            if (!terminalRef.current || terminalRef.current.clientWidth === 0) {
                requestAnimationFrame(initSystem);
                return;
            }
            term.open(terminalRef.current);
            try { fitAddon.fit(); } catch(e){}
            
            const resizeObserver = new ResizeObserver(() => {
                requestAnimationFrame(() => { try { fitAddon.fit(); } catch(e){} });
            });
            resizeObserver.observe(terminalRef.current);
            
            startWorker(term);
        };

        const startWorker = (t: Terminal) => {
            if (workerRef.current) workerRef.current.terminate();

            // Clear terminal before new boot
            t.clear(); 
            t.write(`\x1b[32m>>> Booting ${OS_CONFIGS[selectedOS].name}...\x1b[0m\r\n`);

            const worker = new Worker("/assets/v86/worker.js");
            workerRef.current = worker;

            worker.onmessage = (e) => {
                const { type, data } = e.data;

                if (type === 'serial') {
                    // Safety check for serial data
                    const output = typeof data === 'string' ? data : new TextDecoder().decode(data);
                    t.write(output);
                } 
                else if (type === 'ready') {}
                else if (type === 'progress') {}
                else if (type === 'error') {
                    t.write(`\r\n\x1b[31mError: ${data}\x1b[0m\r\n`);
                }
                else if (type === 'save_success') {
                    saveToDB(data, selectedOS);
                }
            };

            const config = {
                wasm_path: "/assets/v86/v86.wasm",
                bios: { url: "/assets/v86/seabios.bin" },
                vga_bios: { url: "/assets/v86/vgabios.bin" },
                disable_mouse: true,
                disable_keyboard: true, 
                autostart: true,
                disable_speaker: true, // Fixes Web Audio API error
                ...OS_CONFIGS[selectedOS]
            };
            
            worker.postMessage({ cmd: 'init', config });

            t.onData(input => {
                worker.postMessage({ cmd: 'input', data: input });
                setStatus("Active");
                debouncedSave();
            });
        };

        requestAnimationFrame(initSystem);

        return () => {
            if (workerRef.current) workerRef.current.terminate();
            term.dispose();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedOS]);

    const saveToDB = (arrayBuffer: ArrayBuffer, os: string) => {
        if (!dbWorkerRef.current) return;
        
        let binary = '';
        const bytes = new Uint8Array(arrayBuffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) { binary += String.fromCharCode(bytes[i]); }
        const base64String = btoa(binary);
        
        const name = `Snapshot_${os}_${Date.now()}`;
        const date = new Date().toISOString();
        const sql = `INSERT INTO v86_states (os_type, name, date, state_blob) VALUES ('${os}', '${name}', '${date}', '${base64String}')`;

        dbWorkerRef.current.exec(sql)
            .then(() => setStatus("Saved."))
            .catch((e:any) => setStatus("DB Error"));
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: '#222' }}>
                <div style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
                    <h3 style={{margin:0}}>VM</h3>
                    <select 
                        value={selectedOS} 
                        onChange={(e) => { if(window.confirm("Switch?")) setSelectedOS(e.target.value); }}
                        style={{ padding: '5px 10px', background: '#333', color: 'white', border: '1px solid #555', borderRadius: 4 }}
                    >
                        {Object.keys(OS_CONFIGS).map(key => (
                            <option key={key} value={key}>{OS_CONFIGS[key].name}</option>
                        ))}
                    </select>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8em', color: status.includes("Save") ? 'lime' : '#888' }}>{status}</span>
                    <button onClick={() => requestSave(false)} style={{ padding: '6px 12px', background: '#0070f3', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                        Save
                    </button>
                </div>
            </div>
            
            {/* FIX: Added textAlign: 'left' to force console text to the left side */}
            <div style={{ 
                flex: 1, 
                background: 'black', 
                padding: 10, 
                position: 'relative', 
                minHeight: 0,
                textAlign: 'left' 
            }}>
                <div ref={terminalRef} style={{ height: '100%', width: '100%' }}></div>
            </div>
        </div>
    );
};