const fs = require("fs");
const b = require("./decode");
const bignum = require("bignum");

const crypto = require("crypto");
module.exports.open = (filepath) => {
  return bencode.decode(fs.readFileSync(filepath));
};

module.exports.size = (torrent) => {
  const size = torrent.info.files
    ? torrent.info.files.map((file) => file.length).reduce((a, b) => a + b)
    : torrent.info.length;

  return bignum.toBuffer(size, { size: 8 });
};

module.exports.infoHash = (torrent) => {
  const info = b.bencode(torrent.info);
  return crypto.createHash("sha1").update(info).digest();
};
