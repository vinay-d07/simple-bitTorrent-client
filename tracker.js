const dgram = require("dgram");
const Buffer = require("buffer").Buffer;
const urlParse = require("url").parse;
const torrentBuf = fs.readFileSync("puppy.torrent");
const decoded = b.bdecode(torrentBuf);
const util = require("./utils");
// const torrentParser = require("./torrent-parser");
const crypto = require("crypto");
module.exports.getpeers = (torrent, callback) => {
  const socket = dgram.createSocket("udp4");
  const url = torrent.announce.toString("utf8");

  udpsend(socket, buildConnectReq(), url);

  socket.on("message", (msg) => {
    if (respType(msg) === "connect") {
      const connResp = parseConnectResp(msg);
      const announceReq = buildAnnounceReq(connResp.transactionId, torrent);
      udpsend(socket, announceReq, url);
    } else if (respType(msg) === "announce") {
      const announceResp = parseAnnounceResp(msg);
      callback(announceResp.peers);
    }
  });
};

function udpsend(socket, msg, rawUrl, callback = () => {}) {
  const trackerURL = urlParse(rawUrl);
  socket.send(
    msg,
    0,
    msg.length,
    trackerURL.port,
    trackerURL.hostname,
    callback
  );
}

function buildConnectReq() {
  const buff = Buffer.alloc(16); // 16 bytes [000000000000000000000000000000]
  buff.writeUInt32BE(0x417, 0); // actionid // protocol part 1 [00 00 04 17  00 00 00 00  00 00 00 00  00 00 00 00]
  buf.writeUInt32BE(0x27101980, 4); // protocol part 2 [00 00 04 17  27 10 19 80  00 00 00 00  00 00 00 00]
  buff.writeUInt32BE(0, 8);
  return buff;
}

function parseConnResp(resp) {
  return {
    action: resp.readUInt32BE(0),
    transactionId: resp.readUInt32BE(4),
    connectionId: resp.slice(8),
  };
}
function announceReq(connId, torrent, port = 6881) {
  const buff = Buffer.alloc(98);
  connId.copy(buff, 0); // connection id 8 bytes
  buff.writeUInt32BE(1, 8); // action 4 bytes
  crypto.randomBytes(4).copy(buff, 12); // transaction id 4 bytes
  torrentParser.infohash(torrent).copy(buff, 16); // info hash 20 bytes
  util.genId().copy(buff, 36); // peer id 20 bytes
  Buffer.alloc(8).copy(buff, 56); // downloaded 8 bytes
  torrentParser.size(torrent).copy(buff, 64); // left 8 bytes
  Buffer.alloc(8).copy(buff, 72); // uploaded 8 bytes
  buff.writeUInt32BE(0, 80); // event 4 bytes
  buff.writeUInt32BE(0, 84); // IP address 4 bytes
  crypto.randomBytes(4).copy(buff, 88);
  buff.writeUInt32BE(-1, 92); // key 4 bytes
  buff.writeUInt32BE(port, 96); // num want 4 bytes

  return buff;
}

function parseAnnounceResp(resp) {
  function group(it, size) {
    const groups = [];
    for (let i = 0; i < it.length; i += size) {
      groups.push(it.slice(i, i + size));
    }
    return groups;
  }

  return {
    action: resp.readUInt32BE(0),
    transactionId: resp.readUInt32BE(4),
    leechers: resp.readUInt32BE(8),
    seeders: resp.readUInt32BE(12),
    peers: group(resp.slice(16), 6).map((peerBuf) => {
      return {
        ip: peerBuf.slice(0, 4).join("."),
        port: peerBuf.readUInt16BE(4),
      };
    }),
  };
}

function respType(resp) {
  const action = resp.readUInt32BE(0);
  if (action === 0) return "connect";
  if (action === 1) return "announce";
}
