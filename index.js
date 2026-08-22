const torrentParser = require("./src/torrentParser");
const download = require("./src/download");

const torrentPath = process.argv[2];
if (!torrentPath) {
  console.error("Usage: node index.js <path-to-torrent-file>");
  process.exit(1);
}

const torrent = torrentParser.open(torrentPath);

download(torrent, torrent.info.name.toString("utf8"));
