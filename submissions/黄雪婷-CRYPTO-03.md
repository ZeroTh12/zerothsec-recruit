# 黄雪婷-CRYPTO-03.md

<!--ZSWP
id: CRYPTO-03
name: 黄雪婷
github: rostiute0903-alt
direction: websec
title: 变异凯撒
-->

## flag

（把你从 CTF² 平台拿到的 flag 原样粘贴在这里）
flag{Caesar_variation}

## 解题思路 / 步骤

（怎么发现切入点 → 每一步做了什么 → 拿到 flag。截图可另附发群，文字必须自述过程。）
位置	密文	字符码	偏移	结果
0	a	97	+5	f (102)
1	f	102	+6	l (108)
2	Z	90	+7	a (97)
3	_	95	+8	g (103)
4	r	114	+9	{ (123)
5	9	57	+10	C (67)

## 复盘

（卡在哪里、学到了什么、下次怎么更快。）
