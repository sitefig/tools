import { parentPort, workerData } from 'node:worker_threads';
import { run } from './runner.mjs';
try { parentPort.postMessage({ result: await run(workerData.id, workerData) }); }
catch (e) { parentPort.postMessage({ error: e.message }); }
