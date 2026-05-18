/* eslint-disable no-restricted-globals */
import { CreateMLCEngine, prebuiltAppConfig } from "@mlc-ai/web-llm";
import { MQTTBus } from '../utils/mqtt';

const ctx: Worker = self as any;
let engine: any = null;
let isInitializing = false;
let isGenerating = false;
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
    if (isInitializing || engine) return;
    isInitializing = true;
    try {
      ctx.postMessage({ type: "PROGRESS", payload: "Loading WebLLM module engine..." });
      
      const customAppConfig = { ...prebuiltAppConfig };
      const deepseekRecord = {
          model: "https://huggingface.co/mlc-ai/DeepSeek-R1-Distill-Qwen-1.5B-q4f16_1-MLC",
          model_id: "DeepSeek-R1-Distill-Qwen-1.5B-q4f16_1-MLC",
          model_lib: "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_83/base/Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm",
          low_resource_required: true,
          overrides: { context_window_size: 2048 }
      };
      // Only append if it's not already in the list (in case of future package upgrades)
      if (!customAppConfig.model_list.find(m => m.model_id === deepseekRecord.model_id)) {
          customAppConfig.model_list = [...customAppConfig.model_list, deepseekRecord as any];
      }

      engine = await CreateMLCEngine(payload.model, {
        initProgressCallback: (report) => {
          ctx.postMessage({ type: "PROGRESS", payload: report.text });
        },
        appConfig: customAppConfig
      }, {
        context_window_size: 2048
      });
      ctx.postMessage({ type: "READY", payload: payload.model });
    } catch (err: any) {
      ctx.postMessage({ type: "ERROR", payload: err.message });
    } finally {
      isInitializing = false;
    }
  }
  
  if (type === "GENERATE") {
    if (!engine) {
      ctx.postMessage({ type: "ERROR", payload: "Engine has not been initialized." });
      return;
    }
    if (isGenerating) {
      console.warn("Already generating...");
      return;
    }
    isGenerating = true;
    try {
      ctx.postMessage({ type: "PROGRESS", payload: "Fetching VM state..." });
      
      const resourceRes = await mcpRequest("resources/read", { uri: "v86://serial/buffer" });
      const serialBuffer = resourceRes?.contents?.[0]?.text || "";

      ctx.postMessage({ type: "PROGRESS", payload: "Thinking..." });
      
      await engine.resetChat();

      let systemContent = "You are directly connected to a Linux virtual machine via a terminal console. Fulfill the user's request by outputting ONLY the raw bash commands to execute. Do not include any explanations, greetings, markdown formatting, or backticks. Every response must be immediately executable shell commands. End your commands with a newline character so they execute.";
      
      if (serialBuffer) {
          systemContent += `\n\nCURRENT TERMINAL SCREEN OUTPUT:\n${serialBuffer}`;
      }

      const messages: any[] = [
        { role: "system", content: systemContent },
        { role: "user", content: payload.prompt }
      ];

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
    } finally {
      isGenerating = false;
    }
  }
});
