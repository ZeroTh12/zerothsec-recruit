# 黄雪婷-CRYPTO-16.md

<!--ZSWP
id: CRYPTO-16
name: 黄雪婷
github: rostiute0903-alt
direction: websec
title: Windows系统密码
-->

## flag

（把你从 CTF² 平台拿到的 flag 原样粘贴在这里）

## 解题思路 / 步骤

（怎么发现切入点 → 每一步做了什么 → 拿到 flag。截图可另附发群，文字必须自述过程。）
flag{good-luck}
### 解题过程

1. 识别格式：`用户名:RID:LM-HASH:NTLM-HASH:::`
2. 目标账号：`ctf`，NTLM Hash：`a7fcb22a88038f35a8f39d503e7f0062`
3. 使用 hashcat/john 对 NTLM hash 字典爆破

```
hashcat -m 1000 hash.txt rockyou.txt
```

## 复盘

（卡在哪里、学到了什么、下次怎么更快。）
