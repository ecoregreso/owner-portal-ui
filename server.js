const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const INDEX_PATH = path.join(ROOT_DIR, "index.html");

const BASIC_USER = process.env.BASIC_AUTH_USER || "";
const BASIC_PASS = process.env.BASIC_AUTH_PASS || "";
const REQUIRE_AUTH = BASIC_USER && BASIC_PASS;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function unauthorized(res) {
  res.statusCode = 401;
  res.setHeader("WWW-Authenticate", 'Basic realm="Owner Portal"');
  res.end("Unauthorized");
}

function isAuthorized(req) {
  if (!REQUIRE_AUTH) return true;
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString();
  const sep = decoded.indexOf(":");
  if (sep === -1) return false;
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);
  return user === BASIC_USER && pass === BASIC_PASS;
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  res.setHeader("Content-Type", contentType);
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  if (REQUIRE_AUTH && !isAuthorized(req)) {
    return unauthorized(res);
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === "/") pathname = "/index.html";

  const safePath = path.normalize(path.join(ROOT_DIR, pathname));
  if (!safePath.startsWith(ROOT_DIR)) {
    res.statusCode = 400;
    res.end("Bad request");
    return;
  }

  fs.stat(safePath, (err, stat) => {
    if (!err && stat.isFile()) {
      return serveFile(res, safePath);
    }

    const ext = path.extname(safePath);
    if (ext) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    fs.stat(INDEX_PATH, (indexErr) => {
      if (indexErr) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }
      return serveFile(res, INDEX_PATH);
    });
  });
});

server.listen(PORT, () => {
  if (REQUIRE_AUTH) {
    console.log(`[owner-portal] Basic auth enabled on port ${PORT}`);
  } else {
    console.warn("[owner-portal] Basic auth disabled (set BASIC_AUTH_USER/BASIC_AUTH_PASS)");
  }
});
