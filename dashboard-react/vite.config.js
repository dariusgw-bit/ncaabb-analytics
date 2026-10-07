import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const picksFile = path.join(projectRoot, "public", "data", "picks.json");
let picksWriteQueue = Promise.resolve();

function picksJsonPlugin() {
  return {
    name: "ncaabb-picks-json",
    configureServer(server) {
      server.middlewares.use("/api/picks", async (request, response) => {
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        if (request.method === "GET") {
          try {
            response.end(await readFile(picksFile, "utf8"));
          } catch (error) {
            if (error.code !== "ENOENT") {
              response.statusCode = 500;
              response.end(JSON.stringify({ error: "Could not read picks ledger" }));
              return;
            }
            response.end(JSON.stringify({ version: 1, picks: [] }));
          }
          return;
        }
        if (request.method !== "PUT") {
          response.statusCode = 405;
          response.setHeader("Allow", "GET, PUT");
          response.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        try {
          const chunks = [];
          let size = 0;
          for await (const chunk of request) {
            size += chunk.length;
            if (size > 5 * 1024 * 1024) {
              response.statusCode = 413;
              response.end(JSON.stringify({ error: "Picks payload is too large" }));
              return;
            }
            chunks.push(chunk);
          }
          const payload = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
          if (!Array.isArray(payload.picks)) {
            response.statusCode = 400;
            response.end(JSON.stringify({ error: "Expected a picks array" }));
            return;
          }
          const saved = { version: 1, updated_at: new Date().toISOString(), picks: payload.picks };
          const operation = picksWriteQueue.then(async () => {
            await mkdir(path.dirname(picksFile), { recursive: true });
            const tempFile = picksFile + "." + process.pid + ".tmp";
            await writeFile(tempFile, JSON.stringify(saved, null, 2) + "\n", "utf8");
            await rename(tempFile, picksFile);
          });
          picksWriteQueue = operation.catch(() => {});
          await operation;
          response.end(JSON.stringify({ ok: true, count: saved.picks.length, updated_at: saved.updated_at }));
        } catch (error) {
          response.statusCode = error instanceof SyntaxError ? 400 : 500;
          response.end(JSON.stringify({ error: error instanceof SyntaxError ? "Invalid JSON payload" : "Could not save picks ledger" }));
        }
      });
    }
  };
}

function shutdownPlugin() {
  return { name: "ncaabb-shutdown", configureServer(server) {
    server.middlewares.use("/api/shutdown", (request, response, next) => {
      if (request.method !== "POST") { next(); return; }
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ ok: true, message: "Dashboard shutting down" }));
      setTimeout(() => server.httpServer?.close(), 150);
    });
  } };
}

export default defineConfig({
  plugins: [react(), picksJsonPlugin(), shutdownPlugin()],
  server: {
    port: 5173,
    host: "0.0.0.0"
  }
});
