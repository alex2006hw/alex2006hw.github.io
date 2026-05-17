import { useEffect, useState } from 'react';
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

        // Extract the size into a variable so we can use it twice
        const dbSize = configData.databaseLength || configData.length;

        const rawWorker = await createDbWorker(
          [
            {
              from: "inline",
              config: {
                serverMode: "chunked",
                urlPrefix: "/assets/db.sqlite",
                serverChunkSize: dbSize,
                databaseLengthBytes: dbSize,
                suffixLength: 1, 
                requestChunkSize: 4096
              }
            }
          ],
          workerUrl,
          wasmUrl
        );

        console.log("✅ SQL.js Worker Connected");
        setWorker({
            // FIX: Pass params directly to db.query, which natively handles them over the Comlink worker
            exec: async (sql: string, params?: any[]) => {
                try { 
                    if (params) {
                        return await rawWorker.db.query(sql, params);
                    }
                    return await rawWorker.db.query(sql); 
                }
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
