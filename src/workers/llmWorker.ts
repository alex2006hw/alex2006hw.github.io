/* eslint-disable no-restricted-globals */
import { CreateMLCEngine } from "@mlc-ai/web-llm";
import { MQTTBus } from '../utils/mqtt';

const ctx: Worker = self as any;
let engine: any = null;
const mqtt = new MQTTBus();

const mcpRequest = (method: string, params: any = {}): Promise<any> => {
    return new Promise((resolve) => {
        const id = Math.random().toString(36).substring(7);
        const unsub = mqtt.subscribe('mcp/response', (res: any) => {
            if (res.id === id) {
                unsub();
                resolve(res.result);
            }
        });
        mqtt.publish('mcp/request', { jsonrpc: "2.0", id, method, params });
    });
};

ctx.addEventListener("message", async (e: MessageEvent) => {
  const { type, payload } = e.data;
  
  if (type === "INIT_LLM") {
    try {
      ctx.postMessage({ type: "PROGRESS", payload: "Loading WebLLM module engine..." });
      engine = await CreateMLCEngine(payload.model, {
        initProgressCallback: (report) => {
          ctx.postMessage({ type: "PROGRESS", payload: report.text });
        }
      });
      ctx.postMessage({ type: "READY" });
    } catch (err: any) {
      ctx.postMessage({ type: "ERROR", payload: err.message });
    }
  }
  
  if (type === "GENERATE") {
    if (!engine) {
      ctx.postMessage({ type: "ERROR", payload: "Engine has not been initialized." });
      return;
    }
    try {
      ctx.postMessage({ type: "PROGRESS", payload: "Fetching VM state..." });
      
      const resourceRes = await mcpRequest("resources/read", { uri: "v86://serial/buffer" });
      const serialBuffer = resourceRes?.contents?.[0]?.text || "";

      ctx.postMessage({ type: "PROGRESS", payload: "Thinking..." });
      
      const messages: any[] = [
        { 
          role: "system", 
          content: "You are directly connected to a Linux virtual machine via a terminal console. Fulfill the user's request by outputting ONLY the raw bash commands to execute. Do not include any explanations, greetings, markdown formatting, or backticks. Every response must be immediately executable shell commands. End your commands with a newline character so they execute." 
        }
      ];

      if (serialBuffer) {
          messages.push({ role: "system", content: `CURRENT TERMINAL SCREEN OUTPUT:\n${serialBuffer}` });
      }

      messages.push({ role: "user", content: payload.prompt });

      const response = await engine.chat.completions.create({
        messages: messages,
      });
      
      const message = response.choices[0].message;
      let reply = message.content || "";
      // Strip markdown code block syntax
      reply = reply.replace(/```[a-zA-Z]*\n?/g, "").replace(/```\n?/g, "").trim();

      // Call MCP Tool to execute command
      console.log("[llmWorker] Generated LLM reply:", JSON.stringify(reply));
      console.log("[llmWorker] Sending tools/call MCP request...");
      const mcpResult = await mcpRequest("tools/call", { name: "execute_vm_command", arguments: { command: reply } });
      console.log("[llmWorker] Received MCP tools/call result:", mcpResult);
      
      // The reply will now be automatically piped into the serial terminal line via MCP.
      ctx.postMessage({ type: "REPLY", payload: reply });
    } catch (err: any) {
      ctx.postMessage({ type: "ERROR", payload: err.message });
    }
  }
});
