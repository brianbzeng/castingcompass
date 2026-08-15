import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, request as requestUpstream } from "node:http";
import path from "node:path";

const proxyHost = "127.0.0.1";
const proxyPort = 4173;
const upstreamPort = 4174;
const canonicalHost = "castingcompass.com";
const clientRoot = path.resolve(process.cwd(), "dist", "client");
const vinext = path.join(process.cwd(), "node_modules", "vinext", "dist", "cli.js");

const upstream = spawn(
  process.execPath,
  [vinext, "start", "--host", proxyHost, "--port", String(upstreamPort)],
  {
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: ".wrangler/wrangler.log",
    },
    stdio: "inherit",
  },
);

const assetTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".woff2", "font/woff2"],
]);

const proxy = createServer(async (incoming, outgoing) => {
  const pathname = new URL(incoming.url ?? "/", `http://${proxyHost}`).pathname;
  const isBuiltStaticAsset = ["/assets/", "/data/", "/icons/", "/images/"].some((prefix) => pathname.startsWith(prefix)) ||
    ["/castingcompass-icon.png", "/manifest.webmanifest", "/og.png", "/sw.js"].includes(pathname);
  if ((incoming.method === "GET" || incoming.method === "HEAD") && isBuiltStaticAsset) {
    const assetPath = path.resolve(clientRoot, `.${decodeURIComponent(pathname)}`);
    if (assetPath.startsWith(`${clientRoot}${path.sep}`)) {
      try {
        const metadata = await stat(assetPath);
        if (metadata.isFile()) {
          outgoing.writeHead(200, {
            "cache-control": "public, max-age=31536000, immutable",
            "content-length": metadata.size,
            "content-type": assetTypes.get(path.extname(assetPath)) ?? "application/octet-stream",
          });
          if (incoming.method === "HEAD") outgoing.end();
          else createReadStream(assetPath).pipe(outgoing);
          return;
        }
      } catch {
        // Fall through to the exact Worker response for missing build assets.
      }
    }
  }

  const forwarded = requestUpstream(
    {
      hostname: proxyHost,
      port: upstreamPort,
      method: incoming.method,
      path: incoming.url,
      headers: {
        ...incoming.headers,
        host: canonicalHost,
        "x-forwarded-host": canonicalHost,
      },
    },
    (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    },
  );

  forwarded.on("error", () => {
    if (!outgoing.headersSent) {
      outgoing.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
    }
    outgoing.end("Safety-floor test server is starting.");
  });
  incoming.pipe(forwarded);
});

let shuttingDown = false;
function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  proxy.close(() => process.exit(exitCode));
  upstream.kill("SIGTERM");
  setTimeout(() => process.exit(exitCode), 5_000).unref();
}

upstream.on("exit", (code, signal) => {
  if (!shuttingDown) {
    console.error(`vinext exited before the test proxy (${signal ?? code ?? "unknown"}).`);
    shutdown(code || 1);
  }
});

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));
proxy.listen(proxyPort, proxyHost);
