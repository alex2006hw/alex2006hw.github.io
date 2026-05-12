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

                // 1. Tell the worker the "chunk" on the server is the size of the whole DB
                serverChunkSize: dbSize,
                databaseLengthBytes: dbSize,

                suffixLength: 1, // Still points to db.sqlite0

                // 2. Tell the browser to fetch data in tiny 4KB HTTP Range requests
                requestChunkSize: 4096
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
