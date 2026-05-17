import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import _ from 'lodash';

// Extend window to recognize V86Starter once libv86.js is injected
declare global {
  interface Window {
    V86Starter: any;
    V86: any;
    v86: any;
  }
}

const OS_CONFIGS: Record<string, any> = {
  linux4: {
    name: 'Linux 4 (X11)',
    cdrom: { url: '/assets/v86/linux4.iso' },
    memory_size: 128 * 1024 * 1024,
    vga_memory_size: 8 * 1024 * 1024,
    cmdline: 'console=ttyS0 root=/dev/sr0 vga=791',
  },
  tinycore: {
    name: 'TinyCore 11',
    cdrom: { url: '/assets/v86/TinyCore-11.0.iso' },
    memory_size: 128 * 1024 * 1024,
    vga_memory_size: 8 * 1024 * 1024,
  },
  linux3: {
    name: 'Linux 3',
    cdrom: { url: '/assets/v86/linux3.iso' },
    memory_size: 64 * 1024 * 1024,
    vga_memory_size: 2 * 1024 * 1024,
    cmdline: 'console=ttyS0',
  },
  linux: {
    name: 'Generic Linux',
    cdrom: { url: '/assets/v86/linux.iso' },
    memory_size: 64 * 1024 * 1024,
    vga_memory_size: 2 * 1024 * 1024,
  },
  kolibri: {
    name: 'KolibriOS',
    fda: { url: '/assets/v86/kolibri.img' },
    memory_size: 64 * 1024 * 1024,
    vga_memory_size: 8 * 1024 * 1024,
  },
  win101: {
    name: 'Windows 1.01',
    fda: { url: '/assets/v86/windows101.img' },
    memory_size: 16 * 1024 * 1024,
    vga_memory_size: 2 * 1024 * 1024,
  },
  msdos622: {
    name: 'MS-DOS 6.22',
    fda: { url: '/assets/v86/msdos622.img' },
    memory_size: 16 * 1024 * 1024,
    vga_memory_size: 2 * 1024 * 1024,
  },
  freedos: {
    name: 'FreeDOS 7.22',
    fda: { url: '/assets/v86/freedos722.img' },
    memory_size: 32 * 1024 * 1024,
    vga_memory_size: 2 * 1024 * 1024,
  },
  bzimage: {
    name: 'Buildroot (BzImage)',
    bzimage: { url: '/assets/v86/buildroot-bzimage68.bin' },
    cmdline: 'console=ttyS0 root=/dev/ram0 rw',
    memory_size: 64 * 1024 * 1024,
  },
};

