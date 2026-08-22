const dgram = require("dgram");
const http = require("http");
const https = require("https");
const tp = require("./torrentParser");
const b = require("../decode");
const Buffer = require("buffer").Buffer;
const urlParse = require("url").parse;
const util = require("../utils");
const crypto = require("crypto");

module.exports.getpeers = (torrent, callback) => {
  const url = torrent.announce.toString("utf8");
  if (url.startsWith("udp://")) {
    getPeersUdp(torrent, url, callback);
  } else if (url.startsWith("http://") || url.startsWith("https://")) {
    getPeersHttp(torrent, url, callback);
  } else {
    console.log("Unsupported tracker protocol:", url);
  }
};

function getPeersUdp(torrent, url, callback) {
  const socket = dgram.createSocket("udp4");

  udpsend(socket, buildConnectReq(), url);

  socket.on("message", (msg) => {
    if (respType(msg) === "connect") {
        const connResp = parseConnectResp(msg);
        // connResp.connectionId is an 8-byte Buffer; pass it to buildAnnounceReq
        const announceReq = buildAnnounceReq(connResp.connectionId, torrent);
        udpsend(socket, announceReq, url);
      } else if (respType(msg) === "announce") {
      const announceResp = parseAnnounceResp(msg);
      callback(announceResp.peers);
    }
  });
}

// Percent-encode raw bytes per the HTTP tracker convention (RFC 3986
// unreserved chars stay literal, everything else becomes %XX) — info_hash
// and peer_id are raw 20-byte binary, not UTF-8 text, so encodeURIComponent
// can't be used directly on them.
function percentEncodeBytes(buf) {
  let out = "";
  for (const byte of buf) {
    const isUnreserved =
      (byte >= 0x41 && byte <= 0x5a) || // A-Z
      (byte >= 0x61 && byte <= 0x7a) || // a-z
      (byte >= 0x30 && byte <= 0x39) || // 0-9
      byte === 0x2d || byte === 0x2e || byte === 0x5f || byte === 0x7e; // - . _ ~
    out += isUnreserved
      ? String.fromCharCode(byte)
      : "%" + byte.toString(16).padStart(2, "0").toUpperCase();
  }
  return out;
}

function getPeersHttp(torrent, url, callback) {
  const mod = url.startsWith("https://") ? https : http;
  const infoHash = tp.infoHash(torrent);
  const peerId = util.genId();
  const left = torrent.info.files
    ? torrent.info.files.reduce((a, f) => a + f.length, 0)
    : torrent.info.length;

  const qs =
    `info_hash=${percentEncodeBytes(infoHash)}` +
    `&peer_id=${percentEncodeBytes(peerId)}` +
    `&port=6881&uploaded=0&downloaded=0&left=${left}&compact=1&event=started`;
  const fullUrl = url + (url.includes("?") ? "&" : "?") + qs;

  mod
    .get(fullUrl, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          const decoded = b.bdecode(Buffer.concat(chunks));
          if (decoded["failure reason"]) {
            console.log("Tracker failure:", decoded["failure reason"].toString());
            return;
          }
          callback(parseHttpPeers(decoded.peers));
        } catch (e) {
          console.log("Failed to parse HTTP tracker response:", e.message);
        }
      });
    })
    .on("error", (e) => console.log("HTTP tracker request error:", e.message));
}

function parseHttpPeers(peersField) {
  if (Buffer.isBuffer(peersField)) {
    // compact format: 6 bytes per peer (4 IP + 2 port), same as UDP trackers
    const peers = [];
    for (let i = 0; i + 6 <= peersField.length; i += 6) {
      peers.push({
        ip: peersField.slice(i, i + 4).join("."),
        port: peersField.readUInt16BE(i + 4),
      });
    }
    return peers;
  }
  if (Array.isArray(peersField)) {
    // non-compact dictionary model
    return peersField.map((p) => ({
      ip: p.ip.toString("utf8"),
      port: p.port,
    }));
  }
  return [];
}

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
  buff.writeUInt32BE(0x27101980, 4); // protocol part 2 [00 00 04 17  27 10 19 80  00 00 00 00  00 00 00 00]
  buff.writeUInt32BE(0, 8);
  return buff;
}

function parseConnectResp(resp) {
  return {
    action: resp.readUInt32BE(0),
    transactionId: resp.readUInt32BE(4),
    connectionId: resp.slice(8),
  };
}
function buildAnnounceReq(connId, torrent, port = 6881) {
  const buff = Buffer.alloc(98);
  // connId should be an 8-byte Buffer (connection id returned by connect response)
  connId.copy(buff, 0); // connection id 8 bytes
  buff.writeUInt32BE(1, 8); // action 4 bytes
  crypto.randomBytes(4).copy(buff, 12); // transaction id 4 bytes
  // use the torrent parser helper imported as `tp`
  tp.infoHash(torrent).copy(buff, 16); // info hash 20 bytes
  util.genId().copy(buff, 36); // peer id 20 bytes
  Buffer.alloc(8).copy(buff, 56); // downloaded 8 bytes
  tp.size(torrent).copy(buff, 64); // left 8 bytes
  Buffer.alloc(8).copy(buff, 72); // uploaded 8 bytes
  buff.writeUInt32BE(0, 80); // event 4 bytes
  buff.writeUInt32BE(0, 84); // IP address 4 bytes
  crypto.randomBytes(4).copy(buff, 88);
  // write an unsigned 32-bit key; -1 is out of range for writeUInt32BE
  // use 0xFFFFFFFF as the unsigned equivalent of -1
  buff.writeUInt32BE(0xffffffff, 92); // key 4 bytes
  // port is 2 bytes at offset 96
  buff.writeUInt16BE(port, 96); // port 2 bytes

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
    interval: resp.readUInt32BE(8),
    leechers: resp.readUInt32BE(12),
    seeders: resp.readUInt32BE(16),
    peers: (function() {
      const peerBufs = group(resp.slice(20), 6).filter(b => b.length >= 6);
      return peerBufs.map((peerBuf) => ({
        ip: peerBuf.slice(0, 4).join('.'),
        port: peerBuf.readUInt16BE(4),
      }));
    })(),
  };
}

function respType(resp) {
  const action = resp.readUInt32BE(0);
  if (action === 0) return "connect";
  if (action === 1) return "announce";
}
