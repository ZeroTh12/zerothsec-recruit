# -*- coding: utf-8 -*-
"""
ZEROTHSEC 题库生成器（纯静态 · 无限扩充）
用法：
    python tools/gen_bank.py            # 生成默认规模题库
    python tools/gen_bank.py --scale 2  # 每族变体数翻倍（题库扩充一倍）

输出：
    assets/data/bank.enc.js     —— 多层加密题库（前端 <script> 直接加载）
    tools/bank_plaintext.json   —— 明文答案（教练专用，已被 .gitignore 排除，勿提交）

题目设计原则：每题题面自包含（所有解题信息都在描述里）、答案确定性可算、
flag 格式 flag{answer}。5 方向 × 3 难度（easy→medium→hard 递进），
每族是"模板 + 随机参数"变体生成器，重跑 / 调 --scale 即可无限出新题。
"""
import argparse
import base64
import json
import random
import string
import sys
import urllib.parse
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from zscrypt import emit_js_payload, perm_alphabet  # noqa: E402

SEED = 20261117
WORDS = ["shadow", "phantom", "cipher", "pixel", "kernel", "vector", "packet",
         "nebula", "quartz", "zephyr", "lambda", "orion", "tundra", "vortex",
         "harbor", "matrix", "ember", "glitch", "static", "tensor", "beacon",
         "drifter", "hollow", "spiral", "cobalt", "monolith", "raven", "sable",
         "falcon", "violet", "onyx", "pylon", "glyph", "cascade", "helix",
         "anchor", "bridge", "candle", "dagger", "engine", "frozen", "gather"]

# ---------------- 通用小工具 ----------------

def b64(s: str) -> str:
    return base64.b64encode(s.encode()).decode()

def b64n(s: str, n: int) -> str:
    for _ in range(n):
        s = base64.b64encode(s.encode()).decode()
    return s

def rot(word: str, k: int) -> str:
    return "".join(chr((ord(c) - 97 + k) % 26 + 97) for c in word)

