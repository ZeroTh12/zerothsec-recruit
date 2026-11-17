# -*- coding: utf-8 -*-
"""
CTF² 平台（ctf2.dasctf.com，BUUCTF 练习场）真题导入器。
把平台上的真实赛题拉下来，替换自造题库，重新加密为 assets/data/bank.enc.js。

用法（三选一提供登录态 token）：
  1) 把 token 存到 tools/.ctf2_token 文件（推荐，已在 .gitignore 排除）
  2) 环境变量 CTF2_TOKEN=eyJhbGci...
  3) 命令行 --token eyJhbGci...

获取 token：浏览器登录 ctf2.dasctf.com → F12 Console → copy(localStorage.getItem('token'))

示例：
  python tools/import_ctf2.py --dry-run                 # 只看 API 结构
  python tools/import_ctf2.py --per-diff 20             # 每类别每难度取前 20（按解题人数降序）
  python tools/import_ctf2.py --practice <uuid>         # 换练习场（默认 BUUCTF）

平台题目 flag 无法离线获取（在学生提交框校验），因此导入的题
flag 字段为空 → 站内不做 flag 校验，题目卡显示「去 CTF² 做题」外链，
学生解题后按 <姓名>-<题号>.md 提交 Writeup，由教练审核。
"""
import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from zscrypt import emit_js_payload  # noqa: E402

BASE = "https://ctf2.dasctf.com"
BUUCTF_PRACTICE = "b9bbb32f-f186-458f-b90b-12440c0f6aea"

# 平台类别（大写）→ 站内题库类别
CAT_MAP = {"WEB": "web", "CRYPTO": "crypto", "MISC": "misc",
           "REVERSE": "reverse", "PWN": "pwn"}
PREFIX = {"web": "WEB", "crypto": "CRYPTO", "misc": "MISC",
          "reverse": "REVERSE", "pwn": "PWN"}
# 平台难度（Easy/Medium/Hard）→ 站内难度
DIFF_MAP = {"Easy": "easy", "Medium": "medium", "Hard": "hard"}
SCORE = {"easy": 20, "medium": 30, "hard": 40}


def get_token(args):
    if args.token:
        return args.token.strip()
    env = os.environ.get("CTF2_TOKEN")
    if env:
        return env.strip()
    f = Path(__file__).parent / ".ctf2_token"
    if f.exists():
        return f.read_text(encoding="utf-8").strip()
    sys.exit("缺少 token：用 --token、环境变量 CTF2_TOKEN，或写入 tools/.ctf2_token 文件")


def api_get(path, token, params=None):
    url = BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + token,
        "Accept": "application/json",
        "User-Agent": "zerothsec-importer",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def pick_list(data):
    """防御式提取列表：兼容 {data:[...]} / {data:{results:[...]}} 等形态。"""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("results", "items", "challenges", "list", "data"):
            v = data.get(key)
            if isinstance(v, list):
                return v
            if isinstance(v, dict):
                inner = pick_list(v)
                if inner:
                    return inner
    return []


def field(obj, *names, default=""):
    for n in names:
        if n in obj and obj[n] not in (None, ""):
            return obj[n]
    return default


def fetch_all(token, practice, category, difficulty, per_diff, dry):
    out, page = [], 1
    while len(out) < per_diff:
        params = {
            "category": category,
            "difficulty": difficulty,
            "sort_by": "solve_count",
            "sort_order": "desc",
            "page": page,
            "page_size": min(50, per_diff - len(out) + 10),
        }
        data = api_get(f"/api/v1/practice/{practice}/challenges/", token, params)
        if dry and page == 1:
            print("== 原始响应样例（截断）==")
            print(json.dumps(data, ensure_ascii=False)[:1200])
            print("=" * 40)
        rows = pick_list(data)
        if not rows:
            break
        for c in rows:
            out.append(c)
            if len(out) >= per_diff:
                break
        pag = data.get("data", {})
        total = pag.get("pagination", {}).get("total") if isinstance(pag, dict) else None
        if total is not None and len(out) >= int(total):
            break
        page += 1
        if page > 40:
            break
    return out


