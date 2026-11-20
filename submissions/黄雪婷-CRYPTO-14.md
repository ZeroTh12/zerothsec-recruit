# 黄雪婷-CRYPTO-14.md

<!--ZSWP
id: CRYPTO-14
name: 黄雪婷
github: rostiute0903-alt
direction: websec
title: Unencode
-->

## flag

（把你从 CTF² 平台拿到的 flag 原样粘贴在这里）
flag{dsdasdsa99877LLLKK}

## 解题思路 / 步骤

（怎么发现切入点 → 每一步做了什么 → 拿到 flag。截图可另附发群，文字必须自述过程。）
字符全在 0x20 ~ 0x5F 之间（空格到 _）。这是 uuencode 的字符集：6 bit 的值（0~63）加上 32 后，正好落在这一段可打印字符里。
第一个字符是长度标记。uuencode 每行开头有一个字符表示这一行有多少字节。'8' 的 ASCII 是 0x38 = 56，56 - 32 = 24，即“本行 24 字节”。
剩下的字符数刚好对得上。剩下 32 个字符，每 4 个字符编码 3 字节：32 / 4 × 3 = 24，和长度标记一致。
三个特征全对上，基本就可以确定是 uuencode 了。

原理：3 字节 ↔ 4 个字符
在python运行
s = "89FQA9WMD<V1A<V1S83DY.#<W3$Q,2TM]"

length = ord(s[0]) - 32        # 行长度：'8' -> 56-32 = 24
body = s[1:]                   # 去掉长度字符

out = bytearray()
for i in range(0, len(body), 4):        # 4 个字符一组
    c1, c2, c3, c4 = body[i:i+4]
    v1 = ord(c1) - 32                   # 每个字符还原成 0~63
    v2 = ord(c2) - 32
    v3 = ord(c3) - 32
    v4 = ord(c4) - 32

    out.append((v1 << 2) | (v2 >> 4))            # 6+2 = 8 位
    out.append(((v2 & 0x0F) << 4) | (v3 >> 2))   # 4+4 = 8 位
    out.append(((v3 & 0x03) << 6) | v4)          # 2+6 = 8 位

print(len(out), "==", length)      # 24 == 24，长度自检
print(out.decode())

## 复盘

（卡在哪里、学到了什么、下次怎么更快。）
学到了uuencode