def vig(word: str, key: str) -> str:
    ks = (key * ((len(word) // len(key)) + 1))[:len(word)]
    return "".join(chr((ord(c) - 97 + ord(k) - 97) % 26 + 97) for c, k in zip(word, ks))

def xorb(word: str, k: int) -> bytes:
    return bytes(ord(c) ^ k for c in word)

def flag(ans: str) -> str:
    return "flag{" + ans + "}"

def pick_words(rng, n):
    return rng.sample(WORDS, n)

# ---------------- WEB ----------------

def web_robots(rng, i):
    slug = "-".join(rng.sample(WORDS, 2))
    body = (f"User-agent: *\nDisallow: /{slug}/\n"
            f"Sitemap: /sitemap.xml")
    return dict(
        title=f"robots 的秘密 {i+1}",
        desc=f"你拿到某站点根目录的 robots.txt 内容如下：\n\n{body}\n\n"
             f"站长有一个不想被搜索引擎收录的隐藏目录。flag 是该目录名：flag{{目录名}}。",
        hint="Disallow 的第一层真实目录就是答案，去掉斜杠。",
        ans=slug, diff="easy")

def web_htmlb64(rng, i):
    w = rng.choice(WORDS)
    ct = b64("FLAG:" + w)
    html = (f'<div class="footer">\n  <p>© 2026 Example Corp</p>\n'
            f'  <!-- build:2026110{i%9} note={ct} -->\n</div>')
    return dict(
        title=f"注释里的东西 {i+1}",
        desc=f"查看某页面源码，发现如下片段：\n\n```html\n{html}\n```\n\n"
             f"注释里藏了东西，解码它。flag 是解码后的单词：flag{{单词}}。",
        hint="Base64。解码后取冒号后面的词。",
        ans=w, diff="easy")

def web_headers(rng, i):
    ver = f"2.4.{rng.randint(29, 58)}"
    resp = (f"HTTP/1.1 200 OK\nServer: Apache/{ver}\nX-Powered-By: PHP/7.{rng.randint(0,4)}.{rng.randint(1,9)}\n"
            f"Content-Type: text/html\nSet-Cookie: session=guest")
    return dict(
        title=f"响应头泄露 {i+1}",
        desc=f"一次 HTTP 响应如下：\n\n```\n{resp}\n```\n\n"
             f"flag 是 Server 头原样值：flag{{Apache/版本}}（保留斜杠和点）。",
        hint="Server 头直接暴露了中间件与版本号，这是信息收集的第一课。",
        ans=f"Apache/{ver}", diff="easy")

def web_jsxor(rng, i):
    w = rng.choice(WORDS)
    k = rng.randint(20, 90)
    ct = xorb(w, k).hex()
    js = (f'const s = "{ct}";\n'
          f'const out = [...s.matchAll(/../g)]\n'
          f'  .map(h => String.fromCharCode(parseInt(h[0],16) ^ {k}))\n'
          f'  .join("");')
    return dict(
        title=f"前端混淆 JS {i+1}",
        desc=f"某站点的校验脚本如下（s 是硬编码在 JS 里的密文）：\n\n```js\n{js}\n```\n\n"
             f"执行这段逻辑会得到什么？flag 是输出单词：flag{{单词}}。",
        hint="两两分组按 16 进制解析，逐字节与常量异或。",
        ans=w, diff="medium")

def web_cookieb64(rng, i):
    target = '{"admin":true,"user":"guest"}'
    cookie = b64('{"admin":false,"user":"guest"}')
    return dict(
        title=f"Cookie 越权 {i+1}",
        desc=f"某站点的权限判断存在缺陷：服务端直接反序列化 Cookie 里的 base64 字段。"
             f"你当前的 Cookie：\n\n```\nCookie: auth={cookie}\n```\n\n"
             f"解码后是 {{\"admin\":false,\"user\":\"guest\"}}。"
             f"请构造 admin=true 的替代值（JSON 键序保持 admin 在前、user 在后，紧凑格式无空格）并 Base64 编码。"
             f"flag 是新的 Cookie 值：flag{{base64串}}。",
        hint="只改 false→true，其余字符原样保留，再整串 Base64。",
        ans=b64(target), diff="medium")

def web_jwt(rng, i):
    import base64 as _b
    def b64u(o):
        return _b.urlsafe_b64encode(json.dumps(o, separators=(",", ":")).encode()).decode().rstrip("=")
    header = b64u({"alg": "HS256", "typ": "JWT"})
    payload = b64u({"sub": "guest", "role": "user", "iat": 1700000000})
    sig = "".join(rng.choice("abcdef0123456789") for _ in range(43))
    target = b64u({"sub": "guest", "role": "admin", "iat": 1700000000})
    return dict(
        title=f"JWT 结构 {i+1}",
        desc=f"某站点使用 JWT 做身份令牌，你抓到自己的 token：\n\n"
             f"```\n{header}.{payload}.{sig}\n```\n\n"
             f"题目：把 payload 中 role 从 user 改成 admin（sub、iat 保持不变，键序不变，紧凑 JSON 无空格）后，"
             f"新的 payload 段（Base64URL，去掉填充等号）是什么？flag 是该段：flag{{段}}。",
        hint="JWT 三段式：header.payload.signature。signature 校验是另一回事，本题只考结构。",
        ans=target, diff="hard")

def web_sqlunion(rng, i):
    code = (f'$sql = "SELECT id, user, mail FROM users WHERE name=\'" . $_GET["name"] . "\'";\n'
            f'$r = $db->query($sql);')
    return dict(
        title=f"注入点定位 {i+1}",
        desc=f"审查下面的登录查询代码：\n\n```php\n{code}\n```\n\n"
             f"要枚举全部数据表的列名，最经典的关键词组合是两个单词。"
             f"flag 是这两个单词的小写拼接（去空格）：flag{{单词单词}}。",
        hint="UNION SELECT 是手工注入枚举列的标准起点。",
        ans="unionselect", diff="hard")

WEB_FAMILIES = [
    (web_robots, 10), (web_htmlb64, 10), (web_headers, 5),
    (web_jsxor, 10), (web_cookieb64, 10), (web_jwt, 5), (web_sqlunion, 5),
]

# ---------------- CRYPTO ----------------

def cr_caesar(rng, i):
    w = rng.choice(WORDS)
    s = rng.randint(1, 25)
    ct = rot(w, s)
    return dict(
        title=f"凯撒移位 {i+1}",
        desc=f"密文（全部小写字母）：`{ct}`\n\n加密规则：每个字母沿字母表后移 {s} 位（循环）。"
             f"flag 是明文：flag{{单词}}。",
        hint="既然告诉了位移，直接逆移回来。",
        ans=w, diff="easy")

def cr_b64chain(rng, i):
    w = rng.choice(WORDS)
    n = rng.choice([2, 3])
    ct = b64n(w, n)
    return dict(
        title=f"Base64 × {n} {i+1}",
        desc=f"密文：\n\n```\n{ct}\n```\n\n它被 Base64 编码了 {n} 次。flag 是最初的明文单词：flag{{单词}}。",
        hint="反复解码直到出现可读英文。",
        ans=w, diff="easy")

def cr_hexstr(rng, i):
    w = rng.choice(WORDS)
    hx = w.encode().hex()
    return dict(
        title=f"十六进制还原 {i+1}",
        desc=f"密文（HEX）：`{hx}`\n\n两个十六进制字符是一个 ASCII 字节。flag 是还原的单词：flag{{单词}}。",
        hint="hex decode → ASCII。",
        ans=w, diff="easy")

def cr_vigenere(rng, i):
    w = rng.choice(WORDS)
    key = rng.choice([k for k in WORDS if 3 <= len(k) <= 6])
    ct = vig(w, key)
    return dict(
        title=f"维吉尼亚 {i+1}",
        desc=f"密文：`{ct}`\n密钥：`{key}`\n\n标准维吉尼亚（26 字母循环）。flag 是明文：flag{{单词}}。",
        hint="密钥逐字母循环对齐密文，逐位相减 mod 26。",
        ans=w, diff="medium")

def cr_xorsingle(rng, i):
    w = rng.choice(WORDS)
    while True:
        k = rng.randint(1, 127)
        if all(32 <= (ord(c) ^ k) < 127 for c in w):
            break
    ct = xorb(w, k).hex()
    return dict(
        title=f"单字节 XOR {i+1}",
        desc=f"密文（HEX）：`{ct}`\n\n它是明文单词逐字节与同一个未知字节值异或的结果。"
             f"flag 是明文：flag{{单词}}。",
        hint="只有 128 种可能，逐个试到输出全是可读字母为止。",
        ans=w, diff="medium")

def cr_multilayer(rng, i):
    w = rng.choice(WORDS)
    s = rng.randint(1, 25)
    step1 = rot(w, s)            # 凯撒
    step2 = step1[::-1]          # 逆序
    step3 = b64(step2)           # Base64
    return dict(
        title=f"三重加密链 {i+1}",
        desc=f"最终密文：`{step3}`\n\n加密流程：明文 → 凯撒右移 {s} 位 → 整串逆序 → Base64。"
             f"flag 是明文：flag{{单词}}。",
        hint="从最后一层往前剥：Base64 → 逆序 → 凯撒左移。",
        ans=w, diff="hard")

def cr_minirsa(rng, i):
    p, q = rng.sample([1013, 1019, 1021, 1031, 1033, 1049], 2)
    n = p * q
    e = 65537
    phi = (p - 1) * (q - 1)
    d = pow(e, -1, phi)
    w2 = "".join(rng.choice("abcdefghij") for _ in range(2))
    m = int.from_bytes(w2.encode(), "big")
    c = pow(m, e, n)
    return dict(
        title=f"迷你 RSA {i+1}",
        desc=f"RSA 参数：\n\n```\nn = {n}  (p={p}, q={q})\ne = {e}\nc = {c}\n```\n\n"
             f"c 是两字母明文按大端字节序转整数后加密的结果。flag 是明文：flag{{两个字母}}。",
        hint="d = e⁻¹ mod (p−1)(q−1)，m = c^d mod n，再拆回两字节。",
        ans=w2, diff="hard")

CRYPTO_FAMILIES = [
    (cr_caesar, 12), (cr_b64chain, 12), (cr_hexstr, 6),
    (cr_vigenere, 10), (cr_xorsingle, 10), (cr_multilayer, 7), (cr_minirsa, 5),
]

# ---------------- MISC ----------------

def mi_urlenc(rng, i):
    w = rng.choice(WORDS)
    special = rng.choice(["~!@", "&=", "%^"])
    raw = w + special
    enc = urllib.parse.quote(raw, safe="")
    return dict(
        title=f"URL 编码 {i+1}",
        desc=f"某 GET 请求片段：`?q={enc}`\n\nURL 解码它。"
             f"flag 是解码内容：flag{{解码串}}（保留特殊字符，去掉 q=）。",
        hint="%XX 是 URL 转义的十六进制字节。",
        ans=raw, diff="easy")

def mi_binascii(rng, i):
    w = rng.choice(WORDS)
    bins = " ".join(format(b, "08b") for b in w.encode())
    return dict(
        title=f"二进制报文 {i+1}",
        desc=f"一串二进制：\n\n```\n{bins}\n```\n\n8 位一组，每组是一个 ASCII 字符。flag 是还原单词：flag{{单词}}。",
        hint="逐组 int(x, 2) → chr。",
        ans=w, diff="easy")

def mi_magic(rng, i):
    table = {"PNG": "89 50 4E 47 0D 0A 1A 0A", "GIF": "47 49 46 38 39 61",
             "PDF": "25 50 44 46 2D", "ZIP": "50 4B 03 04", "JPEG": "FF D8 FF"}
    name = rng.choice(list(table))
    return dict(
        title=f"文件签名 {i+1}",
        desc=f"某个无名文件的头部十六进制：\n\n```\n{table[name]}\n```\n\n"
             f"flag 是文件真实格式（小写）：flag{{png}} 这种形式。",
        hint="文件魔数（magic number）不会骗人。",
        ans=name.lower(), diff="easy")

def mi_layered(rng, i):
    w = rng.choice(WORDS)
    step1 = urllib.parse.quote(w, safe="")
    step2 = b64(step1)
    step3 = step2.encode().hex()
    return dict(
        title=f"编码套娃 {i+1}",
        desc=f"密文（HEX）：`{step3}`\n\n解压链路：HEX → Base64 → URL 解码 → 明文。flag 是明文单词：flag{{单词}}。",
        hint="一层一层剥，每层结果先看看是不是下一层的形态。",
        ans=w, diff="medium")

def mi_exifb64(rng, i):
    w = rng.choice(WORDS)
    noise = ["Make: CAM-ZS01", "ISO: 200", "DateTime: 2026:11:01 09:30:00",
             "Model: ZS-Alpha", "LensInfo: 24/1 70/1", "Flash: 16"]
    lines = rng.sample(noise, 4) + [f"UserComment: {b64(w)}"]
    rng.shuffle(lines)
    return dict(
        title=f"元数据藏信 {i+1}",
        desc=f"某图片的元数据片段：\n\n```\n" + "\n".join(lines) + "\n```\n\n"
             f"UserComment 字段不是普通文字。flag 是隐藏的单词：flag{{单词}}。",
        hint="UserComment 的值先试试 Base64。",
        ans=w, diff="medium")

def mi_lsbnum(rng, i):
    w = rng.choice(WORDS)
    px = []
    for c in w:
        v = ord(c)
        bits = [(v >> (7 - j)) & 1 for j in range(8)]
        px += [(b << 7) | rng.randint(0, 127) for b in bits]
    return dict(
        title=f"像素 LSB {i+1}",
        desc=f"一段灰度像素值（每字节最高位是隐藏位，低 7 位是噪声）：\n\n```\n"
             + ", ".join(str(v) for v in px) + "\n```\n\n"
             f"把每个像素的最高位（bit7）按顺序取出，8 位拼成一个 ASCII 字符。flag 是隐藏单词：flag{{单词}}。",
        hint="每个值 ≥128 隐藏位是 1，<128 是 0。",
        ans=w, diff="hard")

MISC_FAMILIES = [
    (mi_urlenc, 10), (mi_binascii, 10), (mi_magic, 10),
    (mi_layered, 10), (mi_exifb64, 10), (mi_lsbnum, 10),
]

# ---------------- REVERSE ----------------

def rv_pyadd(rng, i):
    w = rng.choice(WORDS)
    k = rng.randint(1, 8)
    out = "".join(chr(ord(c) + k) for c in w)
    code = (f"def f(s):\n    return ''.join(chr(ord(c) + {k}) for c in s)\n"
            f"\n# 已知 f(x) == \"{out}\"")
    return dict(
        title=f"Python 位移 {i+1}",
        desc=f"逆向下面这段 Python：\n\n```python\n{code}\n```\n\nflag 是输入 x：flag{{单词}}。",
        hint="对输出每个字符反向减 "+str(k)+" 即可。",
        ans=w, diff="easy")

def rv_jsmix(rng, i):
    w = rng.choice(WORDS)
    k = rng.randint(1, 5)
    mid = w[::-1]
    out = "".join(chr(ord(c) + k) for c in mid)
    js = (f'function g(s) {{\n'
          f'  const r = [...s].reverse().join("");\n'
          f'  return [...r].map(c => String.fromCharCode(c.charCodeAt(0) + {k})).join("");\n'
          f'}}\n// g(x) === "{out}"')
    return dict(
        title=f"JS 逆序位移 {i+1}",
        desc=f"逆向这段 JS：\n\n```js\n{js}\n```\n\nflag 是输入 x：flag{{单词}}。",
        hint="先对每个字符减 "+str(k)+"，再整体 reverse。",
        ans=w, diff="easy")

def rv_chain(rng, i):
    w = rng.choice(WORDS)
    s = rng.randint(1, 25)
    step1 = rot(w, s)
    step2 = step1.replace("a", "@").replace("e", "3")
    return dict(
        title=f"变换链 {i+1}",
        desc=f"某程序对输入做两步变换后输出 `{step2}`：\n\n"
             f"1. 凯撒右移 {s} 位\n2. 把所有字母 a 换成 @、e 换成 3\n\n"
             f"flag 是原始输入：flag{{单词}}。",
        hint="先把 @→a、3→e，再凯撒左移。",
        ans=w, diff="medium")

def rv_lcg(rng, i):
    a, c, m = 48271, 0, 2**31 - 1
    s0 = rng.randint(1, 10**6)
    s1 = (a * s0 + c) % m
    s2 = (a * s1 + c) % m
    return dict(
        title=f"线性同余预测 {i+1}",
        desc=f"一个 LCG 随机数生成器：\n\n```\ns(i+1) = (a·s(i) + c) mod m\na = {a}  c = {c}  m = {m}\n```\n\n"
             f"你观察到了一次输出 s(i) = {s1}。flag 是它的下一次输出 s(i+1)：flag{{数字}}。",
        hint="直接代入公式算下一个状态。",
        ans=str(s2), diff="medium")

def rv_customb64(rng, i):
    w = rng.choice(WORDS)
    perm = perm_alphabet(rng.randint(1, 10**9))
    std = b64(w)
    ct = std.translate(str.maketrans("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", perm))
    return dict(
        title=f"魔改 Base64 {i+1}",
        desc=f"某程序用**打乱过的字母表**做 Base64：\n\n```\n字母表：{perm}\n密文：{ct}\n```\n\n"
             f"flag 是明文单词：flag{{单词}}。",
        hint="不是标准表！先按给定字母表把密文映射回标准表，再正常解码。",
        ans=w, diff="hard")

def rv_vm(rng, i):
    w = rng.choice(WORDS)
    for _attempt in range(50):
        n_ops = rng.randint(2, 3)
        ops = []
        cur = list(w)
        for _ in range(n_ops):
            op = rng.choice(["ADD", "SUB", "XOR", "REV"])
            if op == "REV":
                cur = cur[::-1]
                ops.append("REV")
            else:
                k = rng.randint(1, 9) if op != "XOR" else rng.randint(1, 31)
                if op == "ADD":
                    cur = [chr(ord(c) + k) for c in cur]
                elif op == "SUB":
                    cur = [chr(ord(c) - k) for c in cur]
                else:
                    cur = [chr(ord(c) ^ k) for c in cur]
                ops.append(f"{op} {k}")
        out = "".join(cur)
        if all(33 <= ord(c) <= 126 for c in out):
            break
    prog = "\n".join(f"{j+1}. {o}" for j, o in enumerate(ops))
    return dict(
        title=f"迷你虚拟机 {i+1}",
        desc=f"一个只认四种指令的 VM，按顺序执行：\n\n```\n{prog}\n```\n\n"
             f"指令含义：ADD k 每个字符码 +k；SUB k −k；XOR k 与 k 异或；REV 整串逆序。\n\n"
             f"输入 `{w}`，flag 是最终输出：flag{{输出串}}（可能是不可见字符？不，本题保证可读）。",
        hint="拿输入逐条指令模拟一遍。",
        ans=out, diff="hard")

REVERSE_FAMILIES = [
    (rv_pyadd, 12), (rv_jsmix, 8), (rv_chain, 10),
    (rv_lcg, 10), (rv_customb64, 10), (rv_vm, 10),
]

# ---------------- PWN ----------------

def pw_offset(rng, i):
    size = rng.choice([32, 48, 64, 80, 96, 128])
    return dict(
        title=f"栈溢出偏移 {i+1}",
        desc=f"x86-64（栈 8 字节对齐，函数序言压入 8 字节 RBP）。存在漏洞的函数：\n\n"
             f"```c\nvoid vuln() {{\n    char buf[{size}];\n    gets(buf);\n}}\n```\n\n"
             f"要精确覆盖到保存的返回地址，padding 需要多少字节？flag 是纯数字：flag{{字节数}}。",
        hint="buf 大小 + 保存的 RBP 8 字节。",
        ans=str(size + 8), diff="easy")

def pw_retaddr(rng, i):
    base = 0x7ffd00000000 + rng.randrange(0, 0xFFFFF) * 0x1000
    off = rng.randint(1, 15) * 8
    target = base + off
    return dict(
        title=f"返回地址计算 {i+1}",
        desc=f" gdb 显示 buf 位于栈帧 `0x{base:x}`，返回地址槽位在 buf 起点偏移 `{off}` 字节处。\n\n"
             f"flag 是返回地址槽位的完整十六进制地址：flag{{0x…小写}}。",
        hint="base + offset，十六进制小写带 0x。",
        ans=f"0x{target:x}", diff="medium")

def pw_filter(rng, i):
    # 三个干扰项各含一个被禁字符（; & |），正确项不含任何被禁字符 → 恒有唯一解
    opts = ["cat flag.txt", "cat; flag.txt", "cat& flag.txt", "cat| flag.txt"]
    rng.shuffle(opts)
    valid = "cat flag.txt"
    idx = "ABCD"[opts.index(valid)]
    return dict(
        title=f"命令过滤绕过 {i+1}",
        desc=f"目标执行 `sh -c \"<你的输入>\"`，黑名单禁用字符：`;` `&` `|`（分号、和号、管道）。\n\n"
             f"候选 payload：\n\n```\n"
             + "\n".join(f"{l}. {o}" for l, o in zip("ABCD", opts))
             + "\n```\n\n"
             f"哪个候选不含任何被禁字符（能原样通过黑名单）？flag 是选项字母：flag{{A}} 这种形式。",
        hint="逐个字符比对黑名单。",
        ans=idx, diff="medium")

def pw_fmtstr(rng, i):
    n = rng.randint(6, 18)
    return dict(
        title=f"格式化字符串 {i+1}",
        desc=f"漏洞代码：\n\n```c\nprintf(user_input);   // 无格式串参数\n```\n\n"
             f"x86-64 下 printf 前 5 个变参走寄存器，栈上参数从第 6 个位置开始。"
             f"要 leak 栈上第 {n} 个位置的值，flag 是完整格式串 payload：flag{{%{n}$p}} 这种形式。",
        hint="位置参数语法：%N$p。",
        ans=f"%{n}$p", diff="hard")

def pw_rop(rng, i):
    arg = rng.choice([0x1337, 0xdeadbeef, 0xcafebabe, 0x31337])
    pop_rdi = 0x401200 + rng.randint(1, 9)
    win = 0x401500 + rng.randint(1, 9)
    return dict(
        title=f"ROP 链构造 {i+1}",
        desc=f"可用 gadget：`pop rdi; ret` 位于 `0x{pop_rdi:x}`，目标函数 `win()` 位于 `0x{win:x}`。\n\n"
             f"要让 win 收到参数 `0x{arg:x}`，ROP 链按 8 字节依次是：[gadget, 参数, win]。"
             f"flag 是链中**第二个** 8 字节的完整十六进制：flag{{0x…小写}}。",
        hint="pop rdi 先弹出的就是参数。",
        ans=f"0x{arg:x}", diff="hard")

PWN_FAMILIES = [
    (pw_offset, 12), (pw_retaddr, 10), (pw_filter, 8),
    (pw_fmtstr, 10), (pw_rop, 10),
]

# ---------------- 组装 ----------------

DIRS = [
    ("web", "WEB", WEB_FAMILIES),
    ("crypto", "CRYPTO", CRYPTO_FAMILIES),
    ("misc", "MISC", MISC_FAMILIES),
    ("reverse", "REV", REVERSE_FAMILIES),
    ("pwn", "PWN", PWN_FAMILIES),
]

DIFF_SCORE = {"easy": 20, "medium": 50, "hard": 100}

def build_bank(scale: int) -> dict:
    rng = random.Random(SEED)
    challenges = []
    for key, prefix, families in DIRS:
        picked = []
        for fn, count in families:
            for i in range(count * scale):
                picked.append(fn(rng, i))
        # 同难度内随机排序，难度整体递进 easy→medium→hard
        by_diff = {"easy": [], "medium": [], "hard": []}
        for ch in picked:
            by_diff[ch["diff"]].append(ch)
        ordered = by_diff["easy"] + by_diff["medium"] + by_diff["hard"]
        for idx, ch in enumerate(ordered, 1):
            cid = f"{prefix}-{idx:02d}"
            challenges.append({
                "id": cid,
                "dir": key,
                "diff": ch["diff"],
                "score": DIFF_SCORE[ch["diff"]],
                "title": ch["title"],
                "desc": ch["desc"],
                "hint": ch["hint"],
                "flag": flag(ch["ans"]),
            })
    return {"v": 3, "generated": "gen_bank.py", "count": len(challenges),
            "challenges": challenges}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scale", type=int, default=1, help="每族变体倍数")
    args = ap.parse_args()

    bank = build_bank(args.scale)
    plain = json.dumps(bank, ensure_ascii=False)

    # 明文答案（教练专用，gitignore）
    here = Path(__file__).parent
    (here / "bank_plaintext.json").write_text(plain, encoding="utf-8")

    # 加密题库 → 前端脚本
    root = here.parent
    js = emit_js_payload(plain, "ZS-BANK-K1-2026", 20261117, "__ZS_BANK__", chunks=3)
    (root / "assets" / "data" / "bank.enc.js").write_text(js, encoding="utf-8")

    from collections import Counter
    stat = Counter((c["dir"], c["diff"]) for c in bank["challenges"])
    print(f"题库生成完成：{bank['count']} 题")
    for d in ["web", "crypto", "misc", "reverse", "pwn"]:
        line = "  %-8s" % d
        for diff in ["easy", "medium", "hard"]:
            line += f"  {diff}={stat[(d, diff)]}"
        print(line)
    print("加密题库 → assets/data/bank.enc.js")
    print("明文答案 → tools/bank_plaintext.json（勿提交仓库）")

if __name__ == "__main__":
    main()
