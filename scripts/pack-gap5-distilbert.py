# Dev-time only. Repack a DistilBERT safetensors file into the DBS1 container used by src/tools/sentiment.js (int8 + fp16 scale per 64 inputs).
# usage: python3 -I scripts/pack-gap5-distilbert.py mlm|qa model.safetensors out.bin   (needs numpy + safetensors)
# mlm = distilbert-base-uncased (DistilBertForMaskedLM), qa = distilbert-base-cased-distilled-squad. Tensor names are those of the HF checkpoint.
import sys, json, struct, numpy as np
from safetensors import safe_open
G = 64
kind = sys.argv[1]
f = safe_open(sys.argv[2], 'np')
keys = set(f.keys())
def names():
    yield 'distilbert.embeddings.word_embeddings.weight'; yield 'distilbert.embeddings.position_embeddings.weight'
    yield 'distilbert.embeddings.LayerNorm.weight'; yield 'distilbert.embeddings.LayerNorm.bias'
    for l in range(6):
        p = f'distilbert.transformer.layer.{l}.'
        for n in ['attention.q_lin', 'attention.k_lin', 'attention.v_lin', 'attention.out_lin']: yield p + n + '.weight'; yield p + n + '.bias'
        yield p + 'sa_layer_norm.weight'; yield p + 'sa_layer_norm.bias'
        for n in ['ffn.lin1', 'ffn.lin2']: yield p + n + '.weight'; yield p + n + '.bias'
        yield p + 'output_layer_norm.weight'; yield p + 'output_layer_norm.bias'
    if kind == 'mlm':
        for n in ['vocab_transform.weight', 'vocab_transform.bias', 'vocab_layer_norm.weight', 'vocab_layer_norm.bias', 'vocab_projector.bias']: yield n
    else:
        for n in ['qa_outputs.weight', 'qa_outputs.bias']: yield n
def quant(w):
    r, c = w.shape; w2 = w.reshape(r, c // G, G)
    sc = (np.abs(w2).max(2, keepdims=True) / 127).astype(np.float16)
    s32 = np.maximum(sc.astype(np.float32), 1e-12)
    q = np.clip(np.rint(w2 / s32), -127, 127).astype(np.int8)
    return q.reshape(-1).tobytes(), sc.reshape(-1).tobytes()
def get(n):
    if n in keys: return f.get_tensor(n).astype(np.float32)
    if n.startswith('distilbert.') and n[11:] in keys: return f.get_tensor(n[11:]).astype(np.float32)
    raise KeyError(n)
blobs, tens, off = [], [], 0
for n in names():
    try: w = get(n)
    except KeyError:
        # tied projector: vocab_projector.weight == word embeddings (not stored separately); bias must exist
        raise
    if w.ndim == 2 and not n.startswith('qa_outputs'):
        a, b = quant(w); data = a + b; t = 'q'
    else:
        data = w.tobytes(); t = 'f'
    data += b'\0' * ((-len(data)) % 4)
    tens.append({'n': n, 's': list(w.shape), 't': t, 'o': off}); blobs.append(data); off += len(data)
vocab = tens[0]['s'][0]
hdr = json.dumps({'group': G, 'dim': 768, 'ffn': 3072, 'heads': 12, 'layers': 6, 'maxPos': 512, 'vocab': vocab, 'kind': kind, 'tensors': tens}, separators=(',', ':')).encode()
hdr += b' ' * ((-(8 + len(hdr))) % 4)
open(sys.argv[3], 'wb').write(b'DBS1' + struct.pack('<I', len(hdr)) + hdr + b''.join(blobs))
