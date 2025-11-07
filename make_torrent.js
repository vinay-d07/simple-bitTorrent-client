// make_torrent.js
// Creates a .torrent file for testfile.txt using the project's bencode encoder (decode.bencode)
import fs from 'fs';
import crypto from 'crypto';
import bmod from './decode.js';

function sha1(buf) {
  return crypto.createHash('sha1').update(buf).digest();
}

async function make() {
  const fname = 'testfile.txt';
  const data = fs.readFileSync(fname);
  const pieceLength = 16384; // 16 KB

  // For a small file this will be single piece
  const pieces = [];
  for (let offset = 0; offset < data.length; offset += pieceLength) {
    const piece = data.slice(offset, offset + pieceLength);
    pieces.push(sha1(piece));
  }

  const info = {
    'name': fname,
    'piece length': pieceLength,
    'length': data.length,
    'pieces': Buffer.concat(pieces)
  };

  const torrent = {
    'announce': 'udp://tracker.coppersurfer.tk:6969/announce',
    'info': info
  };

  // use project's bencode encoder
  const encoded = bmod.bencode(torrent);
  fs.writeFileSync('testfile.torrent', encoded);
  console.log('Created testfile.torrent (announce: udp://tracker.coppersurfer.tk:6969/announce)');
}

make().catch(err => { console.error(err); process.exit(1); });
