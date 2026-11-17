"use strict";
/* ZEROTHSEC WRITEUP 服务器（Node 20，零依赖）
 *
 * 学生：writeup.html 点上传 → POST /api/submit → 服务端持令牌写进仓库 submissions/
 * 教练：/console/<CONSOLE_KEY> 打开即审核（列出/查看/改写/删除/通过打回），结论直接写回
 *        assets/data/results.json，学生端立刻能看到结果与排行榜。
 *
 * 令牌只在服务端环境变量 GH_TOKEN；公开仓库里没有令牌，学生和教练都不用登录 GitHub。
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

/* 运行配置：优先环境变量，其次同目录 config.local.json（不提交进仓库） */
function localCfg() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "config.local.json"), "utf8"));
  } catch (e) { return {}; }
}
const LOCAL = localCfg();

const GH_TOKEN = process.env.GH_TOKEN || LOCAL.GH_TOKEN || "";
const REPO = process.env.REPO || LOCAL.REPO || "ZeroTh12/zerothsec-recruit";
const SUB_DIR = process.env.SUB_DIR || LOCAL.SUB_DIR || "submissions";
const RESULTS_PATH = process.env.RESULTS_PATH || LOCAL.RESULTS_PATH || "assets/data/results.json";
const CONSOLE_KEY = process.env.CONSOLE_KEY || LOCAL.CONSOLE_KEY || "";
const PORT = parseInt(process.env.PORT || "8000", 10);
const API = "https://api.github.com";

const MAX_FILE = 200 * 1024;
const MAX_RESULTS = 500 * 1024;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS });
  res.end(JSON.stringify(obj));
}

