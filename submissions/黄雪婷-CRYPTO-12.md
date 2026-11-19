# 黄雪婷-CRYPTO-12.md

<!--ZSWP
id: CRYPTO-12
name: 黄雪婷
github: rostiute0903-alt
direction: websec
title: 大帝的密码武器
-->

## flag

（把你从 CTF² 平台拿到的 flag 原样粘贴在这里）flag{PbzrPuvan}

## 解题思路 / 步骤

（怎么发现切入点 → 每一步做了什么 → 拿到 flag。截图可另附发群，文字必须自述过程。）
线索提取：题目提到“罗马三巨头”和“以他的名字命名”，指向凯撒大帝。该密码即凯撒密码（一种通过将字母表按固定位数平移来替换字母的加密方式）。

附件处理：下载的附件 zip 压缩包解压后，得到两个内容：密文 FRPHEVGL 和待加密的明文 ComeChina。

解题逻辑：

通过暴力枚举，找出 FRPHEVGL 的解密偏移量。

使用相同的偏移量，对 ComeChina 进行加密，得到最终的 Flag。
用python写
def caesar_cipher(text, shift):
    result = ''
    for char in text:
        if char.isalpha():
            base = ord('A') if char.isupper() else ord('a')
            # 加密就是向左移，解密就是向右移
            result += chr((ord(char) - base + shift) % 26 + base)
        else:
            result += char
    return result

# 第1步：解密 FRPHEVGL，找到偏移量
print("--- 枚举 FRPHEVGL 的解密结果 ---")
for i in range(26):
    # 解密是反向移动，所以是 -i
    plaintext = caesar_cipher('FRPHEVGL', -i)
    if plaintext.lower() == 'security':
        print(f"偏移量 {i}: {plaintext} <- 发现了有意义的单词！")

# 第2步：用偏移量 13 加密 ComeChina
print("\n--- 加密 ComeChina ---")
flag = caesar_cipher('ComeChina', 13)
print(f"加密结果: {flag}")
## 复盘

（卡在哪里、学到了什么、下次怎么更快。）
