const torrentParser = require("./src/torrentParser");
const download = require("./src/download");
const torrent = torrentParser.open("neo-geo-pocket-manuals_archive.torrent");

// const torrent = torrentParser.open(process.argv[2]);

download(torrent, torrent.info.name);

// tracker.getpeers(torrent, (peers) => {
//   console.log(peers);
// });
