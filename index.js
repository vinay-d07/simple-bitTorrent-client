const b = require("./decode");
const fs = require("fs");
const dgram = require("dgram");
const torrentBuf = fs.readFileSync("puppy.torrent");
const decoded = b.bdecode(torrentBuf);
const Buffer = require("buffer").Buffer;
const trackerURL = URL.parse(decoded.announce.toString("utf8"));
const torrentParser = require("./torrent-parser");
const util = require("./utils");
const tracker = require("./tracker");
// const socket = dgram.createSocket("udp4");
// const msg = Buffer.from("hello", "utf8");
const torrent = torrentParser.open("puppy.torrent");

tracker.getpeers(torrent, (peers) => {
  console.log(peers);
});

// socket.send(
//   msg,
//   0,
//   msg.length,
//   trackerURL.port,
//   trackerURL.hostname,
//   (err, bytes) => {}
// );
// socket.on("message", (msg, rinfo) => {
//   console.log(`tracker response: ${msg.toString("hex")}`);
// });
// console.log(tracker);
