
"use strict";

// --- ROBUST ENVIRONMENT SHIMS ---
// v86 checks for window, document, and screen. We mock them for the Worker scope.
self.window = self;
self.screen = { width: 1024, height: 768 };

self.document = {
    // Return a fake element so v86 doesn't crash when looking for screen_container
    getElementById: function(id) { 
        return { 
            style: {}, 
            appendChild: function() {}, 
            getContext: function() { return null; }, // Canvas shim
            addEventListener: function() {},
            getBoundingClientRect: function() { return { width: 0, height: 0 }; }
        }; 
    },
    createElement: function(tag) { 
        return { 
            style: {}, 
            getContext: function() { return null; } // Canvas shim
        }; 
    },
    addEventListener: function() {},
    removeEventListener: function() {},
    documentElement: { style: {} }
};

// Load library
importScripts("libv86.js");

var emulator = null;

onmessage = function(e) {
    var msg = e.data;

    // --- INIT ---
    if (msg.cmd === 'init') {
        if (emulator) {
            try { emulator.stop(); } catch(e) {}
        }

        var V86 = self.V86Starter || self.V86 || self.window.V86Starter;
        if (!V86) {
            postMessage({ type: 'error', data: 'V86 engine not found in worker.' });
            return;
        }

        try {
            // Remove screen_container from config for Worker mode to force headless/serial
            var config = msg.config;
            config.screen_container = null; 

            emulator = new V86(config);

            // Use BYTE listener for raw serial data (more reliable than char)
            emulator.add_listener("serial0-output-byte", function(byte) {
                // Convert byte to char immediately to send text, or send byte buffer
                // Simple char conversion works for standard ASCII terminals
                var char = String.fromCharCode(byte);
                postMessage({ type: 'serial', data: char });
            });

            emulator.add_listener("download-progress", function(p) {
                postMessage({ type: 'progress', loaded: p.loaded, total: p.total });
            });
            
            emulator.add_listener("emulator-ready", function() {
                postMessage({ type: 'ready' });
            });

        } catch (err) {
            postMessage({ type: 'error', data: err.toString() });
        }
        return;
    }

    // --- INPUT ---
    if (msg.cmd === 'input' && emulator) {
        emulator.serial0_send(msg.data);
        return;
    }

    // --- SAVE ---
    if (msg.cmd === 'save' && emulator) {
        emulator.save_state(function(error, new_state) {
            if (error) {
                postMessage({ type: 'save_error', data: error.toString() });
            } else {
                postMessage({ type: 'save_success', data: new_state }, [new_state]);
            }
        });
        return;
    }
};
