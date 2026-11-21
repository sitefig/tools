# Dev-time only. Packs HuggingFaceTB/SmolLM2-135M-Instruct (Apache-2.0) into data/smollm2-135m-instruct-q4.bin and data/smollm2-vocab.json for src/gap5lib/llm.js.
# usage: python3 -I scripts/pack-gap5-smollm.py <dir with model.safetensors, config.json, tokenizer.json> <out dir> [--dequantized-out file.safetensors]   (needs numpy + torch + safetensors)
# Container "SLM1": u32 headerLen, JSON header (space padded to 4), blobs. Every 2-D weight (incl. the tied token embedding) is symmetric 4-bit round-to-nearest, group 32 along the
# input dimension: q = clip(round(w/s), -8, 7), s = max|w|/7 stored as float16; two values per byte (low nibble first, value+8). Norm weights stay float32.
# --dequantized-out writes the same weights dequantised to float32 so test fixtures can be made with PyTorch from exactly the weights the JS engine uses.
import sys, os, json, struct, numpy as np
from safetensors import safe_open
src, out = sys.argv[1], sys.argv[2]; G = 32
f = safe_open(os.path.join(src, 'model.safetensors'), 'pt'); cfg = json.load(open(os.path.join(src, 'config.json')))
tens, blobs, off, deq = [], [], 0, {}
def q4(w):
    r, c = w.shape; w2 = w.reshape(r, c // G, G)
    sc = (np.abs(w2).max(2, keepdims=True) / 7).astype(np.float16); s32 = np.maximum(sc.astype(np.float32), 1e-12)
    q = np.clip(np.rint(w2 / s32), -8, 7).astype(np.int8)
    d = (q.astype(np.float32) * sc.astype(np.float32)).reshape(r, c)
    u = (q.reshape(-1) + 8).astype(np.uint8); packed = (u[0::2] | (u[1::2] << 4)).astype(np.uint8)
    return packed.tobytes(), sc.reshape(-1).tobytes(), d
for k in sorted(f.keys()):
    w = f.get_tensor(k).float().numpy()
    if w.ndim == 2:
        a, b, d = q4(w); data = a + b; kind = 'q'; deq[k] = d
    else: data = w.tobytes(); kind = 'f'; deq[k] = w
    data += b'\0' * ((-len(data)) % 4); tens.append({'n': k, 's': list(w.shape), 't': kind, 'o': off}); blobs.append(data); off += len(data)
hdr = json.dumps({'group': G, 'dim': cfg['hidden_size'], 'ffn': cfg['intermediate_size'], 'layers': cfg['num_hidden_layers'], 'heads': cfg['num_attention_heads'], 'kv_heads': cfg['num_key_value_heads'], 'vocab': cfg['vocab_size'],
  'rope_theta': cfg['rope_theta'], 'eps': cfg['rms_norm_eps'], 'tensors': tens}, separators=(',', ':')).encode()
hdr += b' ' * ((-(4 + len(hdr))) % 4)
open(os.path.join(out, 'smollm2-135m-instruct-q4.bin'), 'wb').write(b'SLM1' + struct.pack('<I', len(hdr)) + hdr + b''.join(blobs))
tk = json.load(open(os.path.join(src, 'tokenizer.json'))); m = tk['model']
vocab = [''] * cfg['vocab_size']
for t, i in m['vocab'].items(): vocab[i] = t
for a in tk['added_tokens']: vocab[a['id']] = a['content']
json.dump({'vocab': vocab, 'merges': [x if isinstance(x, str) else ' '.join(x) for x in m['merges']]}, open(os.path.join(out, 'smollm2-vocab.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
if '--dequantized-out' in sys.argv:
    from safetensors.numpy import save_file
    save_file(deq, sys.argv[sys.argv.index('--dequantized-out') + 1])
print('bytes', os.path.getsize(os.path.join(out, 'smollm2-135m-instruct-q4.bin')))
