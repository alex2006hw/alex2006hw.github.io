import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import _ from 'lodash';
import { useAI } from '../context/AIContext';
import { mqttBus } from '../utils/mqtt';

declare global {
    interface Window { V86Starter: any; V86: any; v86: any; }
}

const OS_CONFIGS: Record<string, any> = {
    'linux4': { name: 'Linux 4 (X11)', cdrom: { url: "/assets/v86/linux4.iso" }, memory_size: 128 * 1024 * 1024, vga_memory_size: 8 * 1024 * 1024, cmdline: "console=ttyS0 root=/dev/sr0 vga=791" },
    'tinycore': { name: 'TinyCore 11', cdrom: { url: "/assets/v86/TinyCore-11.0.iso" }, memory_size: 128 * 1024 * 1024, vga_memory_size: 8 * 1024 * 1024 },
    'linux3': { name: 'Linux 3', cdrom: { url: "/assets/v86/linux3.iso" }, memory_size: 64 * 1024 * 1024, vga_memory_size: 2 * 1024 * 1024, cmdline: "console=ttyS0" },
    'linux': { name: 'Generic Linux', cdrom: { url: "/assets/v86/linux.iso" }, memory_size: 64 * 1024 * 1024, vga_memory_size: 2 * 1024 * 1024 },
    'kolibri': { name: 'KolibriOS', fda: { url: "/assets/v86/kolibri.img" }, memory_size: 64 * 1024 * 1024, vga_memory_size: 8 * 1024 * 1024 },
    'win101': { name: 'Windows 1.01', fda: { url: "/assets/v86/windows101.img" }, memory_size: 16 * 1024 * 1024, vga_memory_size: 2 * 1024 * 1024 },
    'msdos622': { name: 'MS-DOS 6.22', fda: { url: "/assets/v86/msdos622.img" }, memory_size: 16 * 1024 * 1024, vga_memory_size: 2 * 1024 * 1024 },
    'freedos': { name: 'FreeDOS 7.22', fda: { url: "/assets/v86/freedos722.img" }, memory_size: 32 * 1024 * 1024, vga_memory_size: 2 * 1024 * 1024 },
    'bzimage': { name: 'Buildroot (BzImage)', bzimage: { url: "/assets/v86/buildroot-bzimage68.bin" }, cmdline: "console=ttyS0 root=/dev/ram0 rw", memory_size: 64 * 1024 * 1024 }
};


