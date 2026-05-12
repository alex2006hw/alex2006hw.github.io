import { useEffect, useState } from 'react';
import { createDbWorker } from "sql.js-httpvfs";

export const useDatabase = () => {
  const [worker, setWorker] = useState<any>(null);

  useEffect(() => {
    const initDB = async () => {
      try {
        const workerUrl = "/assets/sqlite.worker.js";
        const wasmUrl = "/assets/sql-wasm.wasm";
        
        // This dynamically breaks the GitHub Pages Fastly CDN cache
        const cacheBuster = `?v=${Date.now()}`;

        const rawWorker = await createDbWorker(
          [ { from: "jsonconfig", configUrl: `/assets/config.json${cacheBuster}` } ],
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
