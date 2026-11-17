# -*- coding: utf-8 -*-
"""
ZEROTHSEC 多层加密工具（Python 端：生成题库 / Actions 端：聚合排行榜）
四层管线：UTF-8 → zlib 压缩 → SHA256 异或流(keyA) → Base64+置换字母表(seedB)
前端解密逻辑见 assets/js/bank.js（WebCrypto SHA-256 + DecompressionStream）。

注意：这是"多层混淆加密"——密钥嵌在前端 JS 里，能防止直接读出明文，
不能防御逆向 JS 的有心人。纯静态架构的物理极限，如实告知。
"""
import base64
import hashlib
import json
import random
import zlib

STD64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"


def keystream(key: str, n: int) -> bytes:
    """keystream = sha256(key|0) || sha256(key|1) || ..."""
    out = b""
    i = 0
    while len(out) < n:
        out += hashlib.sha256(key.encode("utf-8") + b"|" + str(i).encode()).digest()
        i += 1
    return out[:n]


def xor_bytes(data: bytes, key: str) -> bytes:
    ks = keystream(key, len(data))
    return bytes(a ^ b for a, b in zip(data, ks))


def perm_alphabet(seed) -> str:
    lst = list(STD64)
    random.Random(seed).shuffle(lst)
    return "".join(lst)


def encrypt_text(plain: str, key_a: str, seed_b) -> str:
    """明文 → 四层加密后的置换 Base64 密文。"""
    raw = zlib.compress(plain.encode("utf-8"), 9)
    x = xor_bytes(raw, key_a)
    b = base64.b64encode(x).decode("ascii")
    perm = perm_alphabet(seed_b)
    table = str.maketrans(STD64, perm)
    return b.translate(table)


def decrypt_text(cipher: str, key_a: str, seed_b) -> str:
    """逆管线（供 Actions 端聚合脚本读回题库/排行榜）。"""
    perm = perm_alphabet(seed_b)
    table = str.maketrans(perm, STD64)
    b = cipher.translate(table)
    x = base64.b64decode(b)
    raw = xor_bytes(x, key_a)
    return zlib.decompress(raw).decode("utf-8")


def emit_js_payload(plain: str, key_a: str, seed_b, var: str, chunks: int = 3) -> str:
    """加密并把密文分块反转，输出可 <script> 加载的 JS 赋值语句。"""
    cipher = encrypt_text(plain, key_a, seed_b)
    size = (len(cipher) + chunks - 1) // chunks
    parts = [cipher[i * size:(i + 1) * size][::-1] for i in range(chunks)]
    parts_js = json.dumps(parts)
    perm = perm_alphabet(seed_b)
    payload = json.dumps({"keyA": key_a, "perm": perm, "parts": parts,
                          "gen": __import__("datetime").date.today().isoformat()},
                         ensure_ascii=True)
    return 'window.%s=%s;' % (var, payload)


def load_payload(payload: dict) -> str:
    """Actions 端读回：payload = {keyA, perm, parts:[反转块]}。"""
    cipher = "".join(p[::-1] for p in payload["parts"])
    # perm 已在 payload 里，直接逆映射
    table = str.maketrans(payload["perm"], STD64)
    b = cipher.translate(table)
    x = base64.b64decode(b)
    raw = xor_bytes(x, payload["keyA"])
    return zlib.decompress(raw).decode("utf-8")


def extract_payload_from_js(js_text: str, var: str) -> dict:
    """从 .enc.js 文本中提取 payload 字典（供 aggregate.py 用）。"""
    import re
    m = re.search(r"window\.%s=(\{.*\});?\s*$" % re.escape(var), js_text, re.S)
    if not m:
        raise ValueError("payload not found for var " + var)
    return json.loads(m.group(1))


if __name__ == "__main__":
    # 自检：加解密回环
    demo = json.dumps({"hello": "世界", "flag": "flag{test}"}, ensure_ascii=False)
    ka, sb = "demo-key", 42
    assert decrypt_text(encrypt_text(demo, ka, sb), ka, sb) == demo
    p = extract_payload_from_js(emit_js_payload(demo, ka, sb, "__T__"), "__T__")
    assert load_payload(p) == demo
    print("zscrypt self-test OK")
