# 黄雪婷-CRYPTO-01.md

<!--ZSWP
id: CRYPTO-01
name: 黄雪婷
github: rostiute0903-alt
direction: websec
title: 看我回旋踢
-->

## flag

（把你从 CTF² 平台拿到的 flag 原样粘贴在这里）flag{5cd1004d-86a5-46d8-b720-beb5ba0417e1}

## 解题思路 / 步骤

（怎么发现切入点 → 每一步做了什么 → 拿到 flag。截图可另附发群，文字必须自述过程。）
def rot13(s):
    res = []
    for c in s:
        if c.islower():
            res.append(chr((ord(c)-ord('a')+13)%26 + ord('a')))
        else:
            res.append(c)
    return ''.join(res)

cipher = "synt{5pq1004q-86n5-46q8-o720-oro5on0417r1}"
print(rot13(cipher))
运用Python脚本


## 复盘

（卡在哪里、学到了什么、下次怎么更快。）
