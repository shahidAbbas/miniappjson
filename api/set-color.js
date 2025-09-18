// api/set-color.js
// Updates miniApp.json in GitLab and commits to trigger a Vercel redeploy.
const ok = (res, code, body) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  return res.status(code).send(body);
};

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return ok(res, 204, '');

  try {
    if (req.method !== 'POST') return ok(res, 405, 'Method not allowed');

    // simple shared-secret auth
    const auth = req.headers.authorization || '';
    const tokenOk = auth.startsWith('Bearer ') && auth.split(' ')[1] === process.env.ADMIN_SECRET;
    if (!tokenOk) return ok(res, 401, 'Unauthorized');

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const color = body?.color;
    if (!color) return ok(res, 400, 'Missing color');

    const projectId = process.env.GITLAB_PROJECT_ID;       // e.g. 12345678
    const branch    = process.env.GITLAB_BRANCH || 'main';
    const filePath  = process.env.JSON_FILE_PATH || 'miniApp.json';
    const apiBase   = process.env.GITLAB_API_BASE || 'https://gitlab.com/api/v4';
    const glToken   = process.env.GITLAB_TOKEN;            // PAT with write_repository

    // 1) Read existing file (base64)
    const getUrl = `${apiBase}/projects/${encodeURIComponent(projectId)}/repository/files/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`;
    const getRes = await fetch(getUrl, { headers: { 'PRIVATE-TOKEN': glToken } });
    if (!getRes.ok) return ok(res, 500, 'Fetch file failed: ' + (await getRes.text()));
    const file = await getRes.json();
    const cur  = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));

    // 2) Update JSON
    const updated = { ...cur, statusBarBgColor: color };
    const newContent = JSON.stringify(updated, null, 2) + '\n';

    // 3) Commit update
    const putUrl = `${apiBase}/projects/${encodeURIComponent(projectId)}/repository/files/${encodeURIComponent(filePath)}`;
    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: { 'PRIVATE-TOKEN': glToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branch,
        content: newContent,
        commit_message: `chore: set statusBarBgColor to ${color}`
      })
    });
    if (!putRes.ok) return ok(res, 500, 'Commit failed: ' + (await putRes.text()));

    return ok(res, 200, JSON.stringify({ ok: true, color }));
  } catch (e) {
    console.error(e);
    return ok(res, 500, 'Server error');
  }
};
