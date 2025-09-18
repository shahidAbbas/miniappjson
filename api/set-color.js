// api/set-color.js — GitHub variant (Node.js Serverless)
// Edits ONLY statusBar.theme.light.backgroundColor in miniApp.json and commits to trigger redeploy.

const ok = (res, code, body, type = "text/plain") => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.status(code).setHeader("Content-Type", type).send(body);
};

function setNested(obj, path, value) {
  const keys = Array.isArray(path) ? path : path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  return obj;
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return ok(res, 204, "");
  if (req.method !== "POST")   return ok(res, 405, "Method not allowed");

  try {
    // ---- Auth (shared secret) ----
    const expected = process.env.ADMIN_SECRET;
    const provided = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (!expected) return ok(res, 500, "Missing ADMIN_SECRET");
    if (provided !== expected) return ok(res, 401, "Unauthorized");

    // ---- Parse input ----
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const color = body?.color;
    if (!color || typeof color !== "string") return ok(res, 400, "Missing or invalid color");

    // ---- Env for GitHub ----
    const GH_TOKEN = process.env.GH_TOKEN;
    const GH_REPO  = process.env.GH_REPO;   // "owner/repo"
    const GH_BRANCH = process.env.GH_BRANCH || "main";
    const JSON_FILE_PATH = process.env.JSON_FILE_PATH || "miniApp.json";
    if (!GH_TOKEN || !GH_REPO) {
      return ok(res, 500, "Missing GH_TOKEN or GH_REPO");
    }

    const api = "https://api.github.com";
    const headers = {
      "Authorization": `Bearer ${GH_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
    };

    // ---- 1) Get existing file ----
    const getUrl = `${api}/repos/${GH_REPO}/contents/${encodeURIComponent(JSON_FILE_PATH)}?ref=${encodeURIComponent(GH_BRANCH)}`;
    const getRes = await fetch(getUrl, { headers });
    if (!getRes.ok) {
      const t = await getRes.text();
      return ok(res, 500, `Fetch file failed (${getRes.status}): ${t}`);
    }
    const file = await getRes.json();
    const current = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));

    // ---- 2) Update nested field ONLY ----
    const updated = setNested(current, ["statusBar","theme","light","backgroundColor"], color);
    const newB64  = Buffer.from(JSON.stringify(updated, null, 2) + "\n").toString("base64");

    // ---- 3) Commit update ----
    const putUrl = `${api}/repos/${GH_REPO}/contents/${encodeURIComponent(JSON_FILE_PATH)}`;
    const putBody = {
      message: `chore: set statusBar.theme.light.backgroundColor to ${color}`,
      content: newB64,
      sha: file.sha,
      branch: GH_BRANCH,
    };
    const putRes = await fetch(putUrl, { method: "PUT", headers, body: JSON.stringify(putBody) });
    if (!putRes.ok) {
      const t = await putRes.text();
      return ok(res, 500, `Commit failed (${putRes.status}): ${t}`);
    }

    return ok(res, 200, JSON.stringify({ ok: true, color }), "application/json");
  } catch (e) {
    return ok(res, 500, `Server error: ${e && e.message ? e.message : String(e)}`);
  }
};
