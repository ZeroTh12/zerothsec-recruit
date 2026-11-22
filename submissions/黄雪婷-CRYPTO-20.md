# 黄雪婷-CRYPTO-20.md

<!--ZSWP
id: CRYPTO-20
name: 黄雪婷
github: rostiute0903-alt
direction: websec
title: RSA2
-->

## flag

（把你从 CTF² 平台拿到的 flag 原样粘贴在这里）
flag{wow_leaking_dp_breaks_rsa?_98924743502}

## 解题思路 / 步骤

（怎么发现切入点 → 每一步做了什么 → 拿到 flag。截图可另附发群，文字必须自述过程。）
步骤 1：解析参数并统计规模
d = _kv(_text('rsa2', '题目.txt'))
e, n, dp, c = d['e'], d['n'], d['dp'], d['c']
print('e =', e, '| n bits =', n.bit_length(), '| dp bits =', dp.bit_length())
真实输出：

===== RSA2 =====
e = 65537 | n bits = 1025 | dp bits = 509
步骤 2：枚举 k 命中素因子
for k in range(1, e):
    if (e * dp - 1) % k:
        continue
    p_cand = (e * dp - 1) // k + 1
    if n % p_cand == 0 and p_cand != n:
        P = p_cand
        print('k = %d  -> p = %d' % (k, P))
        break
Q = n // P
print('q = n//p =', Q, '| p*q == n ?', P * Q == n)
真实输出：

k = 4404  -> p = 13468634736343473907717969603434376212206335187555458742257940406618189481177835992217885676243155145465521141546915941147336786447889325606555333350540003
q = n//p = 18432009829596386103558375461387837845170621179295293289126504231317130550979989727125205467379713835047300158256398009229511746203459540859429194971855371 | p*q == n ? True
k = 4404 远小于 e = 65537，与"k < e"的推导一致；p * q == n 为 True，分解正确。

步骤 3：恢复私钥并解密
d_priv = pow(e, -1, (P - 1) * (Q - 1))
m = pow(c, d_priv, n)
print(m.to_bytes((m.bit_length() + 7) // 8, 'big').decode('latin-1'))
真实输出：

plain: flag{wow_leaking_dp_breaks_rsa?_98924743502}
最终验证
自校验脚本（scripts/crypto-batch-a/verify_all.py rsa2）真实输出：

=== rsa2 ===
  dp 泄露: 枚举 k 使 (e*dp-1)%k==0 命中 p=13468634736343473907717969603434376212206335187555458742257940406618189481177835992217885676243155145465521141546915941147336786447889325606555333350540003
  明文: flag{wow_leaking_dp_breaks_rsa?_98924743502}
  自校验: PASS   期望 flag = flag{wow_leaking_dp_breaks_rsa?_98924743502}

## 复盘

（卡在哪里、学到了什么、下次怎么更快。）