export const AdminTerminal: React.FC = () => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const screenRef = useRef<HTMLDivElement>(null);
    const emulatorRef = useRef<any>(null);
    const termRef = useRef<Terminal | null>(null);

    const { llmStatus, llmProgress, lastAiReply, initLlama, sendPrompt, registerListener } = useAI();

    const [selectedOS, setSelectedOS] = useState('linux');
    const [status, setStatus] = useState("Idle");
    const [activeView, setActiveView] = useState<'serial' | 'vga'>('vga');

    // WebLLM State variables
    const [aiPrompt, setAiPrompt] = useState("");
    const [serialOutput, setSerialOutput] = useState("");
    const serialBufferRef = useRef<string>("");

    useEffect(() => {
        const interval = setInterval(() => {
            setSerialOutput(serialBufferRef.current);
        }, 200);

        const unsub = mqttBus.subscribe('v86/vga/screen', (text: string) => {
            serialBufferRef.current = text;
        });
        return () => {
            clearInterval(interval);
            unsub();
        };
    }, []);

    const handleSendPrompt = () => {
        if (!aiPrompt.trim() || llmStatus !== "Ready") return;
        sendPrompt(aiPrompt);
        setAiPrompt("");
    };


    const saveToOPFS = async (arrayBuffer: ArrayBuffer, os: string) => {
        try {
            const root = await navigator.storage.getDirectory();
            const fileHandle = await root.getFileHandle(`v86_snapshot_${os}.bin`, { create: true });
            const writable = await (fileHandle as any).createWritable();
            await writable.write(arrayBuffer);
            await writable.close();
            setStatus("Saved Local Snapshot to OPFS.");
        } catch (e) {
            console.error("OPFS Save Error:", e);
            setStatus("Save Failed");
        }
    };

    const requestSave = useCallback((isAuto: boolean) => {
        if (!emulatorRef.current) return;
        setStatus(isAuto ? "Auto-Saving..." : "Saving...");
        emulatorRef.current.save_state().then((arrayBuffer: ArrayBuffer) => {
            saveToOPFS(arrayBuffer, selectedOS);
        }).catch((e: any) => {
            console.error(e);
            setStatus("Save Failed");
        });
    }, [selectedOS]);

    // Primary Initialization Hook
    useEffect(() => {
        if (!terminalRef.current || !screenRef.current) return;

        terminalRef.current.innerHTML = "";
        const term = new Terminal({ theme: { background: '#111' }, convertEol: true });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        termRef.current = term;

        setTimeout(() => { try { if (terminalRef.current && terminalRef.current.clientWidth > 0) fitAddon.fit(); } catch (e) { } }, 50);

        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(() => { try { if (terminalRef.current && terminalRef.current.clientWidth > 0) fitAddon.fit(); } catch (e) { } });
        });
        resizeObserver.observe(terminalRef.current);

        if (emulatorRef.current) {
            try { if (emulatorRef.current.v86) emulatorRef.current.destroy(); } catch (e) { }
            emulatorRef.current = null;
        }

        term.clear();
        term.write(`\x1b[32m>>> Booting ${OS_CONFIGS[selectedOS].name}...\x1b[0m\r\n`);

        let isActive = true;
        let onDataDisposable: { dispose: () => void } | null = null;
        let unsubTx: (() => void) | null = null;
        let unsubVgaTx: (() => void) | null = null;
        let screenInterval: any = null;
        let serialFlushInterval: any = null;

        const bootV86 = async () => {
            const V86Constructor = window.V86Starter || window.V86 || (window as any).v86?.V86Starter;
            if (typeof V86Constructor !== 'function') {
                setStatus("Emulator Load Error");
                term.write('\r\n\x1b[31mError: Could not find V86 engine on window object.\x1b[0m\r\n');
                return;
            }

            let savedStateBuffer: ArrayBuffer | undefined = undefined;
            try {
                const root = await navigator.storage.getDirectory();
                const fileHandle = await root.getFileHandle(`v86_snapshot_${selectedOS}.bin`, { create: false });
                const file = await fileHandle.getFile();
                savedStateBuffer = await file.arrayBuffer();
                term.write(`\x1b[33m>>> Found OPFS snapshot, restoring state...\x1b[0m\r\n`);
            } catch (e) {
                // Not found or error reading, proceed with fresh boot
            }

            if (!isActive) return;

            const config: any = {
                wasm_path: "/assets/v86/v86.wasm",
                bios: { url: "/assets/v86/seabios.bin" },
                vga_bios: { url: "/assets/v86/vgabios.bin" },
                screen_container: screenRef.current,
                autostart: true,
                disable_speaker: true,
                ...OS_CONFIGS[selectedOS]
            };

            if (savedStateBuffer) {
                config.initial_state = { buffer: savedStateBuffer };
            }

            emulatorRef.current = new V86Constructor(config);

            let localSerialBuffer = "";
            serialFlushInterval = setInterval(() => {
                if (localSerialBuffer.length > 0) {
                    mqttBus.publish('v86/serial/rx', localSerialBuffer);
                    localSerialBuffer = "";
                }
            }, 100);

            emulatorRef.current.add_listener("serial0-output-char", (char: string) => {
                term.write(char);
                localSerialBuffer += char;
            });

            unsubTx = mqttBus.subscribe('v86/serial/tx', (text: string) => {
                console.log("[AdminTerminal] Received v86/serial/tx payload:", JSON.stringify(text));
                if (!emulatorRef.current) {
                    console.error("[AdminTerminal] Error: emulatorRef.current is null!");
                    return;
                }
                console.log("[AdminTerminal] Injecting text to emulator...");
                for (let i = 0; i < text.length; i++) {
                    const charCode = text.charCodeAt(i);
                    console.log(`[AdminTerminal] serial0_send charCode: ${charCode} ('${text[i]}')`);
                    emulatorRef.current.serial0_send(charCode);
                }
                console.log("[AdminTerminal] Injection complete.");
            });
            unsubVgaTx = mqttBus.subscribe('v86/vga/tx', (text: string) => {
                if (!emulatorRef.current) return;
                emulatorRef.current.keyboard_send_text(text);
            });



            onDataDisposable = term.onData(data => {
                if (emulatorRef.current) {
                    for (let i = 0; i < data.length; i++) {
                        console.log(`[AdminTerminal] term.onData manual input charCode: ${data.charCodeAt(i)}`);
                        emulatorRef.current.serial0_send(data.charCodeAt(i));
                    }
                    setStatus("Active");
                }
            });

            screenInterval = setInterval(() => {
                if (emulatorRef.current && emulatorRef.current.screen_adapter) {
                    const textLines = emulatorRef.current.screen_adapter.get_text_screen();
                    if (textLines && textLines.length > 0) {
                        const text = textLines.join('\n').replace(/\s+$/g, '');
                        mqttBus.publish('v86/vga/screen', text);
                    }
                }
            }, 500);
        };

        bootV86();

        return () => {
            isActive = false;
            resizeObserver.disconnect();
            if (onDataDisposable) onDataDisposable.dispose();
            try { if (unsubTx) unsubTx(); } catch (e) { }
            try { if (unsubVgaTx) unsubVgaTx(); } catch (e) { }
            if (screenInterval) clearInterval(screenInterval);
            if (serialFlushInterval) clearInterval(serialFlushInterval);
            if (emulatorRef.current) {
                try { if (emulatorRef.current.v86) emulatorRef.current.destroy(); } catch (e) { }
                emulatorRef.current = null;
            }
            term.dispose();
        };
    }, [selectedOS]);

    return (
        <div style={{ display: 'flex', height: '100%', width: '100%', background: '#050505', fontFamily: 'monospace' }}>

            {/* Left Control Sidebar Panel */}
            <div style={{ width: '280px', borderRight: '1px solid #222', padding: '15px', display: 'flex', flexDirection: 'column', gap: '20px', background: '#0a0a0a', boxSizing: 'border-box' }}>
                <h3 style={{ margin: 0, color: '#00ff88', fontSize: '14px' }}>⚙️ SYSTEM PROFILE</h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '11px', color: '#666' }}>SELECT ARCHITECTURE IMAGE</label>
                    <select
                        value={selectedOS}
                        onChange={(e) => { if (window.confirm("Switch VM Image? Current runtime memory states will break.")) setSelectedOS(e.target.value); }}
                        style={{ padding: '6px', background: '#161616', color: 'white', border: '1px solid #333', borderRadius: 4, cursor: 'pointer' }}
                    >
                        {Object.keys(OS_CONFIGS).map(key => (
                            <option key={key} value={key}>{OS_CONFIGS[key].name}</option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '11px', color: '#666' }}>DISPLAY CONSOLE ROUTE</label>
                    <div style={{ display: 'flex', border: '1px solid #333', borderRadius: 4, overflow: 'hidden' }}>
                        <button onClick={() => setActiveView('vga')} style={{ flex: 1, padding: '6px', background: activeView === 'vga' ? '#0070f3' : 'transparent', color: 'white', border: 'none', cursor: 'pointer', fontSize: '12px' }}>VGA Screen</button>
                        <button onClick={() => setActiveView('serial')} style={{ flex: 1, padding: '6px', background: activeView === 'serial' ? '#0070f3' : 'transparent', color: 'white', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Serial Line</button>
                    </div>
                </div>

                <button onClick={() => requestSave(false)} style={{ padding: '8px', background: '#222', border: '1px solid #444', color: 'white', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>
                    💾 SNAPSHOT RUNTIME
                </button>
                <div style={{ fontSize: '11px', color: '#888', textAlign: 'center' }}>State: {status}</div>

                <hr style={{ borderColor: '#222', margin: '5px 0' }} />

                {/* WebLLM Llama3 Section */}
                <h3 style={{ margin: 0, color: '#00aaff', fontSize: '14px' }}>🧠 LOCAL LLM ASSISTANT</h3>

                {llmStatus === "Uninitialized" ? (
                    <button onClick={initLlama} style={{ padding: '10px', background: '#00aaff', border: 'none', color: 'black', fontWeight: 'bold', borderRadius: 4, cursor: 'pointer' }}>
                        Load Llama-3 (WebLLM)
                    </button>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ fontSize: '11px', color: '#888' }}>Status: <span style={{ color: '#ffaa00' }}>{llmStatus}</span></div>
                        <div style={{ fontSize: '10px', color: '#aaa', background: '#111', padding: '6px', borderRadius: 4, maxHeight: '60px', overflowY: 'auto', border: '1px solid #222' }}>
                            {llmProgress || "Ready context pipeline established."}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <input
                                type="text"
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendPrompt()}
                                placeholder="Command instruction prompt..."
                                disabled={llmStatus !== "Ready"}
                                style={{ padding: '8px', background: '#111', border: '1px solid #333', color: 'white', borderRadius: 4, fontSize: '12px' }}
                            />
                            <button
                                onClick={handleSendPrompt}
                                disabled={llmStatus !== "Ready" || !aiPrompt.trim()}
                                style={{ padding: '6px', background: llmStatus === "Ready" ? '#0070f3' : '#333', border: 'none', color: 'white', borderRadius: 4, cursor: 'pointer', fontSize: '12px' }}
                            >
                                Inject Automation Keys
                            </button>
                        </div>
                    </div>
                )}

                {lastAiReply && (
                    <div style={{ marginTop: '5px' }}>
                        <div style={{ fontSize: '10px', color: '#666' }}>LAST SENT PAYLOAD:</div>
                        <div style={{ fontSize: '11px', color: '#00ff88', background: '#000', padding: '6px', borderRadius: 4, border: '1px solid #222' }}>{lastAiReply}</div>
                    </div>
                )}
                
                <div style={{ marginTop: '5px' }}>
                    <div style={{ fontSize: '10px', color: '#666' }}>SERIAL PORT OUTPUT:</div>
                    <div style={{ fontSize: '11px', color: '#ccc', background: '#111', padding: '6px', borderRadius: 4, border: '1px solid #222', minHeight: '60px', maxHeight: '150px', overflowY: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                        {serialOutput || "Waiting for command output..."}
                    </div>
                </div>
            </div>

            {/* Right Screen Output Display */}
            <div style={{ flex: 1, position: 'relative', background: '#000' }}>
                <div style={{ position: 'absolute', inset: 0, padding: '10px', display: activeView === 'serial' ? 'block' : 'none' }}>
                    <div ref={terminalRef} style={{ height: '100%', width: '100%' }}></div>
                </div>

                <div style={{ position: 'absolute', inset: 0, display: activeView === 'vga' ? 'flex' : 'none', justifyContent: 'center', alignItems: 'center' }}>
                    <div
                        ref={screenRef}
                        onClick={() => document.pointerLockElement !== screenRef.current && screenRef.current?.requestPointerLock?.()}
                        style={{ display: 'grid', placeItems: 'center', background: '#000', cursor: 'crosshair', maxWidth: '100%', maxHeight: '100%' }}
                    >
                        <div style={{ gridArea: '1 / 1', whiteSpace: 'pre', font: '14px monospace', lineHeight: '14px', color: 'white' }}></div>
                        <canvas style={{ display: 'none', gridArea: '1 / 1', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}></canvas>
                    </div>
                    <div style={{ position: 'absolute', bottom: 15, background: 'rgba(0,0,0,0.8)', color: '#666', padding: '4px 10px', borderRadius: 4, fontSize: '11px' }}>
                        Click screen target to acquire pointer lock. ESC to unlock.
                    </div>
                </div>
            </div>
        </div>
    );
};
