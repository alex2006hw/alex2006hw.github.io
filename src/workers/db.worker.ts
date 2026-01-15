import { createDbWorker } from "sql.js-httpvfs";
const workerUrl = new URL("sql.js-httpvfs/dist/sqlite.worker.js", import.meta.url);
const wasmUrl = new URL("sql.js-httpvfs/dist/sql-wasm.wasm", import.meta.url);
createDbWorker(
  [{ from: "jsonconfig", configUrl: "/assets/config.json" }],
  workerUrl.toString(), wasmUrl.toString()
);
