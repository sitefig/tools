# Dev-time only. Repack distilbert-base-uncased-finetuned-sst-2-english model.safetensors into data/sentiment-distilbert-sst2.bin
# usage: python3 -I scripts/pack-sentiment.py model.safetensors out.bin   (needs numpy + safetensors)
# Format (little endian): "DBS1", u32 headerLen, JSON header (space padded to a multiple of 4), then tensor blobs, each 4-byte aligned.
# 2-D matrices (except classifier): int8 [rows*cols] row-major, then fp16 scales [rows*cols/64] (symmetric, one scale per 64 consecutive
# inputs of a row, scale = max|w|/127). Everything else: float32.
import sys, json, struct, numpy as np
from safetensors import safe_open
G = 64
f = safe_open(sys.argv[1], 'np')
def names():
    yield 'distilbert.embeddings.word_embeddings.weight'; yield 'distilbert.embeddings.position_embeddings.weight'
    yield 'distilbert.embeddings.LayerNorm.weight'; yield 'distilbert.embeddings.LayerNorm.bias'
    for l in range(6):
        p = f'distilbert.transformer.layer.{l}.'
        for n in ['attention.q_lin', 'attention.k_lin', 'attention.v_lin', 'attention.out_lin']: yield p + n + '.weight'; yield p + n + '.bias'
        yield p + 'sa_layer_norm.weight'; yield p + 'sa_layer_norm.bias'
        for n in ['ffn.lin1', 'ffn.lin2']: yield p + n + '.weight'; yield p + n + '.bias'
        yield p + 'output_layer_norm.weight'; yield p + 'output_layer_norm.bias'
    for n in ['pre_classifier.weight', 'pre_classifier.bias', 'classifier.weight', 'classifier.bias']: yield n
def quant(w):
    r, c = w.shape; w2 = w.reshape(r, c // G, G)
    sc = (np.abs(w2).max(2, keepdims=True) / 127).astype(np.float16)
    s32 = np.maximum(sc.astype(np.float32), 1e-12)
    q = np.clip(np.rint(w2 / s32), -127, 127).astype(np.int8)
    return q.reshape(-1).tobytes(), sc.reshape(-1).tobytes()
blobs, tens, off = [], [], 0
for n in names():
    w = f.get_tensor(n).astype(np.float32)
    if w.ndim == 2 and not n.startswith('classifier'):
        a, b = quant(w); data = a + b; t = 'q'
    else:
        data = w.tobytes(); t = 'f'
    pad = (-len(data)) % 4; data += b'\0' * pad
    tens.append({'n': n, 's': list(w.shape), 't': t, 'o': off}); blobs.append(data); off += len(data)
hdr = json.dumps({'group': G, 'dim': 768, 'ffn': 3072, 'heads': 12, 'layers': 6, 'maxPos': 512, 'vocab': 30522, 'tensors': tens}, separators=(',', ':')).encode()
hdr += b' ' * ((-(8 + len(hdr))) % 4)
open(sys.argv[2], 'wb').write(b'DBS1' + struct.pack('<I', len(hdr)) + hdr + b''.join(blobs))
