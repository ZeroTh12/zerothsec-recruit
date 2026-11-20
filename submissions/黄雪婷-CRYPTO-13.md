# 黄雪婷-CRYPTO-13.md

<!--ZSWP
id: CRYPTO-13
name: 黄雪婷
github: rostiute0903-alt
direction: websec
title: 传感器
-->

## flag

（把你从 CTF² 平台拿到的 flag 原样粘贴在这里）
flag{FFFFFED31F645055F9}

## 解题思路 / 步骤

（怎么发现切入点 → 每一步做了什么 → 拿到 flag。截图可另附发群，文字必须自述过程。）
5555555595555A65556AA696AA6666666955
每个半字节只可能是 5 6 9 A 这四个字符，把它们展开成二进制后，正好能按每两位一组全部切成 01 或 10。某个比特用一对互补电平表示，这正是 Manchester 编码的典型特征；而 5555… 就是前导码。

hex 字符串
  → ① 每个字符展开成 4 位二进制
  → ② 两位一组，01→1、10→0
  → ③ 每 8 位一组，组内倒序，转成字节
  → ④ 打印 hex

在python中运行
raw = "5555555595555A65556AA696AA6666666955"

# ① hex -> 二进制
bits = ""
for c in raw:
    bits += format(int(c, 16), "04b")

# ② 两位一组：01 -> 1，10 -> 0
man = ""
for i in range(0, len(bits), 2):
    pair = bits[i:i+2]
    assert pair in ("01", "10"), f"第 {i} 位配对异常: {pair}"
    man += "1" if pair == "01" else "0"

# ③ 8 位一组，组内倒序，转字节
out = bytearray()
for i in range(0, len(man), 8):
    out.append(int(man[i:i+8][::-1], 2))

# ④ 输出并校验
flag = out.hex().upper()
print(flag)

assert "FED31F" in flag          # 用已知 ID 验证解码方向对不对
print("FFFF", "FED31F", flag[10:12], flag[12:16], flag[16:])

## 复盘

（卡在哪里、学到了什么、下次怎么更快。）
学到了Manchester（曼彻斯特）编码的解法