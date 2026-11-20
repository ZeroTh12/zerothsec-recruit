# 黄雪婷-CRYPTO-15.md

<!--ZSWP
id: CRYPTO-15
name: 黄雪婷
github: rostiute0903-alt
direction: websec
title: 篱笆墙的影子
-->

## flag

（把你从 CTF² 平台拿到的 flag 原样粘贴在这里）
flag{wethinkwehavetheflag}

## 解题思路 / 步骤

（怎么发现切入点 → 每一步做了什么 → 拿到 flag。截图可另附发群，文字必须自述过程。）
用python输入以下代码
ct = "felhaagv{ewtehtehfilnakgw}"
n = 13                                  # 栏数

L = len(ct)
rows = L // n                           # 每列完整的行数
rem = L % n                             # 前 rem 列会多 1 个字符
lens = [rows + 1 if c < rem else rows for c in range(n)]
print(lens)                             # [2, 2, 2, ..., 2]

# ① 按列把密文切开
cols = []
pos = 0
for c in range(n):
    cols.append(ct[pos:pos + lens[c]])
    pos += lens[c]

# ② 按行读出
out = ""
for r in range(max(lens)):
    for c in range(n):
        if r < lens[c]:
            out += cols[c][r]

print(out)


## 复盘

（卡在哪里、学到了什么、下次怎么更快。）

