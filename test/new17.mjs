// Self-checks for src/tools/new17.js. Run: node test/new17.mjs
// Oracles used while building (pip, scratch only): num2words (71 numbers x 5 languages; only library quirks differ),
// astral (sunrise/sunset within ~1 min), ephem (new/full moons within ~2 min), python-dateutil rrule (nth weekday),
// icalendar (parses the .ics), zoneinfo/known dates (DST), NWS published values (wind chill, heat index).
import assert from 'node:assert/strict';
import T from '../src/tools/new17.js';
const run = (id, o = {}, i = ['']) => { const t = T.find((x) => x.id === id); return t.run(i, { ...Object.fromEntries((t.opts || []).map((x) => [x.id, x.def])), ...o }, []); };
const w = (n, lang) => run('number-to-words-multilingual', { lang, cur: 'None' }, [String(n)]).split('\n')[0];
assert.equal(w(1999, 'English'), 'one thousand nine hundred and ninety-nine');
assert.equal(w(80, 'French'), 'quatre-vingts');
assert.equal(w(81, 'French'), 'quatre-vingt-un');
assert.equal(w(21000, 'Spanish'), 'veintiún mil');
assert.equal(w(1234, 'German'), 'eintausendzweihundertvierunddreißig');
assert.equal(w(22, 'Dutch'), 'tweeëntwintig');
assert.match(run('number-to-words-multilingual', { lang: 'German', cur: 'EUR' }, ['1.50']), /^ein Euro und fünfzig Cent/);
assert.match(run('scientific-notation-converter', {}, ['6.02e23']), /decimal: +602000000000000000000000/);
assert.match(run('wind-chill-heat-index-calculator', { t: 0, tu: 'F', w: 15, wu: 'mph' }), /Wind chill: -19\.4 F/);
assert.match(run('wind-chill-heat-index-calculator', { t: 90, tu: 'F', w: 0, wu: 'mph', rh: 70 }), /Heat index: 105\.9 F/);
assert.match(run('fuel-economy-converter', { v: 7.5, unit: 'L/100km' }), /31\.36 MPG \(US\)/);
assert.match(run('oven-temperature-converter', { v: '4', kind: 'Gas mark' }), /Conventional oven: 180 C/);
assert.match(run('running-pace-converter', {}), /8:51 per mile/);
assert.match(run('dst-clock-change-finder', { tz: 'Europe/Brussels', y: 2026 }), /2026-03-29 01:00 UTC[\s\S]*2026-10-25 01:00 UTC/);
assert.match(run('chinese-zodiac-finder', { d: '2024-02-10' }), /Wood Dragon/);
assert.match(run('ohms-law-calculator', { V: '12', I: '', R: '470', P: '' }), /25\.53191489 mA/);
assert.match(run('sunrise-sunset-calculator', { lat: 50.85, lon: 4.35, date: '2026-06-21', tz: 'UTC' }), /Sunrise: +21\/06\/2026 03:2/);
assert.match(run('moon-phase-calculator', { date: '2026-10-23', month: false }), /2026-10-26 04:1/);
assert.match(run('recipe-scaler', {}, ['1 1/2 cups flour\n3/4 tsp salt']), /2 1\/4 cups flour\n1 1\/8 tsp salt/);
assert.match(run('hours-minutes-decimal-converter', {}, ['2:45']), /2\.75 h/);
assert.match(run('ics-event-file-creator', {}).text, /DTSTART:20260615T080000Z/);
console.log('new17 ok');
