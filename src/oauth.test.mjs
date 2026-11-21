import assert from 'node:assert';
import { challenge } from './oauth.js';
// RFC 7636 appendix B vector
assert.strictEqual(await challenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
console.log('ok');
