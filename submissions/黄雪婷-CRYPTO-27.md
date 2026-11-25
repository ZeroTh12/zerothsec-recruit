# 黄雪婷-CRYPTO-27.md

<!--ZSWP
id: CRYPTO-27
name: 黄雪婷
github: rostiute0903-alt
direction: websec
title: 世上无难事
-->

## flag

（把你从 CTF² 平台拿到的 flag 原样粘贴在这里）flag{640e11012805f211b0ab24ff02a1ed09}


## 解题思路 / 步骤

（怎么发现切入点 → 每一步做了什么 → 拿到 flag。截图可另附发群，文字必须自述过程。）
它是一道单表替换密码
判断密码类型

- 密文全部是大写字母，空格位置保留，词长和重复词模式清晰；
- 凯撒 25 种位移、Atbash、仿射穷举都不通 → 排除简单移位，判定为字母乱序单表替换。
密文	明文	依据
XAW	and	出现 5 次，最高频三字母词
XZZ	all	X 开头双写尾字母
X	a	单独成词
IFIUOJBWO	everybody	9 字母，1=3、5=9 模式
FKUHKAKX	virginia	8 字母，2=5=7
VIUI / VKHV / VXFI	here / high / have	互相印证
A→n  B→o  C→u  D→w  E→c  F→v  G→m  H→g
I→e  J→b  K→i  L→p  M→f  N→t  O→y  P→k
Q→s  S→j  U→r  V→h  W→d  X→a  Z→l
解出正文（奥巴马在 Wakefield 高中演讲的开场）：

 Hello everybody. Thank you, everybody. All right, everybody, go ahead and have a seat. How is everybody doing today? How about Tim Spicer? We are here with students at Wakefield High School in Arlington, Virginia. And we've got students tuning in from all across America, from kindergarten through 12th grade. And we are just so glad that all could join us today. And we want to thank Wakefield for being such an outstanding host. Give yourselves a big round of applause. And the key is …
 处理末尾那串字符

原文最后一行：

640I11012805M211J0XJ24MM02X1IW09

它也按同一套对照表替换（I→e、M→f、J→b、X→a、W→d）：

最后得到的答案是
640e11012805f211b0ab24ff02a1ed09

## 复盘

（卡在哪里、学到了什么、下次怎么更快。）
