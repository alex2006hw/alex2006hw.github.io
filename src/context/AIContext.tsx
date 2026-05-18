import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';

interface AIContextProps {
  llmStatus: string;
  llmProgress: string;
  lastAiReply: string;
  initLlama: (modelId: string) => void;
  sendPrompt: (prompt: string) => void;
  registerListener: (callback: (reply: string) => void) => () => void;
}

const AIContext = createContext<AIContextProps | undefined>(undefined);

let globalLlmWorker: Worker | null = null;
let globalMcpWorker: Worker | null = null;
let globalLlmStatus = "Uninitialized";
let globalLlmProgress = "";
let globalLastReply = "";

export const AIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [llmStatus, setLlmStatus] = useState(globalLlmStatus);
  const [llmProgress, setLlmProgress] = useState(globalLlmProgress);
  const [lastAiReply, setLastAiReply] = useState(globalLastReply);
  const listenersRef = useRef<Array<(reply: string) => void>>([]);

  const updateStatus = (status: string) => {
      globalLlmStatus = status;
      setLlmStatus(status);
  };
  const updateProgress = (progress: string) => {
      globalLlmProgress = progress;
      setLlmProgress(progress);
  };
  const updateReply = (reply: string) => {
      globalLastReply = reply;
      setLastAiReply(reply);
  };

  useEffect(() => {
    if (!globalLlmWorker) {
      globalLlmWorker = new Worker(new URL('../workers/llmWorker.ts', import.meta.url), { type: 'module' });
      globalMcpWorker = new Worker(new URL('../workers/mcpWorker.ts', import.meta.url), { type: 'module' });
    }

    const handleMessage = (e: MessageEvent) => {
      const { type, payload } = e.data;
      if (type === "PROGRESS") {
        updateProgress(payload);
      } else if (type === "READY") {
        updateStatus("Ready");
        updateProgress(`${payload} loaded successfully.`);
      } else if (type === "ERROR") {
        updateStatus("Error");
        updateProgress(`Failure: ${payload}`);
      } else if (type === "REPLY") {
        updateStatus("Ready");
        updateReply(payload);
        listenersRef.current.forEach(listener => listener(payload));
      }
    };

    globalLlmWorker.addEventListener("message", handleMessage);

    // Sync state on mount just in case it changed between render and effect
    setLlmStatus(globalLlmStatus);
    setLlmProgress(globalLlmProgress);
    setLastAiReply(globalLastReply);

    return () => {
      globalLlmWorker?.removeEventListener("message", handleMessage);
      // We do not terminate workers here to prevent strict-mode and hot-reload WebGPU crashes
    };
  }, []);

  const initLlama = (modelId: string) => {
    if (!globalLlmWorker) return;
    updateStatus("Initializing");
    globalLlmWorker.postMessage({
      type: "INIT_LLM",
      payload: { model: modelId }
    });
  };

  const sendPrompt = (prompt: string) => {
    if (!prompt.trim() || !globalLlmWorker || llmStatus !== "Ready") return;
    updateStatus("Generating");
    globalLlmWorker.postMessage({
      type: "GENERATE",
      payload: { prompt }
    });
  };

  const registerListener = (callback: (reply: string) => void) => {
    listenersRef.current.push(callback);
    return () => {
      listenersRef.current = listenersRef.current.filter(c => c !== callback);
    };
  };

  return (
    <AIContext.Provider value={{ llmStatus, llmProgress, lastAiReply, initLlama, sendPrompt, registerListener }}>
      {children}
    </AIContext.Provider>
  );
};

export const useAI = () => {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error("useAI must be used within an AIProvider");
  }
  return context;
};
