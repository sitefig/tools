// Checks src/gap5lib/whisper.js against transformers/PyTorch fp32 on test/fixtures/gap5-jfk-16k.wav (public-domain JFK clip from the OpenAI whisper repo).
import { readFileSync } from 'node:fs';
import { getModel, logMel, encode, decode, detokenize, transcribe } from '../src/gap5lib/whisper.js';
const O = JSON.parse(readFileSync(new URL('./fixtures/gap5-whisper-oracle.json', import.meta.url))), wav = readFileSync(new URL('./fixtures/gap5-jfk-16k.wav', import.meta.url));
const pcm = new Float32Array((wav.length - 44) / 2); for (let i = 0; i < pcm.length; i++) pcm[i] = wav.readInt16LE(44 + i * 2) / 32768;
const { M, vocab } = await getModel(); let fail = 0; const bad = (m) => { fail++; console.error('FAIL', m); };
let t0 = Date.now(); const mel = logMel(pcm, M); console.log(`mel ${Date.now() - t0} ms`);
let dm = 0; O.mel_head.forEach((r, m) => r.forEach((v, t) => { dm = Math.max(dm, Math.abs(v - mel[m * 3000 + t])); })); O.mel_mid.forEach((v, i) => { dm = Math.max(dm, Math.abs(v - mel[40 * 3000 + 100 + i])); });
const ms = mel.reduce((a, b) => a + b, 0); console.log(`mel max diff ${dm.toExponential(2)}, sum ${ms.toFixed(1)} vs ${O.mel_sum.toFixed(1)}`); if (dm > 1e-3 || Math.abs(ms - O.mel_sum) > 5) bad('mel');
t0 = Date.now(); const enc = await encode(M, mel); console.log(`encoder ${Date.now() - t0} ms`);
let de = 0; O.enc_head.forEach((v, i) => { de = Math.max(de, Math.abs(v - enc[i])); }); O.enc_mid.forEach((v, i) => { de = Math.max(de, Math.abs(v - enc[300 * 384 + i])); });
console.log(`encoder sample max diff ${de.toExponential(2)}`); if (de > 0.15) bad('encoder');
t0 = Date.now(); const ids = await decode(M, enc); console.log(`decode ${Date.now() - t0} ms: ${ids.length} tokens`);
const text = detokenize(vocab, ids); console.log(JSON.stringify(text)); console.log(JSON.stringify(O.text));
if (JSON.stringify(ids) !== JSON.stringify(O.ids)) bad('token ids differ: ' + ids.join(',') + ' vs ' + O.ids.join(','));
if (text.trim() !== O.text.trim()) bad('text differs');
console.log(fail ? fail + ' failures' : 'all ok'); process.exit(fail ? 1 : 0);