function safeName(n) {
  if (typeof n !== "string") return "";
  if (!/^[^/\\:*?"<>|]{1,80}\.(md|markdown|txt)$/i.test(n)) return "";
  if (/^readme\.md$/i.test(n)) return "";
  return n;
}

function b64(s) { return Buffer.from(String(s), "utf8").toString("base64"); }
function unb64(s) { return Buffer.from(String(s || "").replace(/\s/g, ""), "base64").toString("utf8"); }

async function gh(path, opts) {
  const r = await fetch(API + path, {
    ...opts,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + GH_TOKEN,
      "User-Agent": "zs-relay",
      "X-GitHub-Api-Version": "2022-11-28",
      ...((opts && opts.headers) || {}),
    },
  });
  return r;
}

async function listSubs() {
  const r = await gh(`/repos/${REPO}/contents/${SUB_DIR}`);
  if (r.status === 404) return [];
  if (!r.ok) throw new Error("GitHub 列表失败 HTTP " + r.status);
  const d = await r.json();
  return (Array.isArray(d) ? d : [])
    .filter((f) => f.type === "file" && f.name !== "README.md")
    .map((f) => ({ name: f.name, size: f.size, updated: f.updated_at || "" }));
}

async function readFile(dir, name) {
  const r = await gh(`/repos/${REPO}/contents/${dir}/${encodeURIComponent(name)}`);
  if (!r.ok) return null;
  const d = await r.json();
  return { name: d.name, content: unb64(d.content), sha: d.sha };
}

async function putFile(dir, name, content, msg) {
  const cur = await readFile(dir, name);
  const body = { message: msg || ("update " + name), content: b64(content) };
  if (cur) body.sha = cur.sha;
  const r = await gh(`/repos/${REPO}/contents/${dir}/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  if (!r.ok) throw new Error("GitHub 写入失败 HTTP " + r.status);
}

async function deleteFile(dir, name) {
  const cur = await readFile(dir, name);
  if (!cur) return;
  const r = await gh(`/repos/${REPO}/contents/${dir}/${encodeURIComponent(name)}`, {
    method: "DELETE",
    body: JSON.stringify({ message: "delete " + name, sha: cur.sha }),
    headers: { "Content-Type": "application/json" },
  });
  if (!r.ok) throw new Error("GitHub 删除失败 HTTP " + r.status);
}

async function getResults() {
  const f = await readFile("assets/data", "results.json").catch(() => null);
  if (!f) return { updated: "", note: "", entries: [] };
  try { return JSON.parse(f.content); } catch (e) { return { updated: "", note: "", entries: [] }; }
}

async function saveResults(obj) {
  const text = JSON.stringify(obj, null, 2);
  if (Buffer.byteLength(text, "utf8") > MAX_RESULTS) throw new Error("结果文件过大");
  await putFile("assets/data", "results.json", text, "results: publish");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > 2 * 1024 * 1024) { reject(new Error("too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function coachOk(req, url) {
  const k = req.headers["x-coach-key"] || url.searchParams.get("key") || "";
  return CONSOLE_KEY && k === CONSOLE_KEY;
}

/* ---------------- 教练审核台（仅 /console/<key> 可访问） ---------------- */
function consoleHtml(key) {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive">
<title>ZS · 审核台</title>
<style>
:root{--bg:#0a0a0a;--ink:#111;--line:#262626;--bone:#e8e8e8;--dim:#8a8a8a;--acid:#c8ff3d;--red:#ff5b5b;
--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--bone);font:400 13px/1.7 var(--mono)}
header{border-bottom:1px solid var(--line);padding:14px 22px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
h1{font-size:14px;margin:0;letter-spacing:.14em}
main{padding:22px}
.bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
input[type=search],input[type=number],input[type=text],textarea{background:#050505;color:var(--bone);border:1px solid var(--line);padding:8px 10px;font:400 12px var(--mono);border-radius:2px}
input[type=search]{flex:1;min-width:220px}
button{background:#050505;color:var(--bone);border:1px solid var(--line);padding:8px 13px;font:600 11.5px var(--mono);letter-spacing:.05em;cursor:pointer;border-radius:2px}
button:hover{border-color:var(--acid);color:var(--acid)}
button.pri{border-color:var(--acid);color:var(--acid)}
button.danger:hover{border-color:var(--red);color:var(--red)}
.card{border:1px solid var(--line);background:var(--ink);padding:14px 16px;margin-bottom:14px}
.hd{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
.hd b{font-size:13px}
.tag{font-size:10.5px;border:1px solid var(--line);padding:2px 7px;color:var(--dim);letter-spacing:.06em}
.tag.ok{border-color:var(--acid);color:var(--acid)}
.tag.no{border-color:var(--red);color:var(--red)}
pre{white-space:pre-wrap;background:#050505;border:1px solid var(--line);padding:12px;max-height:400px;overflow:auto;margin:0 0 10px;font:400 12px/1.65 var(--mono)}
textarea.full{width:100%;min-height:220px}
.acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.acts input[type=number]{width:88px}
.muted{color:var(--dim);font-size:12px}
.err{color:var(--red)}
</style></head><body>
<header><h1>ZS · WRITEUP 审核台</h1><span class="muted" id="stat">加载中…</span></header>
<main>
  <div class="bar">
    <input type="search" id="q" placeholder="搜索姓名 / 题号…">
    <button id="refresh">⟳ 刷新</button>
    <button id="ai">🤖 复制 AI 审查包</button>
    <span class="muted">通过/打回会立刻写进成绩，学生刷页面就能看到</span>
  </div>
  <div id="list"></div>
</main>
<script>
var KEY = ${JSON.stringify(key)};
var $ = function (s) { return document.querySelector(s); };
var files = [], entries = [];
function api(p, opt) {
  opt = opt || {};
  return fetch(p, {
    method: opt.method || "GET",
    headers: Object.assign({ "x-coach-key": KEY }, opt.body ? { "Content-Type": "application/json" } : {}),
    body: opt.body ? JSON.stringify(opt.body) : undefined
  }).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || ("HTTP " + r.status)); return d; }); });
}
function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
function chOf(n) { var m = n.match(/-(WEB|CRYPTO|MISC|REVERSE|PWN)-(\\d+)\\.md$/i); return m ? (m[1].toUpperCase() + "-" + m[2]) : ""; }
function nmOf(n) { var m = n.match(/^(.+)-(WEB|CRYPTO|MISC|REVERSE|PWN)-\\d+\\.md$/i); return m ? m[1] : n.replace(/\\.md$/i, ""); }
function entOf(n) { var id = chOf(n), nm = nmOf(n); return entries.find(function (e) { return e.id === id && (e.name || "").toLowerCase() === nm.toLowerCase(); }) || null; }

var lastSync = "";
async function load() {
  try {
    var r = await api("/api/list?t=" + Date.now());
    files = r;
    var st = await api("/api/state?t=" + Date.now());
    entries = st.entries || [];
    lastSync = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    render();
  } catch (e) { $("#list").innerHTML = '<p class="err">' + e.message + '</p>'; }
}

function render() {
  var host = $("#list"); host.innerHTML = "";
  var kw = $("#q").value.trim().toLowerCase();
  var shown = files.filter(function (f) { return !kw || f.name.toLowerCase().indexOf(kw) >= 0; });
  $("#stat").textContent = "提交库 · 共 " + shown.length + " 篇 · 已审 " + shown.filter(function (f) { return entOf(f.name); }).length +
    " 篇 · 待审 " + shown.filter(function (f) { return !entOf(f.name); }).length + " 篇" +
    (lastSync ? " · 最近刷新 " + lastSync : "");
  if (!shown.length) { host.appendChild(el("p", "muted", "还没有学生提交。学生上传 .md 后这里会自动出现。")); return; }
  shown.forEach(function (f) { host.appendChild(card(f)); });
}

/* 每 15 秒自动拉一次；有正在查看/编辑的正文时跳过，避免打断 */
setInterval(function () {
  if ($("#list").querySelector("pre:not([hidden])")) return;
  load();
}, 15000);

function card(f) {
  var c = el("div", "card");
  var e = entOf(f.name);
  var hd = el("div", "hd");
  hd.appendChild(el("b", null, f.name));
  hd.appendChild(el("span", "tag", chOf(f.name) || "—"));
  hd.appendChild(el("span", "tag", f.size + " B"));
  var tg = el("span", "tag " + (e ? (e.status === "accepted" ? "ok" : "no") : ""),
    e ? (e.status === "accepted" ? "已通过 · " + (e.score || 0) : "已打回") : "待审");
  hd.appendChild(tg);
  c.appendChild(hd);

  var pre = el("pre", null, "（点「查看」加载正文）");
  pre.hidden = true;
  c.appendChild(pre);

  var view = el("button", null, "查看");
  view.onclick = async function () {
    if (!pre.hidden) { pre.hidden = true; pre.textContent = "（点「查看」加载正文）"; view.textContent = "查看"; return; }
    view.textContent = "载入中…";
    try { var d = await api("/api/read?name=" + encodeURIComponent(f.name)); pre.textContent = d.content; pre.hidden = false; view.textContent = "收起"; }
    catch (err) { pre.textContent = "读取失败：" + err.message; pre.hidden = false; view.textContent = "收起"; }
  };

  var score = document.createElement("input");
  score.type = "number"; score.min = "0"; score.max = "100"; score.placeholder = "分数";
  score.value = e && e.score ? e.score : "";
  var reason = document.createElement("input");
  reason.type = "text"; reason.placeholder = "打回理由（可选）";
  reason.value = e && e.reason ? e.reason : "";

  var pass = el("button", "pri", "✓ 通过");
  pass.onclick = function () { decide(f.name, "accepted", score.value, ""); };
  var reject = el("button", "danger", "✗ 打回");
  reject.onclick = function () { decide(f.name, "rejected", 0, reason.value); };

  var edit = el("button", null, "编辑");
  edit.onclick = function () {
    if (!pre.hidden && pre.contentEditable === "true") return;
    pre.contentEditable = "true"; pre.hidden = false;
    pre.textContent = pre.textContent === "（点「查看」加载正文）" ? "载入中…" : pre.textContent;
    api("/api/read?name=" + encodeURIComponent(f.name)).then(function (d) {
      pre.textContent = d.content; pre.focus(); save.hidden = false;
    });
  };
  var save = el("button", "pri", "保存修改");
  save.hidden = true;
  save.onclick = async function () {
    try { await api("/api/save", { method: "POST", body: { name: f.name, content: pre.textContent } }); save.hidden = false; alert("已保存"); }
    catch (err) { alert("保存失败：" + err.message); }
  };

  var del = el("button", "danger", "删除");
  del.onclick = function () {
    if (!confirm("确定删除 " + f.name + "？")) return;
    api("/api/delete", { method: "POST", body: { name: f.name } }).then(function () { load(); }).catch(function (err) { alert("删除失败：" + err.message); });
  };

  var acts = el("div", "acts");
  [view, score, pass, reason, reject, edit, save, del].forEach(function (x) { acts.appendChild(x); });
  c.appendChild(acts);
  return c;
}

async function decide(name, status, score, reason) {
  try {
    await api("/api/decide", { method: "POST", body: { name: name, status: status, score: Number(score) || 0, reason: reason || "" } });
    await load();
  } catch (e) { alert("写入失败：" + e.message); }
}

$("#q").oninput = render;
$("#refresh").onclick = load;
$("#ai").onclick = async function () {
  var out = [];
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (entOf(f.name)) continue;
    var d = await api("/api/read?name=" + encodeURIComponent(f.name));
    out.push("=== " + f.name + " ===\\n" + d.content);
  }
  var text = "请审阅以下 writeup，按「内容是否真实完成题目、步骤是否可复现、有无抄袭」逐篇给出结论。\\n每行只输出一个 JSON：" +
    '{"name":"文件名","status":"accepted|rejected","score":0-100,"reason":"一句话理由"}\\n\\n' + out.join("\\n\\n");
  try { await navigator.clipboard.writeText(text); alert("已复制 " + out.length + " 篇待审内容，粘给 AI 后把它的 JSON 贴回来"); }
  catch (e) { prompt("复制以下内容：", text); }
};
load();
</script></body></html>`;
}

/* ---------------- HTTP ---------------- */
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
  const url = new URL(req.url, "http://x");
  const p = decodeURIComponent(url.pathname);

  try {
    if (!GH_TOKEN) return json(res, 500, { error: "GH_TOKEN 未配置" });

    if (req.method === "GET" && p === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", ...CORS });
      return res.end(`<!DOCTYPE html><meta charset="utf-8"><title>ZS Relay</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#ddd;font:14px ui-monospace,monospace">
<div style="border:1px solid #262626;padding:26px 34px">ZEROTHSEC · WRITEUP RELAY<br><span id="s" style="color:#8a8a8a">checking…</span></div>
<script>fetch('/api/list').then(r=>r.json()).then(d=>document.getElementById('s').textContent='在线 · 已收 '+d.length+' 篇').catch(()=>document.getElementById('s').textContent='读取失败')</script>`);
    }

    if (req.method === "GET" && CONSOLE_KEY && p === "/console/" + CONSOLE_KEY) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(consoleHtml(CONSOLE_KEY));
    }

    if (req.method === "GET" && p === "/api/list") return json(res, 200, await listSubs());

    if (req.method === "GET" && p === "/api/read") {
      const name = safeName(url.searchParams.get("name") || "");
      if (!name) return json(res, 400, { error: "非法文件名" });
      const f = await readFile(SUB_DIR, name);
      if (!f) return json(res, 404, { error: "不存在" });
      return json(res, 200, { name: f.name, content: f.content });
    }

    /* 学生上传（公开） */
    if (req.method === "POST" && p === "/api/submit") {
      const b = JSON.parse((await readBody(req)) || "{}");
      const name = safeName(b.name || "");
      if (!name) return json(res, 400, { error: "文件名必须是 <姓名>-<题号>.md" });
      const content = String(b.content || "");
      if (!content.trim()) return json(res, 400, { error: "内容为空" });
      if (Buffer.byteLength(content, "utf8") > MAX_FILE) return json(res, 413, { error: "文件过大（上限 200KB）" });
      await putFile(SUB_DIR, name, content, "writeup: " + name);
      return json(res, 200, { ok: true, name });
    }

    /* 教练操作 */
    if (req.method === "GET" && p === "/api/state") {
      if (!coachOk(req, url)) return json(res, 403, { error: "forbidden" });
      return json(res, 200, await getResults());
    }

    if (req.method === "POST" && p === "/api/save") {
      if (!coachOk(req, url)) return json(res, 403, { error: "forbidden" });
      const b = JSON.parse((await readBody(req)) || "{}");
      const name = safeName(b.name || "");
      if (!name) return json(res, 400, { error: "非法文件名" });
      await putFile(SUB_DIR, name, String(b.content || ""), "writeup edit: " + name);
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && p === "/api/delete") {
      if (!coachOk(req, url)) return json(res, 403, { error: "forbidden" });
      const b = JSON.parse((await readBody(req)) || "{}");
      const name = safeName(b.name || "");
      if (!name) return json(res, 400, { error: "非法文件名" });
      await deleteFile(SUB_DIR, name);
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && p === "/api/decide") {
      if (!coachOk(req, url)) return json(res, 403, { error: "forbidden" });
      const b = JSON.parse((await readBody(req)) || "{}");
      const name = safeName(b.name || "");
      const m = name.match(/^(.+)-(WEB|CRYPTO|MISC|REVERSE|PWN)-(\d+)\.md$/i);
      if (!m) return json(res, 400, { error: "文件名不符合 <姓名>-<题号>.md" });
      const nm = m[1], id = m[2].toUpperCase() + "-" + m[3];
      const status = b.status === "accepted" ? "accepted" : "rejected";
      const doc = await getResults();
      doc.entries = Array.isArray(doc.entries) ? doc.entries : [];
      const hit = doc.entries.find((e) => e.id === id && String(e.name || "").toLowerCase() === nm.toLowerCase());
      const rec = { id, name: nm, status, score: Number(b.score) || 0, reason: String(b.reason || "") };
      if (hit) Object.assign(hit, rec); else doc.entries.push(rec);
      doc.updated = new Date().toISOString();
      doc.note = doc.note || "由教练审核台直接写入";
      await saveResults(doc);
      return json(res, 200, { ok: true, entries: doc.entries });
    }

    return json(res, 404, { error: "not found" });
  } catch (e) {
    return json(res, 500, { error: String((e && e.message) || e) });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("zs-relay on 0.0.0.0:" + PORT + " repo=" + REPO + " console=" + (CONSOLE_KEY ? "on" : "off"));
});