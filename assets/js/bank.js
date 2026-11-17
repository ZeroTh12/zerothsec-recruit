/* ==========================================================================
   ZEROTHSEC 加密数据加载器（assets/js/bank.js）
   与 tools/zscrypt.py 的四层管线互逆：
     密文(置换Base64) → 还原字母表 → atob → SHA256异或流(keyA) → inflate(deflate) → JSON
   数据源：
     window.__ZS_BANK__  —— 题库（assets/data/bank.enc.js，<script> 静态加载）
     leaderboard.enc.js  —— 排行榜（Actions 生成，fetch 动态加载防缓存）
   ========================================================================== */
(function () {
  "use strict";

  var STD64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  function bytesOf(str) {
    var out = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
    return out;
  }

  /* SHA-256 纯 JS 实现 —— crypto.subtle 仅在 HTTPS/localhost 可用，
     本地 LAN 测试或非安全上下文下必须走同步回退。 */
  function sha256Sync(bytes) {
    var K = new Uint32Array([
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ]);
    var H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    var len = bytes.length;
    var bitLen = len * 8;
    var k = (56 - (len + 1) % 64 + 64) % 64; // 补零字节数，使消息区停在 56 mod 64
    var total = len + 1 + k + 8;             // 末尾 8 字节为 64 位大端比特长度
    var buf = new Uint8Array(total);
    buf.set(bytes, 0);
    buf[len] = 0x80;
    var view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    view.setUint32(total - 8, Math.floor(bitLen / 4294967296), false);
    view.setUint32(total - 4, bitLen >>> 0, false);
    var W = new Uint32Array(64);
    for (var off = 0; off < total; off += 64) {
      for (var i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4, false);
      for (var i = 16; i < 64; i++) {
        var s0 = (rotr(W[i-15],7) ^ rotr(W[i-15],18) ^ (W[i-15]>>>3)) | 0;
        var s1 = (rotr(W[i-2],17) ^ rotr(W[i-2],19) ^ (W[i-2]>>>10)) | 0;
        W[i] = (W[i-16] + s0 + W[i-7] + s1) | 0;
      }
      var a=H[0], b=H[1], c=H[2], d=H[3], e=H[4], f=H[5], g=H[6], h=H[7];
      for (var i = 0; i < 64; i++) {
        var S1 = (rotr(e,6) ^ rotr(e,11) ^ rotr(e,25)) | 0;
        var ch = ((e & f) ^ (~e & g)) | 0;
        var t1 = (h + S1 + ch + K[i] + W[i]) | 0;
        var S0 = (rotr(a,2) ^ rotr(a,13) ^ rotr(a,22)) | 0;
        var mj = ((a & b) ^ (a & c) ^ (b & c)) | 0;
        var t2 = (S0 + mj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0]=(H[0]+a)|0; H[1]=(H[1]+b)|0; H[2]=(H[2]+c)|0; H[3]=(H[3]+d)|0;
      H[4]=(H[4]+e)|0; H[5]=(H[5]+f)|0; H[6]=(H[6]+g)|0; H[7]=(H[7]+h)|0;
    }
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    var out = new Uint8Array(32);
    for (var i = 0; i < 8; i++) {
      out[i*4]   = (H[i]>>>24)&0xff;
      out[i*4+1] = (H[i]>>>16)&0xff;
      out[i*4+2] = (H[i]>>>8)&0xff;
      out[i*4+3] = H[i]&0xff;
    }
    return out;
  }

  async function sha256(bytes) {
    if (typeof crypto !== "undefined" && crypto && crypto.subtle && crypto.subtle.digest) {
      try {
        var buf = await crypto.subtle.digest("SHA-256", bytes);
        return new Uint8Array(buf);
      } catch (e) { /* 回退到纯 JS 实现 */ }
    }
    return sha256Sync(bytes);
  }

  async function keystream(keyA, n) {
    var enc = new TextEncoder().encode(keyA);
    var out = new Uint8Array(n);
    var filled = 0, i = 0;
    while (filled < n) {
      var block = await sha256(concat(enc, new TextEncoder().encode("|" + i)));
      var take = Math.min(block.length, n - filled);
      out.set(block.subarray(0, take), filled);
      filled += take;
      i++;
    }
    return out;
  }

  function concat(a, b) {
    var out = new Uint8Array(a.length + b.length);
    out.set(a, 0); out.set(b, a.length);
    return out;
  }

  function b64ToBytes(std) {
    var bin = atob(std);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
    return out;
  }

  async function inflate(bytes) {
    var ds = new DecompressionStream("deflate");
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    var text = await new Response(stream).text();
    return text;
  }

  /** 解密任一 payload（{keyA, perm, parts:[反转块]}）→ 明文字符串 */
  async function decryptPayload(p) {
    // 1) 分块还原 + 拼接
    var cipher = p.parts.map(function (s) { return s.split("").reverse().join(""); }).join("");
    // 2) 置换字母表 → 标准 Base64
    var inv = {};
    for (var i = 0; i < p.perm.length; i++) inv[p.perm[i]] = STD64[i];
    var std = "";
    for (var j = 0; j < cipher.length; j++) std += inv[cipher[j]] || cipher[j];
    // 3) Base64 → 字节 → XOR 流
    var data = b64ToBytes(std);
    var ks = await keystream(p.keyA, data.length);
    for (var k = 0; k < data.length; k++) data[k] ^= ks[k];
    // 4) inflate + JSON
    var text = await inflate(data);
    return JSON.parse(text);
  }

  /** payload 字典 → 解密结果 */
  async function fromPayload(p) {
    if (typeof p === "string") p = JSON.parse(p);
    return decryptPayload(p);
  }

  var bankCache = null;

  /** 解密题库（依赖页面已加载 assets/data/bank.enc.js） */
  async function loadBank() {
    if (bankCache) return bankCache;
    if (!window.__ZS_BANK__) throw new Error("题库未加载（bank.enc.js 缺失）");
    bankCache = await fromPayload(window.__ZS_BANK__);
    return bankCache;
  }

  /** 拉取并解密排行榜（Actions 生成的 leaderboard.enc.js；无文件时返回 null） */
  async function loadLeaderboard(repoBranch) {
    try {
      var bust = Date.now();
      var resp = await fetch("assets/data/leaderboard.enc.js?ts=" + bust, { cache: "no-store" });
      if (!resp.ok) return null;
      var text = await resp.text();
      var m = text.match(/window\.__ZS_LB__=(\{.*\});?\s*$/s);
      if (!m) return null;
      var data = await fromPayload(JSON.parse(m[1]));
      return data;
    } catch (e) {
      console.warn("[zs] leaderboard 解密失败", e);
      return null;
    }
  }

  window.ZSBank = {
    loadBank: loadBank,
    loadLeaderboard: loadLeaderboard,
    fromPayload: fromPayload,
    decryptPayload: decryptPayload,
  };
})();