def build_bank(token, practice, per_diff, dry):
    challenges = []
    counters = {cat: 0 for cat in CAT_MAP.values()}  # 每类别跨难度连续编号
    for plat_cat, cat in CAT_MAP.items():
        for plat_diff, diff in (("Easy", "easy"), ("Medium", "medium"), ("Hard", "hard")):
            rows = fetch_all(token, practice, plat_cat, plat_diff, per_diff, dry)
            if dry:
                print(f"[dry] {plat_cat}/{plat_diff}: 拿到 {len(rows)} 题，样例字段：",
                      list(rows[0].keys())[:12] if rows else "无")
                continue
            rows.sort(key=lambda c: int(field(c, "solve_count", default=0) or 0),
                      reverse=True)
            for c in rows:
                counters[cat] += 1
                i = counters[cat]
                cid = field(c, "id", "uuid")
                title = str(field(c, "name", "title", default="未命名题"))
                solves = field(c, "solve_count", default="")
                plat_desc = str(field(c, "description", default="")).strip()
                files = c.get("files") or []
                desc = ("**CTF² 平台 BUUCTF 真题**（非自造题）\n\n"
                        "原题：" + title +
                        ("\n已解人数：" + str(solves) if solves != "" else "") +
                        ("\n平台题面：" + plat_desc if plat_desc else "") +
                        ("\n附件：%d 个（在平台题目页下载）" % len(files) if files else "") +
                        "\n\n在 CTF² 平台打开本题、拿到 flag 后，按规范命名提交 Writeup"
                        "（文件名 `<姓名>-" + PREFIX[cat] + "-" + str(i).zfill(2) + ".md`），"
                        "内容写清 flag、解题步骤与复盘。")
                challenges.append({
                    "id": "%s-%02d" % (PREFIX[cat], i),
                    "dir": cat,
                    "diff": diff,
                    "score": SCORE[diff],
                    "title": title,
                    "desc": desc,
                    "hint": "点「去平台做题」在 CTF² 打开原题；flag 在平台提交验证，Writeup 交本站教练。",
                    "flag": "",  # 平台题无法离线校验 flag
                    "link": "%s/dashboard/practice/%s/challenges/%s" % (BASE, practice, cid),
                    "source": "ctf2.dasctf.com/BUUCTF",
                })
    return {"count": len(challenges), "challenges": challenges}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--token")
    ap.add_argument("--practice", default=BUUCTF_PRACTICE)
    ap.add_argument("--per-diff", type=int, default=20, help="每类别每难度题数上限")
    ap.add_argument("--dry-run", action="store_true", help="只探测 API 结构，不写文件")
    args = ap.parse_args()

    token = get_token(args)
    bank = build_bank(token, args.practice, args.per_diff, args.dry_run)
    if args.dry_run:
        return

    here = Path(__file__).parent
    root = here.parent
    plain = json.dumps(bank, ensure_ascii=False)
    (here / "bank_plaintext.json").write_text(plain, encoding="utf-8")
    js = emit_js_payload(plain, "ZS-BANK-K1-2026", 20261117, "__ZS_BANK__", chunks=3)
    (root / "assets" / "data" / "bank.enc.js").write_text(js, encoding="utf-8")

    from collections import Counter
    stat = Counter((c["dir"], c["diff"]) for c in bank["challenges"])
    print(f"导入完成：{bank['count']} 题（来源 CTF² BUUCTF 练习场真题）")
    for d in ["web", "crypto", "misc", "reverse", "pwn"]:
        print("  %-8s easy=%d medium=%d hard=%d" % (d, stat[(d, "easy")], stat[(d, "medium")], stat[(d, "hard")]))
    print("→ assets/data/bank.enc.js（前端运行时解密）")
    print("→ tools/bank_plaintext.json（教练留档，勿提交）")
    print("注意：平台真题无法离线校验 flag，站内提交以 Writeup 审核为准。")


if __name__ == "__main__":
    main()
