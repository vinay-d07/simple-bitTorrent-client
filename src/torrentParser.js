const fs = require("fs");
const b = require("../decode");

// Small BigInt-based helpers to avoid native `bignum` dependency.
// Works with non-negative integers and produces/consumes big-endian buffers.
function toBigEndianBuffer(num, size = 8) {
  let n = BigInt(num);
  const buf = Buffer.alloc(size);
  for (let i = size - 1; i >= 0; i--) {
    buf[i] = Number(n & 0xffn);
    n >>= 8n;
  }
  return buf;
}

function bigEndianBufferToBigInt(buf) {
  let n = 0n;
  for (let i = 0; i < buf.length; i++) {
    n = (n << 8n) + BigInt(buf[i]);
  }
  return n;
}

module.exports.BLOCK_LEN = Math.pow(2, 14);
const crypto = require("crypto");

module.exports.open = (filepath) => {
  return b.bdecode(fs.readFileSync(filepath));
};

module.exports.size = (torrent) => {
  const size = torrent.info.files
    ? torrent.info.files.map((file) => BigInt(file.length)).reduce((a, b) => a + b, 0n)
    : BigInt(torrent.info.length);

  return toBigEndianBuffer(size, 8);
};

module.exports.infoHash = (torrent) => {
  const info = b.bencode(torrent.info);
  return crypto.createHash("sha1").update(info).digest();
};

module.exports.pieceLen = (torrent, pieceIndex) => {
  const totalLength = bigEndianBufferToBigInt(this.size(torrent));
  const pieceLength = BigInt(torrent.info['piece length']);

  const lastPieceLength = Number(totalLength % pieceLength);
  const lastPieceIndex = Number(totalLength / pieceLength);

  return lastPieceIndex === pieceIndex ? lastPieceLength : Number(pieceLength);
};

module.exports.blocksPerPiece = (torrent, pieceIndex) => {
  const pieceLength = this.pieceLen(torrent, pieceIndex);
  return Math.ceil(pieceLength / this.BLOCK_LEN);
};

module.exports.blockLen = (torrent, pieceIndex, blockIndex) => {
  const pieceLength = this.pieceLen(torrent, pieceIndex);

  const lastPieceLength = pieceLength % this.BLOCK_LEN;
  const lastPieceIndex = Math.floor(pieceLength / this.BLOCK_LEN);

  return blockIndex === lastPieceIndex ? lastPieceLength : this.BLOCK_LEN;
};