/* ZEROTHSEC 提交中转 Worker（Cloudflare Workers 免费额度足够）
   作用：学生静态页 → 本 Worker（服务端持有 GH_TOKEN）→ 仓库 submissions/。
   令牌只存在 Cloudflare Secret 里，绝不出现在任何公开页面。

   部署：
     1. dash.cloudflare.com → Workers & Pages → Create Worker → 粘贴本文件 → Deploy
     2. Worker Settings → Variables → Add Secret：GH_TOKEN = 细粒度 PAT
        （仅 zerothsec-recruit 单仓库、Contents: read&write）
     3. 可选 Variables：REPO（默认 ZeroTh12/zerothsec-recruit）、SUBDIR（默认 submissions）
     4. 把站点 wp-config.js 的 relay 填为 https://<你的worker>.workers.dev

   安全：只允许写 SUBDIR 目录；文件名必须形如 <姓名>-<题号>.md/.txt（≤80 字符、无路径符）；
   单文件 ≤200KB；不接受 README.md。 */

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
    const ghPath = (name) => `https://api.github.com/repos/${REPO}/contents/${DIR}/${encodeURIComponent(name)}`;

    try {
      if (u.pathname === "/api/list") {
        const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${DIR}`, { headers: H });
        if (!r.ok) return json({ error: "gh " + r.status }, 502);
        const d = await r.json();
        return json((Array.isArray(d) ? d : [])
          .filter((f) => f.name !== "README.md")
          .map((f) => ({ name: f.name, size: f.size, sha: f.sha, path: f.path })));
      }

      if (u.pathname === "/api/read") {
        const name = safeName(u.searchParams.get("name"));
        if (!name) return json({ error: "bad name" }, 400);
        const r = await fetch(ghPath(name), { headers: H });
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
        const g = await fetch(ghPath(name), { headers: H });
        if (g.ok) sha = (await g.json()).sha;
        const payload = { message: "writeup: " + name, content: b64enc(content) };
        if (sha) payload.sha = sha;
        const p = await fetch(ghPath(name), { method: "PUT", headers: H, body: JSON.stringify(payload) });
        if (!p.ok) return json({ error: "gh " + p.status }, 502);
        return json({ ok: true });
      }

      if (u.pathname === "/api/delete" && req.method === "POST") {
        const body = await req.json();
        const name = safeName(body.name);
        if (!name) return json({ error: "bad name" }, 400);
        const g = await fetch(ghPath(name), { headers: H });
        if (!g.ok) return json({ error: "not found" }, 404);
        const sha = (await g.json()).sha;
        const d = await fetch(ghPath(name), {
          method: "DELETE", headers: H,
          body: JSON.stringify({ message: "coach delete: " + name, sha }),
        });
        if (!d.ok) return json({ error: "gh " + d.status }, 502);
        return json({ ok: true });
      }

      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: String(e).slice(0, 200) }, 500);
    }
  },
};
