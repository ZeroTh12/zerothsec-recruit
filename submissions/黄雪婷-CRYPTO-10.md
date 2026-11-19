# 黄雪婷-CRYPTO-10.md

<!--ZSWP
id: CRYPTO-10
name: 黄雪婷
github: rostiute0903-alt
direction: websec
title: 丢失的MD5
-->

## flag

（把你从 CTF² 平台拿到的 flag 原样粘贴在这里）
flag{e9032994dabac08080091151380478a2}

## 解题思路 / 步骤

（怎么发现切入点 → 每一步做了什么 → 拿到 flag。截图可另附发群，文字必须自述过程。）
原始代码分析：

存在明显的语法错误（for 循环尾部缺少冒号 :）。

存在类型错误（Python 3 中 hashlib.md5().update() 需要传入 bytes 类型，而代码里直接传了字符串）。

逻辑分析：原字符串结构为 TASC + chr(i) + O3RJMV + chr(j) + WDJKX + chr(k) + ZM。未知字符由三层 for 循环遍历 ASCII 码 32-127（可打印字符）产生，大约包含 85 万种组合。

修复动作：

补全 for 语句的 :。
在 m.update() 中，将所有的字符串（包括 chr(i) 等）使用 .encode('utf-8') 转换为字节流。
利用条件 if 'e9032' in des and 'da' in des and '911513' in des: 作为筛选条件，找到匹配的哈希值。

修复为
import hashlib

for i in range(32, 127):
    for j in range(32, 127):
        for k in range(32, 127):
            m = hashlib.md5()
            # 关键修正：对每个字符串进行 encode('utf-8') 编码
            m.update('TASC'.encode('utf-8') + chr(i).encode('utf-8') + 'O3RJMV'.encode('utf-8') + chr(j).encode('utf-8') + 'WDJKX'.encode('utf-8') + chr(k).encode('utf-8') + 'ZM'.encode('utf-8'))
            des = m.hexdigest()
            if 'e9032' in des and 'da' in des and '911513' in des:
                print(des)


## 复盘

（卡在哪里、学到了什么、下次怎么更快。）
