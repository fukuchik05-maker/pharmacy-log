"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");

var ROOT = path.resolve(__dirname, "..");
var PORT = parseInt(process.env.PORT, 10) || 8430;

var TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

http.createServer(function (req, res) {
  var urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";

  var filePath = path.join(ROOT, urlPath);
  if (filePath.indexOf(ROOT) !== 0) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }

  fs.readFile(filePath, function (err, body) {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("not found: " + urlPath);
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(filePath)] || "application/octet-stream" });
    res.end(body);
  });
}).listen(PORT, function () {
  console.log("dev server on http://localhost:" + PORT);
});
