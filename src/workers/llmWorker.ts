/* eslint-disable no-restricted-globals */
import { CreateMLCEngine } from "@mlc-ai/web-llm";

const ctx: Worker = self as any;
let engine: any = null;

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
      ctx.postMessage({ type: "PROGRESS", payload: "Thinking..." });
      
      // Define tool for executing commands in the VM
      const tools = [
        {
          type: "function",
          function: {
            name: "execute_vm_command",
            description: "Execute a command in the v86 Linux virtual machine over the serial line. Use this to perform actions inside the VM.",
            parameters: {
              type: "object",
              properties: {
                command: {
                  type: "string",
                  description: "The command to run, e.g., 'ls -la\\n' or 'cat file.txt\\n'. Must end with a newline character."
                }
              },
              required: ["command"]
            }
          }
        }
      ];

      const response = await engine.chat.completions.create({
        messages: [{ role: "user", content: payload.prompt }],
      });
      
      const message = response.choices[0].message;
      let reply = message.content || "";
      
      if (message.tool_calls && message.tool_calls.length > 0) {
          for (const call of message.tool_calls) {
              if (call.function.name === "execute_vm_command") {
                  try {
                      const args = JSON.parse(call.function.arguments);
                      reply += (reply ? "\\n" : "") + args.command;
                  } catch (e) {}
              }
          }
      }
      
      ctx.postMessage({ type: "REPLY", payload: reply });
    } catch (err: any) {
      ctx.postMessage({ type: "ERROR", payload: err.message });
    }
  }
});
