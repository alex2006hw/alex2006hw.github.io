iimport { useEffect, useState } from 'react';
import { createDbWorker } from "sql.js-httpvfs";

export const useDatabase = () => {
  const [worker, setWorker] = useState<any>(null);

  useEffect(() => {
    const initDB = async () => {
      try {
        const workerUrl = "/assets/sqlite.worker.js";
        const wasmUrl = "/assets/sql-wasm.wasm";
        
        // 1. Manually fetch the config to bypass the worker's internal fetch
        //    cache: "no-store" forces browsers and Service Workers to get a fresh copy
        const res = await fetch(`/assets/config.json?v=${Date.now()}`, { 
          cache: "no-store" 
        });
        const configData = await res.json();

        // 2. Use 'inline' config. We map the config ourselves to guarantee 
        //    the URL is NEVER undefined, even if the CDN serves an old file!
        const rawWorker = await createDbWorker(
          [
            {
              from: "inline",
              config: {
                serverMode: "chunked",
                requestChunkSize: 4096,
                // The fallback handles both old and new config file structures
                databaseLength: configData.databaseLength || configData.length,
                serverChunks: [
                  {
                    // Hardcoding the path completely prevents the undefined0 error
                    serverUrl: "/assets/db.sqlite0",
                    requestChunkSize: 4096
                  }
                ]
              }
            }
          ],
          workerUrl,
          wasmUrl
        );

        console.log("✅ SQL.js Worker Connected");
        setWorker({
            exec: async (sql: string) => {
                try { return await rawWorker.db.query(sql); }
                catch (e) { console.error("SQL Error:", e); throw e; }
            }
        });
      } catch (e) {
        console.error("❌ Failed to load SQL.js Worker:", e);
        setWorker({ exec: async () => [] });
      }
    };
    initDB();
  }, []);
  
  return { worker };
};
