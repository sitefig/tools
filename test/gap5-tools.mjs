// Oracle checks for src/tools/gap5.js (run: node test/gap5-tools.mjs). Fixtures: test/fixtures/gap5-oracle.json, made with
//  - python-stdnum (tax ids; known deliberate differences: Belgian check digits 98/99 and Spanish CIF letter-vs-digit rules, which the tool applies strictly),
//  - scapy (JA3) and ja4plus (JA4, port of the FoxIO reference) on ClientHellos captured from `openssl s_client`,
//  - a linear scan of the raw RIR delegation files (IP to country; independent of the packed data/ip-country.bin).
import { readFileSync } from 'node:fs';
const { _gap5: G, default: tools } = await import('../src/tools/gap5.js');
const O = JSON.parse(readFileSync(new URL('./fixtures/gap5-oracle.json', import.meta.url)));
let fail = 0; const bad = (m) => { fail++; console.error('FAIL', m); };
// tax ids
let n = 0; for (const [line, exp] of O.taxid) { const r = G.checkTaxId(line).r; if (r === 'format' || r == null) continue; n++; if (r !== exp) bad(`taxid ${line}: got ${r}, stdnum ${exp}`); }
console.log(`tax ids: ${n} compared`);
// client hello
for (const c of O.clienthello) { const h = G.parseClientHello(G.hexToBytes(c.hex)); const j3 = G.ja3Of(h), j4 = await G.ja4Of(h); if (j3.md5 !== c.ja3) bad(`ja3 ${j3.md5} vs ${c.ja3}`); if (j4.full !== c.ja4) bad(`ja4 ${j4.full} vs ${c.ja4}`); }
console.log(`client hellos: ${O.clienthello.length} compared`);
// ip -> country
const db = await G.ipCountryDB(); let m = 0;
for (const [ip, cc] of O.ipcountry) { const v4 = G.parseIPv4(ip); const v = v4 ?? G.parseIPv6(ip); const r = G.countryOf(db, v, v4 === null ? 6 : 4); m++; if ((r ? r.cc : null) !== cc) bad(`ip ${ip}: got ${r?.cc}, expected ${cc}`); }
console.log(`ip country: ${m} compared (table dated ${db.date})`);
// known values
const eq = (a, b, msg) => { if (a !== b) bad(`${msg}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); };
const cg = G.cgtCalc('date,type,asset,quantity,price,fee\n2023-01-10,buy,BTC,1.0,30000,50\n2023-09-01,buy,BTC,0.5,35000,25\n2024-03-15,sell,BTC,1.2,70000,100', 'FIFO', 365, 50);
eq(Math.round(cg.events[0].gain * 100), 3986667, 'cgt gain lot 1'); eq(cg.events[0].eligible, true, 'cgt discount lot 1'); eq(cg.events[1].eligible, false, 'cgt no discount lot 2');
const nm = G.parseNmap('Nmap scan report for h.example (192.0.2.1)\nHost is up.\nPORT   STATE SERVICE VERSION\n22/tcp open  ssh     OpenSSH 8.9\n80/tcp closed http\n');
eq(nm[0].ports.length, 2, 'nmap ports'); eq(nm[0].addr, '192.0.2.1', 'nmap addr');
const dg = G.parseDig('; <<>> DiG 9.18 <<>> example.com MX\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 1\n;; flags: qr rd ra; QUERY: 1, ANSWER: 1\n\n;; ANSWER SECTION:\nexample.com.\t300\tIN\tMX\t10 mx.example.com.\n\n;; Query time: 5 msec\n');
eq(dg[0].records[0].rdata, '10 mx.example.com.', 'dig rdata'); eq(dg[0].status, 'NOERROR', 'dig status');
// every non-dom tool runs on its sample
let ran = 0; for (const t of tools) { if (t.render || t.dom) continue; try { const r = await t.run([t.sample ?? '', t.sample2 ?? ''], Object.fromEntries((t.opts || []).map((o) => [o.id, o.def]))); if (!(typeof r === 'string' ? r : r?.text)) bad(`${t.id}: empty result`); ran++; } catch (e) { bad(`${t.id}: ${e.message}`); } }
console.log(`${ran} tools ran on their samples`);
console.log(fail ? `${fail} failures` : 'all ok'); process.exit(fail ? 1 : 0);
