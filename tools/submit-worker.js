/* ZEROTHSEC 提交中转 Worker（Cloudflare Workers 免费额度足够）
   作用：学生静态页 → 本 Worker（服务端持有 GH_TOKEN）→ 仓库 submissions/。
   令牌只存在 Cloudflare Secret 里，绝不出现在任何公开页面；
   学生与教练之后都只需要用网页，不需要访问 GitHub。

   部署（一次性，约 3 分钟）：
     1. dash.cloudflare.com → Workers & Pages → Create Worker → 命名 zs-submit →
        把本文件全部内容粘贴进编辑器 → Deploy
     2. Worker Settings → Variables and Secrets → Add：
        - Secret  GH_TOKEN = 细粒度 PAT（仅 zerothsec-recruit 仓库 Contents 读写）
        - Secret  COACH_KEY = 自己编一个教练口令（管理页发布结果/删除时要用）
     3. 记下 https://zs-submit.<用户名>.workers.dev，发给我填入站点 wp-config.js 的 relay

   接口：
     GET  /api/list                列 submissions/
     GET  /api/read?name=x.md      读单个文件
     POST /api/submit              {name, content} 学生入库（校验命名/大小）
     POST /api/delete              {key, name}     教练删除（需 COACH_KEY）
     POST /api/publish             {key, content}  教练发布 results.json（需 COACH_KEY） */

function b64enc(s) {
  const b = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin);
}
function b64dec(s) {
  const bin = atob(String(s).replace(/\n/g, ""));
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(b);
}

export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const json = (o, st = 200) =>
      new Response(JSON.stringify(o), { status: st, headers: Object.assign({ "Content-Type": "application/json" }, cors) });

    const REPO = env.REPO || "ZeroTh12/zerothsec-recruit";
    const DIR = env.SUBDIR || "submissions";
    if (!env.GH_TOKEN) return json({ error: "GH_TOKEN not configured" }, 500);
    const H = { Authorization: "Bearer " + env.GH_TOKEN, Accept: "application/vnd.github+json", "User-Agent": "zs-relay" };
    const u = new URL(req.url);

    const safeName = (n) => {
      n = String(n || "");
      if (n === "README.md") return null;
      return /^[^/\\:*?"<>|]{1,80}\.(md|markdown|txt)$/i.test(n) ? n : null;
    };
    const ghFile = (p) => `https://api.github.com/repos/${REPO}/contents/${p}`;
    const coachOk = (body) => env.COACH_KEY && String(body.key || "") === env.COACH_KEY;

    try {
      if (u.pathname === "/api/list") {
        const r = await fetch(ghFile(DIR), { headers: H });
        if (!r.ok) return json({ error: "gh " + r.status }, 502);
        const d = await r.json();
        return json((Array.isArray(d) ? d : [])
          .filter((f) => f.name !== "README.md")
          .map((f) => ({ name: f.name, size: f.size, sha: f.sha, path: f.path })));
      }

      if (u.pathname === "/api/read") {
        const name = safeName(u.searchParams.get("name"));
        if (!name) return json({ error: "bad name" }, 400);
        const r = await fetch(ghFile(`${DIR}/${encodeURIComponent(name)}`), { headers: H });
        if (!r.ok) return json({ error: "gh " + r.status }, r.status === 404 ? 404 : 502);
        const d = await r.json();
        return json({ name, sha: d.sha, content: b64dec(d.content) });
      }

      if (u.pathname === "/api/submit" && req.method === "POST") {
        const body = await req.json();
        const name = safeName(body.name);
        const content = String(body.content || "");
        if (!name) return json({ error: "bad name（需 <姓名>-<题号>.md）" }, 400);
        if (content.length > 200000) return json({ error: "too large" }, 413);
        let sha = null;
        const g = await fetch(ghFile(`${DIR}/${encodeURIComponent(name)}`), { headers: H });
        if (g.ok) sha = (await g.json()).sha;
        const payload = { message: "writeup: " + name, content: b64enc(content) };
        if (sha) payload.sha = sha;
        const p = await fetch(ghFile(`${DIR}/${encodeURIComponent(name)}`), { method: "PUT", headers: H, body: JSON.stringify(payload) });
        if (!p.ok) return json({ error: "gh " + p.status }, 502);
        return json({ ok: true });
      }

      if (u.pathname === "/api/delete" && req.method === "POST") {
        const body = await req.json();
        if (!coachOk(body)) return json({ error: "教练口令错误" }, 403);
        const name = safeName(body.name);
        if (!name) return json({ error: "bad name" }, 400);
        const g = await fetch(ghFile(`${DIR}/${encodeURIComponent(name)}`), { headers: H });
        if (!g.ok) return json({ error: "not found" }, 404);
        const sha = (await g.json()).sha;
        const d = await fetch(ghFile(`${DIR}/${encodeURIComponent(name)}`), {
          method: "DELETE", headers: H,
          body: JSON.stringify({ message: "coach delete: " + name, sha }),
        });
        if (!d.ok) return json({ error: "gh " + d.status }, 502);
        return json({ ok: true });
      }

      if (u.pathname === "/api/publish" && req.method === "POST") {
        const body = await req.json();
        if (!coachOk(body)) return json({ error: "教练口令错误" }, 403);
        const content = String(body.content || "");
        try { JSON.parse(content); } catch (e) { return json({ error: "不是合法 JSON" }, 400); }
        if (content.length > 500000) return json({ error: "too large" }, 413);
        const p = "assets/data/results.json";
        let sha = null;
        const g = await fetch(ghFile(p), { headers: H });
        if (g.ok) sha = (await g.json()).sha;
        const payload = { message: "publish results", content: b64enc(content) };
        if (sha) payload.sha = sha;
        const r = await fetch(ghFile(p), { method: "PUT", headers: H, body: JSON.stringify(payload) });
        if (!r.ok) return json({ error: "gh " + r.status }, 502);
        return json({ ok: true });
      }

      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: String(e).slice(0, 200) }, 500);
    }
  },
};
