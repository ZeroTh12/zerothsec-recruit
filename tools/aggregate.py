# -*- coding: utf-8 -*-
"""
GitHub Actions 聚合脚本：Issues（writeup 标签）→ 加密 leaderboard.enc.js
触发时机：writeup Issue 被提交 / 编辑 / 打标签 / 取消标签 / 关闭重开。

计分规则（与前端展示一致）：
  - accepted 标签 = 通过；分值取 score/N 标签（缺省用题库默认分值）
  - rejected 标签 = 打回（不计分，评论内容作为打回理由展示给队员）
  - pending = 带 writeup 标签但既没 accepted 也没 rejected
教练权限天然由 GitHub 保证：打标签需要仓库写权限。
"""
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from zscrypt import emit_js_payload, extract_payload_from_js, load_payload  # noqa: E402

ROOT = Path(__file__).parent.parent
LB_VAR = "__ZS_LB__"
LB_KEY = "ZS-LB-K2-2026"
LB_SEED = 17171117


def api(path, token):
    req = urllib.request.Request(
        "https://api.github.com" + path,
        headers={
            "Authorization": "Bearer " + token,
            "Accept": "application/vnd.github+json",
            "User-Agent": "zs-leaderboard",
        })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def fetch_issues(token, repo):
    issues, page = [], 1
    while True:
        data = api(f"/repos/{repo}/issues?labels=writeup&state=all&per_page=100&page={page}", token)
        if not data:
            break
        issues += data
        if len(data) < 100:
            break
        page += 1
    return issues


def parse_meta(body):
    meta = {"id": "", "name": "", "github": "", "direction": ""}
    m = re.search(r"<!--ZSWP([\s\S]*?)-->", body or "")
    if m:
        for k in meta:
            mm = re.search(r"^\s*%s\s*:\s*(.+)$" % k, m.group(1), re.M)
            if mm:
                meta[k] = mm.group(1).strip()
    return meta


def label_names(issue):
    return [l["name"] for l in issue.get("labels", [])]


def load_bank_scores():
    """解密题库拿每题默认分值（aggregate 也要看加密后的库）。"""
    js = (ROOT / "assets" / "data" / "bank.enc.js").read_text(encoding="utf-8")
    payload = extract_payload_from_js(js, "__ZS_BANK__")
    bank = json.loads(load_payload(payload))
    return {c["id"]: c for c in bank.get("challenges", [])}


def main():
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    repo = os.environ.get("GITHUB_REPOSITORY") or ""
    if not repo:
        # 本地调试：从 wp-config.js 读 repo
        cfg = (ROOT / "assets" / "js" / "wp-config.js").read_text(encoding="utf-8")
        m = re.search(r'repo\s*:\s*"([^"]+)"', cfg)
        repo = m.group(1) if m else ""
    if not token:
        print("no token, abort")
        return

    issues = fetch_issues(token, repo)
    chmap = load_bank_scores()
    members = {}

    def row(meta):
        gh = (meta.get("github") or "unknown").lstrip("@")
        if gh.lower() not in members:
            members[gh.lower()] = {
                "github": gh,
                "name": meta.get("name") or gh,
                "direction": meta.get("direction") or (meta["id"].split("-")[0].lower() if meta.get("id") else ""),
                "accepted": [], "rejected": [], "pending": [], "total": 0,
            }
        return members[gh.lower()]

    for iss in issues:
        if iss.get("pull_request"):
            continue
        meta = parse_meta(iss.get("body") or "")
        if not meta["id"]:
            tm = re.match(r"\[([A-Z]+-\d+)\]", iss.get("title") or "")
            if tm:
                meta["id"] = tm.group(1)
        if not meta["id"]:
            continue
        labels = label_names(iss)
        ch = chmap.get(meta["id"])
        r = row(meta)
        entry = {"id": meta["id"], "issue": iss["number"]}
        if "accepted" in labels:
            score = None
            for l in labels:
                sm = re.match(r"score/(\d+)", l)
                if sm:
                    score = int(sm.group(1))
            if score is None:
                score = ch["score"] if ch else 0
            entry["score"] = score
            # 打回过的老记录清掉，避免重复计
            r["rejected"] = [x for x in r["rejected"] if x["id"] != meta["id"]]
            r["pending"] = [x for x in r["pending"] if x["id"] != meta["id"]]
            r["accepted"] = [x for x in r["accepted"] if x["id"] != meta["id"]]
            r["accepted"].append(entry)
            r["total"] = sum(x["score"] for x in r["accepted"])
        elif "rejected" in labels:
            entry["comment"] = (iss.get("body") or "")[-500:]  # 近况在评论区，网页端会看 Issue
            r["rejected"] = [x for x in r["rejected"] if x["id"] != meta["id"]]
            r["accepted"] = [x for x in r["accepted"] if x["id"] != meta["id"]]
            r["pending"] = [x for x in r["pending"] if x["id"] != meta["id"]]
            r["rejected"].append(entry)
        else:
            r["pending"] = [x for x in r["pending"] if x["id"] != meta["id"]]
            r["pending"].append(entry)

    rows = sorted(members.values(), key=lambda x: -x["total"])
    out = {"gen": repo, "members": rows}
    plain = json.dumps(out, ensure_ascii=False)
    js = emit_js_payload(plain, LB_KEY, LB_SEED, LB_VAR, chunks=2)
    target = ROOT / "assets" / "data" / "leaderboard.enc.js"
    target.write_text(js, encoding="utf-8")
    print(f"leaderboard: {len(rows)} members, {sum(len(r['accepted']) for r in rows)} accepted -> {target.name}")


if __name__ == "__main__":
    main()
