import { getBridgeStatus, listJobs, getJob, createDraft, addDraftObservation } from './bridge-store.mjs';

const cmd = process.argv[2] || 'status';
const args = process.argv.slice(3);
try {
  let value;
  if (cmd === 'status') value = await getBridgeStatus();
  else if (cmd === 'list') value = await listJobs();
  else if (cmd === 'get') {
    if (!args[0]) throw new Error('Usage: get JOB_ID');
    value = await getJob(args[0]);
  } else if (cmd === 'create' || cmd === 'observe') {
    if (process.env.PBC_MCP_ENABLE_WRITES !== '1') {
      throw new Error('Writes disabled: use PBC_MCP_ENABLE_WRITES=1 only after authorized user request');
    }
    const input = JSON.parse(args.join(' '));
    value = cmd === 'create' ? await createDraft(input) :
      await addDraftObservation(input.id, input.note, input.expectedRevision);
  } else {
    throw new Error('Use status, list, get JOB_ID, create JSON, or observe JSON');
  }
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
} catch (err) {
  process.stderr.write('PBC BRIDGE: ' + (err.message || 'Error') + '\n');
  process.exitCode = 1;
}
