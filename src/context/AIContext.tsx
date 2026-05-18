import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';

interface AIContextProps {
  llmStatus: string;
  llmProgress: string;
  lastAiReply: string;
  initLlama: () => void;
  sendPrompt: (prompt: string) => void;
  registerListener: (callback: (reply: string) => void) => () => void;
}

const AIContext = createContext<AIContextProps | undefined>(undefined);

export const AIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const llmWorkerRef = useRef<Worker | null>(null);
  const [llmStatus, setLlmStatus] = useState("Uninitialized");
  const [llmProgress, setLlmProgress] = useState("");
  const [lastAiReply, setLastAiReply] = useState("");
  const listenersRef = useRef<Array<(reply: string) => void>>([]);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/llmWorker.ts', import.meta.url));

    worker.addEventListener("message", (e) => {
      const { type, payload } = e.data;
      if (type === "PROGRESS") {
        setLlmProgress(payload);
      } else if (type === "READY") {
        setLlmStatus("Ready");
        setLlmProgress("Llama-3 loaded successfully.");
      } else if (type === "ERROR") {
        setLlmStatus("Error");
        setLlmProgress(`Failure: ${payload}`);
      } else if (type === "REPLY") {
        setLlmStatus("Ready");
        setLastAiReply(payload);
        listenersRef.current.forEach(listener => listener(payload));
      }
    });

    llmWorkerRef.current = worker;
    
    // Auto-start LLM on App start
    setLlmStatus("Initializing");
    worker.postMessage({
        type: "INIT_LLM",
        payload: { model: "Llama-3.2-1B-Instruct-q4f16_1-MLC" }
    });

    return () => {
      worker.terminate();
    };
  }, []);

  const initLlama = () => {
    if (!llmWorkerRef.current) return;
    setLlmStatus("Initializing");
    llmWorkerRef.current.postMessage({
      type: "INIT_LLM",
      payload: { model: "Llama-3.2-1B-Instruct-q4f16_1-MLC" }
    });
  };

  const sendPrompt = (prompt: string) => {
    if (!prompt.trim() || !llmWorkerRef.current || llmStatus !== "Ready") return;
    setLlmStatus("Generating");
    llmWorkerRef.current.postMessage({
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
