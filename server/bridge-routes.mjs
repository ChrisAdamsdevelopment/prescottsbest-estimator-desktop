import { getBridgeStatus, listJobs, getJob, pushBrowserJobs } from './bridge-store.mjs';
export async function handleBridge(req, res, path, { send, readJSON }) {
  if (req.method === 'GET' && path === '/api/bridge/status') return send(res, 200, await getBridgeStatus());
  if (req.method === 'GET' && path === '/api/bridge/jobs') {
    const jobs = await listJobs();
    const full = await Promise.all(jobs.filter(j => j.source === 'mcp').map(j => getJob(j.id)));
    return send(res, 200, { jobs, incomingDrafts: full.map(r => ({ ...r.job, bridgeRevision: r.revision })) });
  }
  if (req.method === 'POST' && path === '/api/bridge/push') {
    const input = await readJSON(req, 5_000_000);
    return send(res, 200, await pushBrowserJobs(input?.jobs));
  }
  return send(res, 404, { error: 'Unknown bridge route' });
}
