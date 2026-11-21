// Shareable tool state in the query string. Keys: i, i2, i3... = inputs; option id = option value (booleans 1/0);
// z = base64url(deflate-raw(JSON {i:[...], o:{...}})) when the plain query would exceed MAX; s = custom-tool urlState JSON.
// Option ids that collide with reserved keys are prefixed "o.".
const RESERVED = /^(i\d*|z|s)$/;
const MAX = 1800;
export const optKey = (id) => (RESERVED.test(id) ? 'o.' + id : id);
export const inKey = (n) => (n === 0 ? 'i' : 'i' + (n + 1));

const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}
export const pack = async (obj) => b64(await pipe(new TextEncoder().encode(JSON.stringify(obj)), new CompressionStream('deflate-raw')));
export const unpack = async (z) => JSON.parse(new TextDecoder().decode(await pipe(unb64(z), new DecompressionStream('deflate-raw'))));

/** state = {i:{index:string}, o:{id:string}, s?:object}; only changed entries should be passed. Returns a search string ("" or "?..."). */
export async function toSearch(state) {
  const p = new URLSearchParams();
  for (const [n, v] of Object.entries(state.i || {})) p.set(inKey(+n), v);
  for (const [id, v] of Object.entries(state.o || {})) p.set(optKey(id), v);
  if (state.s !== undefined) p.set('s', JSON.stringify(state.s));
  let q = p.toString();
  if (q.length > MAX && typeof CompressionStream === 'function') {
    try { q = new URLSearchParams({ z: await pack({ i: state.i || {}, o: state.o || {}, s: state.s }) }).toString(); } catch { /* keep the long form */ }
  }
  return q ? '?' + q : '';
}

/** Parse a search string into {i:{index:string}, o:{id:string}, s?:any}; null when nothing relevant. Throws on a broken z. */
export async function fromSearch(search, optIds = []) {
  const p = new URLSearchParams(search);
  let i = {}, o = {}, s;
  if (p.has('z')) {
    const d = await unpack(p.get('z'));
    i = d.i || {}; o = d.o || {}; s = d.s;
  }
  for (const [k, v] of p) {
    const m = /^i(\d*)$/.exec(k);
    if (m) i[m[1] ? +m[1] - 1 : 0] = v;
  }
  for (const id of optIds) if (p.has(optKey(id))) o[id] = p.get(optKey(id));
  if (p.has('s')) { try { s = JSON.parse(p.get('s')); } catch { /* ignore */ } }
  return Object.keys(i).length || Object.keys(o).length || s !== undefined ? { i, o, s } : null;
}
