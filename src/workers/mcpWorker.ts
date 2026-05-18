/* eslint-disable no-restricted-globals */
import { MQTTBus } from '../utils/mqtt';

const ctx: Worker = self as any;
const mqtt = new MQTTBus();

let serialBuffer = "";

// Subscribe to serial output bus
mqtt.subscribe('v86/serial/rx', (text: string) => {
    serialBuffer += text;
    if (serialBuffer.length > 5000) {
        serialBuffer = serialBuffer.slice(-5000);
    }
});

// Act as MCP Server over MQTT
mqtt.subscribe('mcp/request', (request: any) => {
    console.log("[mcpWorker] Received mcp/request:", request);
    const { jsonrpc, id, method, params } = request;
    if (jsonrpc !== "2.0") return;

    if (method === "tools/list") {
        mqtt.publish('mcp/response', {
            jsonrpc: "2.0",
            id,
            result: {
                tools: [
                    {
                        name: "execute_vm_command",
                        description: "Execute a shell command on the v86 Linux virtual machine.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                command: { type: "string" }
                            },
                            required: ["command"]
                        }
                    }
                ]
            }
        });
    } else if (method === "tools/call") {
        if (params.name === "execute_vm_command") {
            const cmd = params.arguments.command;
            console.log(`[mcpWorker] Executing execute_vm_command tool. Command payload:`, JSON.stringify(cmd));
            
            // Execute on VGA keyboard so it actually runs in the active shell, but pipe output to serial port so AI sees it!
            const wrappedCmd = `{ ${cmd}; } 2>&1 | tee /dev/ttyS0`;
            mqtt.publish('v86/vga/tx', wrappedCmd + "\n");
            
            mqtt.publish('mcp/response', {
                jsonrpc: "2.0",
                id,
                result: {
                    content: [{ type: "text", text: "Command executed on serial line." }]
                }
            });
        }
    } else if (method === "resources/read") {
        if (params.uri === "v86://serial/buffer") {
            mqtt.publish('mcp/response', {
                jsonrpc: "2.0",
                id,
                result: {
                    contents: [{
                        uri: params.uri,
                        mimeType: "text/plain",
                        text: serialBuffer
                    }]
                }
            });
        }
    }
});

ctx.addEventListener('message', () => {
    // Keep alive or initialize
});
