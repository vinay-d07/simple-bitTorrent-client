# simple-bitTorrent-client

This is a small BitTorrent client written from scratch in Node.js, mostly as a learning project. It reads a `.torrent` file, talks to a tracker to find peers, connects to those peers directly, and pulls the file down piece by piece using the real BitTorrent wire protocol.

## How this was built

I followed Allen Kim's write up, "How To Make Your Own BitTorrent Client", as the main reference for this:
https://allenkim67.github.io/programming/2016/05/04/how-to-make-your-own-bittorrent-client.html

That post walks through the whole flow: decoding the bencoded `.torrent` file, hashing the info dictionary to get the info hash, talking to a UDP tracker to get a peer list, doing the peer handshake, and then requesting and receiving pieces over TCP. I used it as a guide for the shape of the code (the split between torrent parsing, tracker communication, message building, and the piece/queue bookkeeping) and then filled in the actual implementation myself, including a hand rolled bencode encoder and decoder instead of pulling in a library for it.

A couple of things go beyond what the original post covers. The tracker module supports HTTP trackers as well as UDP ones, since plenty of real torrents (archive.org items in particular) only offer an HTTP announce URL. There is also a small progress logger that prints download speed and an ETA while a download is running.

## What it can do

Given a `.torrent` file with a working tracker, it will find peers, connect to as many as it can, and download the content to a file named after the torrent. It handles both single file and multi file torrents, though multi file torrents currently get written out as one combined file rather than split back into their original file names.

## What it does not do yet

It does not verify piece hashes against the ones listed in the torrent, so a corrupted or malicious peer could in theory hand back bad data undetected. It also does not seed or upload to other peers, it only downloads. And there is no support for magnet links, only `.torrent` files.

## Running it

```
node index.js path/to/file.torrent
```

The downloaded file shows up in the same folder, named after whatever the torrent's info dictionary calls it.
