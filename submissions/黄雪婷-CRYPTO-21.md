# 黄雪婷-CRYPTO-21.md

<!--ZSWP
id: CRYPTO-21
name: 黄雪婷
github: rostiute0903-alt
direction: websec
title: Alice与Bob
-->

## flag

（把你从 CTF² 平台拿到的 flag 原样粘贴在这里）flag{d450209323a847c8d01c6be47c81811a}

## 解题思路 / 步骤

（怎么发现切入点 → 每一步做了什么 → 拿到 flag。截图可另附发群，文字必须自述过程。）
解题步骤：
分解：98554799767 ＝ 101999 × 966233
小素数：101999
大素数：966233
拼接：小在前 → 101999966233
MD5（32 位小写）：d450209323a847c8d01c6be47c81811a
最终 flag：
flag{d450209323a847c8d01c6be47c81811a}

## 复盘

（卡在哪里、学到了什么、下次怎么更快。）
