# Dev-time only. Packs openai/whisper-tiny.en (HF safetensors) into data/whisper-tiny-en.bin and data/whisper-tiny-en-vocab.json for src/gap5lib/whisper.js.
# usage: python3 -I scripts/pack-gap5-whisper.py <dir with model.safetensors, vocab.json, added_tokens.json, preprocessor_config.json, generation_config.json> <out dir>   (needs numpy + safetensors)
# Container "WHP1": u32 headerLen, JSON header (space padded to 4), tensor blobs (4-byte aligned). 2-D matrices of the transformer layers and the token embedding:
# int8 [rows*cols] row-major + fp16 scale per 64 inputs (symmetric); everything else float32. The 80x201 mel filter bank of the HF feature extractor is stored as 'mel_filters'.
import sys, os, json, struct, numpy as np
from safetensors import safe_open
src, out = sys.argv[1], sys.argv[2]
f = safe_open(os.path.join(src, 'model.safetensors'), 'np'); G = 64
pre = json.load(open(os.path.join(src, 'preprocessor_config.json'))); gen = json.load(open(os.path.join(src, 'generation_config.json')))
cfg = json.load(open(os.path.join(src, 'config.json')))
def quant(w):
    r, c = w.shape; w2 = w.reshape(r, c // G, G)
    sc = (np.abs(w2).max(2, keepdims=True) / 127).astype(np.float16); s32 = np.maximum(sc.astype(np.float32), 1e-12)
    return np.clip(np.rint(w2 / s32), -127, 127).astype(np.int8).reshape(-1).tobytes(), sc.reshape(-1).tobytes()
tens, blobs, off = [], [], 0
def put(name, arr, kind):
    global off
    if kind == 'q': a, b = quant(arr); data = a + b
    else: data = arr.astype(np.float32).tobytes()
    data += b'\0' * ((-len(data)) % 4); tens.append({'n': name, 's': list(arr.shape), 't': kind, 'o': off}); blobs.append(data); off += len(data)
for k in sorted(f.keys()):
    w = f.get_tensor(k).astype(np.float32)
    big = w.ndim == 2 and ('layers.' in k or k.endswith('embed_tokens.weight')) and 'layer_norm' not in k
    put(k, w, 'q' if big else 'f')
put('mel_filters', np.array(pre['mel_filters'], dtype=np.float32), 'f')
hdr = json.dumps({'group': G, 'dim': cfg['d_model'], 'heads': cfg['encoder_attention_heads'], 'enc_layers': cfg['encoder_layers'], 'dec_layers': cfg['decoder_layers'], 'vocab': cfg['vocab_size'], 'n_mels': cfg['num_mel_bins'],
  'sot': gen['decoder_start_token_id'], 'eot': gen['eos_token_id'], 'notimestamps': gen['no_timestamps_token_id'], 'suppress': gen['suppress_tokens'], 'begin_suppress': gen['begin_suppress_tokens'], 'max_len': cfg['max_target_positions'], 'tensors': tens}, separators=(',', ':')).encode()
hdr += b' ' * ((-(4 + len(hdr))) % 4)
open(os.path.join(out, 'whisper-tiny-en.bin'), 'wb').write(b'WHP1' + struct.pack('<I', len(hdr)) + hdr + b''.join(blobs))
vocab = json.load(open(os.path.join(src, 'vocab.json'))); added = json.load(open(os.path.join(src, 'added_tokens.json')))
arr = [''] * cfg['vocab_size']
for t, i in vocab.items(): arr[i] = t
for t, i in added.items(): arr[i] = t
json.dump(arr, open(os.path.join(out, 'whisper-tiny-en-vocab.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('bytes', os.path.getsize(os.path.join(out, 'whisper-tiny-en.bin')))
