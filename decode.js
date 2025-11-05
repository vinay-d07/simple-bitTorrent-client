module.exports.bdecode = (buf) => {
  // Expect a Buffer (binary-safe bencode parser)
  let i = 0;

  function parse() {
    const c = buf[i];
    if (c === 0x69) {
      // 'i' integer
      i++;
      let neg = false;
      if (buf[i] === 0x2d) {
        // '-'
        neg = true;
        i++;
      }
      let num = 0;
      while (buf[i] !== 0x65) {
        // 'e'
        num = num * 10 + (buf[i] - 48);
        i++;
      }
      i++; // skip 'e'
      return neg ? -num : num;
    }

    if (c === 0x6c) {
      // 'l'
      i++;
      const arr = [];
      while (buf[i] !== 0x65) arr.push(parse());
      i++; // skip 'e'
      return arr;
    }

    if (c === 0x64) {
      // 'd'
      i++;
      const obj = {};
      while (buf[i] !== 0x65) {
        const keyBuf = parse(); // keys are byte-strings
        const key = Buffer.isBuffer(keyBuf)
          ? keyBuf.toString("utf8")
          : String(keyBuf);
        obj[key] = parse();
      }
      i++; // skip 'e'
      return obj;
    }

    // byte string: <len>:<data>
    let len = 0;
    while (buf[i] !== 0x3a) {
      // ':'
      len = len * 10 + (buf[i] - 48);
      i++;
    }
    i++; // skip ':'
    const start = i;
    const end = start + len;
    const val = buf.slice(start, end); // return Buffer for binary safety
    i = end;
    return val;
  }

  return parse();
};

module.exports.bencode = (data) => {
  let result = "";
  function encode(value) {
    if (typeof value === "number") {
      result += "i" + value + "e";
    } else if (Buffer.isBuffer(value)) {
      result += value.length + ":" + value.toString("binary");
    } else if (typeof value === "string") {
      const buf = Buffer.from(value, "utf8");
      result += buf.length + ":" + buf.toString("binary");
    } else if (Array.isArray(value)) {
      result += "l";
      value.forEach((item) => encode(item));
      result += "e";
    } else if (typeof value === "object" && value !== null) {
      result += "d";
      const keys = Object.keys(value).sort();
      keys.forEach((key) => {
        encode(key);
        encode(value[key]);
      });
      result += "e";
    }
  }
  encode(data);
  return Buffer.from(result, "binary");
};
