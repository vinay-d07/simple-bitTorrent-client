const net = require("net");
const Buffer = require("buffer").Buffer;
const message = require("./message");
const tracker = require("./tracker");
const Pieces = require("./Pieces");
const Queue = require("./Oueue");
const tp = require("./torrentParser");
const fs = require("fs");
module.exports = (torrent, path) => {
  tracker.getpeers(torrent, (peers) => {
    if (!peers || peers.length === 0) {
      console.log("No peers found — not creating file yet");
      return;
    }

    const pieces = new Pieces(torrent);
    const file = fs.openSync(path, "w");

    // progress logger: poll file size and estimate ETA
    const totalBytes = torrent.info.files
      ? torrent.info.files.map((f) => f.length).reduce((a, b) => a + b, 0)
      : torrent.info.length;
    let lastBytes = 0;
    let lastTime = Date.now();
    const prog = setInterval(() => {
      try {
        const stat = fs.statSync(path);
        const downloaded = stat.size;
        const now = Date.now();
        const dt = (now - lastTime) / 1000 || 1;
        const dBytes = downloaded - lastBytes;
        const rate = dBytes / dt; // bytes/sec
        const remaining = Math.max(0, totalBytes - downloaded);
        const eta = rate > 0 ? Math.round(remaining / rate) : Infinity;
        console.log(`progress: ${downloaded}/${totalBytes} bytes — ${Math.round(rate) || 0} B/s — ETA: ${isFinite(eta) ? eta + 's' : 'unknown'}`);
        lastBytes = downloaded;
        lastTime = now;
        if (downloaded >= totalBytes) {
          clearInterval(prog);
        }
      } catch (e) {
        // ignore
      }
    }, 2000);

    console.log("Downloading to", path);
    peers.forEach((peer) => download(peer, torrent, pieces, file));
  });
};

function download(peer, torrent, pieces) {
  const socket = new net.Socket();
  socket.on("error", console.log);
  socket.connect(peer.port, peer.ip, () => {
    socket.write(message.buildHandshake(torrent));
  });
  const queue = new Queue(torrent);
  onWholeMsg(socket, (msg) => msgHandler(msg, socket, pieces, queue));
}

function onWholeMsg(socket, callback) {
  let savedBuf = Buffer.alloc(0);
  let handshake = true;

  socket.on("data", (recvBuf) => {
    const msgLen = () =>
      handshake ? savedBuf.readUInt8(0) + 49 : savedBuf.readInt32BE(0) + 4;
    savedBuf = Buffer.concat([savedBuf, recvBuf]);

    while (savedBuf.length >= 4 && savedBuf.length >= msgLen()) {
      callback(savedBuf.slice(0, msgLen()));
      savedBuf = savedBuf.slice(msgLen());
      handshake = false;
    }
  });
}

function msgHandler(msg, socket, pieces, queue) {
  if (isHandshake(msg)) {
    socket.write(message.buildInterested());
  } else {
    const m = message.parse(msg);

    if (m.id === 0) chokeHandler(socket);
    if (m.id === 1) unchokeHandler(socket, pieces, queue);
    if (m.id === 4) haveHandler(m.payload, socket, requested);
    if (m.id === 5) bitfieldHandler(m.payload);
    if (m.id === 7) pieceHandler(m.payload);
  }
}
function isHandshake(msg) {
  return (
    msg.length === msg.readUInt8(0) + 49 &&
    msg.toString("utf8", 1) === "BitTorrent protocol"
  );
}
function haveHandler(socket, pieces, queue, payload) {
  const pieceIndex = payload.readUInt32BE(0);
  const queueEmpty = queue.length === 0;
  queue.queue(pieceIndex);
  if (queueEmpty) requestPiece(socket, pieces, queue);
}

function chokeHandler(socket) {
  socket.end();
}

function unchokeHandler(socket, pieces, queue) {
  queue.choked = false;
  // 2
  requestPiece(socket, pieces, queue);
}

function bitfieldHandler(socket, pieces, queue, payload) {
  const queueEmpty = queue.length === 0;
  payload.forEach((byte, i) => {
    for (let j = 0; j < 8; j++) {
      if (byte % 2) queue.queue(i * 8 + 7 - j);
      byte = Math.floor(byte / 2);
    }
  });
  if (queueEmpty) requestPiece(socket, pieces, queue);
}
function requestPiece(socket, pieces, queue) {
  //2
  if (queue.choked) return null;

  while (queue.queue.length) {
    const pieceIndex = queue.shift();
    if (pieces.needed(pieceIndex)) {
      // need to fix this
      socket.write(message.buildRequest(pieceIndex));
      pieces.addRequested(pieceIndex);
      break;
    }
  }
}

function pieceHandler(socket, pieces, queue, torrent, file, pieceResp) {
  console.log(pieceResp);
  pieces.addReceived(pieceResp);

  const offset =
    pieceResp.index * torrent.info["piece length"] + pieceResp.begin;
  fs.write(file, pieceResp.block, 0, pieceResp.block.length, offset, () => {});

  if (pieces.isDone()) {
    console.log("DONE!");
    socket.end();
    try {
      fs.closeSync(file);
    } catch (e) {}
  } else {
    requestPiece(socket, pieces, queue);
  }
}