export const AdminTerminal: React.FC = () => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const emulatorRef = useRef<any>(null);
  const termRef = useRef<Terminal | null>(null);

  const [selectedOS, setSelectedOS] = useState('kolibri');
  const [status, setStatus] = useState('Idle');
  const [activeView, setActiveView] = useState<'serial' | 'vga'>('vga');

  const saveToDB = async (arrayBuffer: ArrayBuffer, os: string) => {
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = window.indexedDB.open('V86_Machine_States', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('snapshots');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      const tx = db.transaction('snapshots', 'readwrite');
      const store = tx.objectStore('snapshots');

      await new Promise((resolve, reject) => {
        const req = store.put(
          {
            os_type: os,
            date: new Date().toISOString(),
            buffer: arrayBuffer,
          },
          os
        );

        req.onsuccess = resolve;
        req.onerror = reject;
      });

      setStatus('Saved Local Snapshot.');
    } catch (e) {
      console.error('IndexedDB Save Error:', e);
      setStatus('Save Failed');
    }
  };

  const requestSave = useCallback(
    (isAuto: boolean) => {
      if (!emulatorRef.current) return;
      setStatus(isAuto ? 'Auto-Saving...' : 'Saving...');

      emulatorRef.current
        .save_state()
        .then((arrayBuffer: ArrayBuffer) => {
          saveToDB(arrayBuffer, selectedOS);
        })
        .catch((e: any) => {
          console.error(e);
          setStatus('Save Failed');
        });
    },
    [selectedOS]
  );

  const debouncedSave = useMemo(() => _.debounce(() => requestSave(true), 10000), [requestSave]);
  useEffect(() => () => debouncedSave.cancel(), [debouncedSave]);

  useEffect(() => {
    if (!terminalRef.current || !screenRef.current) return;

    // 1. Setup xterm.js
    terminalRef.current.innerHTML = '';
    const term = new Terminal({ theme: { background: '#111' }, convertEol: true });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    termRef.current = term;

    setTimeout(() => {
      try {
        if (terminalRef.current && terminalRef.current.clientWidth > 0) fitAddon.fit();
      } catch (e) {}
    }, 50);

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        try {
          if (terminalRef.current && terminalRef.current.clientWidth > 0) fitAddon.fit();
        } catch (e) {}
      });
    });
    resizeObserver.observe(terminalRef.current);

    // 2. Initialize V86 Emulator Engine
    const initEmulator = () => {
      if (emulatorRef.current) {
        try {
          if (emulatorRef.current.v86) emulatorRef.current.destroy();
        } catch (e) {}
        emulatorRef.current = null;
      }

      term.clear();
      term.write(`\x1b[32m>>> Booting ${OS_CONFIGS[selectedOS].name}...\x1b[0m\r\n`);

      const V86Constructor = window.V86Starter || window.V86 || (window as any).v86?.V86Starter;
      if (typeof V86Constructor !== 'function') {
        setStatus('Emulator Load Error');
        term.write('\r\n\x1b[31mError: Could not find V86 engine on window object.\x1b[0m\r\n');
        return;
      }

      emulatorRef.current = new V86Constructor({
        wasm_path: '/assets/v86/v86.wasm',
        bios: { url: '/assets/v86/seabios.bin' },
        vga_bios: { url: '/assets/v86/vgabios.bin' },
        screen_container: screenRef.current,
        autostart: true,
        disable_speaker: true,
        ...OS_CONFIGS[selectedOS],
      });

      let bootBuffer = '';
      let osBooted = false;

      emulatorRef.current.add_listener('serial0-output-char', (char: string) => {
        if (!osBooted) {
          if (!['linux4', 'linux3', 'linux', 'bzimage', 'kolibri'].includes(selectedOS)) {
            osBooted = true;
            term.clear();
            term.write(char);
            return;
          }

          bootBuffer += char;
          if (bootBuffer.length > 25000) bootBuffer = bootBuffer.slice(-10000);

          const mIdx = bootBuffer.indexOf('mount:');
          if (mIdx !== -1) {
            osBooted = true;
            term.clear();
            term.write(bootBuffer.substring(mIdx));
            bootBuffer = '';
          }
        } else {
          term.write(char);
        }
      });

      term.onData((data) => {
        if (emulatorRef.current) {
          for (let i = 0; i < data.length; i++) {
            emulatorRef.current.serial0_send(data.charCodeAt(i));
          }
          setStatus('Active');
          debouncedSave();
        }
      });
    };

    const loadAndInit = () => {
      if (window.V86Starter || window.V86 || (window as any).v86?.V86Starter) {
        initEmulator();
        return;
      }

      const scriptUrl = '/assets/v86/libv86.js';
      const existingScript = document.querySelector(
        `script[src="${scriptUrl}"]`
      ) as HTMLScriptElement;

      if (existingScript) {
        existingScript.addEventListener('load', () => setTimeout(initEmulator, 50));
      } else {
        const script = document.createElement('script');
        script.src = scriptUrl;
        script.onload = () => setTimeout(initEmulator, 50);
        script.onerror = () => setStatus('Failed to load libv86.js');
        document.head.appendChild(script);
      }
    };

    loadAndInit();

    return () => {
      resizeObserver.disconnect();
      if (emulatorRef.current) {
        try {
          if (emulatorRef.current.v86) emulatorRef.current.destroy();
        } catch (e) {
          console.warn('V86 destruction bypassed', e);
        }
        emulatorRef.current = null;
      }
      term.dispose();
    };
  }, [selectedOS, debouncedSave]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px',
          background: '#222',
        }}
      >
        <div style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
          <select
            value={selectedOS}
            onChange={(e) => {
              if (window.confirm('Switch VM Image? Current state will be lost if not saved.'))
                setSelectedOS(e.target.value);
            }}
            style={{
              padding: '5px 10px',
              background: '#333',
              color: 'white',
              border: '1px solid #555',
              borderRadius: 4,
            }}
          >
            {Object.keys(OS_CONFIGS).map((key) => (
              <option key={key} value={key}>
                {OS_CONFIGS[key].name}
              </option>
            ))}
          </select>

          <div
            style={{
              display: 'flex',
              background: '#111',
              borderRadius: 4,
              overflow: 'hidden',
              border: '1px solid #444',
            }}
          >
            <button
              onClick={() => setActiveView('vga')}
              style={{
                padding: '6px 12px',
                background: activeView === 'vga' ? '#0070f3' : 'transparent',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              🖥️ VGA
            </button>
            <button
              onClick={() => setActiveView('serial')}
              style={{
                padding: '6px 12px',
                background: activeView === 'serial' ? '#0070f3' : 'transparent',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              ⌨️ Serial
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: '0.8em', color: status.includes('Save') ? 'lime' : '#888' }}>
            {status}
          </span>
          <button
            onClick={() => requestSave(false)}
            style={{
              padding: '6px 12px',
              background: '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Save State
          </button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          position: 'relative',
          background: '#000',
          overflow: 'hidden',
          borderRadius: 4,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            padding: 10,
            display: activeView === 'serial' ? 'block' : 'none',
          }}
        >
          <div ref={terminalRef} style={{ height: '100%', width: '100%', textAlign: 'left' }}></div>
        </div>

        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: activeView === 'vga' ? 'flex' : 'none',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <div
            ref={screenRef}
            style={{
              boxShadow: '0 0 20px rgba(0,0,0,0.5)',
              overflow: 'hidden',
              background: '#000',
            }}
          >
            <div
              style={{
                whiteSpace: 'pre',
                font: '14px monospace',
                lineHeight: '14px',
                color: 'white',
              }}
            ></div>
            <canvas style={{ display: 'none' }}></canvas>
          </div>
        </div>
      </div>
    </div>
  );
};
