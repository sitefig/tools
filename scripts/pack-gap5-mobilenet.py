# Dev-time only. Packs timm/mobilenetv2_100.ra_in1k (Apache-2.0) into data/mobilenetv2-100-ra-in1k.bin with batch norm folded into the convolutions,
# and writes data/imagenet-labels.json (timm's ImageNet-1k label names).
# usage: python3 scripts/pack-gap5-mobilenet.py model.safetensors out.bin labels.json   (needs torch, timm, safetensors)
# Format (little endian): "MNV2", u32 headerLen, JSON header (space padded to 4), blobs. Header: {ops:[...]}. Conv op: {op:'conv', cin, cout, k, s, p, g, act:'relu6'|'', res:'start'|'end'|'', w:offset, b:offset}.
# weights are float16 [cout][cin/g][k][k], biases float32.
import sys, json, struct, numpy as np, torch, timm
from safetensors.torch import load_file
m = timm.create_model('mobilenetv2_100', pretrained=False, num_classes=1000)
m.load_state_dict(load_file(sys.argv[1])); m.eval()
blobs, off = [], 0
def add(a):
    global off
    b = a.tobytes(); b += b'\0' * ((-len(b)) % 4); blobs.append(b); o = off; off += len(b); return o
def fold(conv, bn):
    w = conv.weight.detach().double(); g = bn.weight.detach().double(); bt = bn.bias.detach().double()
    mu = bn.running_mean.double(); var = bn.running_var.double(); s = g / torch.sqrt(var + bn.eps)
    return (w * s.view(-1, 1, 1, 1)).float().numpy(), (bt - mu * s).float().numpy()
ops = []
def conv_op(conv, bn, act, res=''):
    w, b = fold(conv, bn)
    ops.append({'op': 'conv', 'cin': conv.in_channels, 'cout': conv.out_channels, 'k': conv.kernel_size[0], 's': conv.stride[0], 'p': conv.padding[0], 'g': conv.groups, 'act': act, 'res': res, 'w': add(w.astype(np.float16)), 'b': add(b.astype(np.float32))})
conv_op(m.conv_stem, m.bn1, 'relu6')
for stage in m.blocks:
    for blk in stage:
        residual = getattr(blk, 'has_skip', False)
        if hasattr(blk, 'conv_pwl'):  # inverted residual
            conv_op(blk.conv_pw, blk.bn1, 'relu6', 'start' if residual else ''); conv_op(blk.conv_dw, blk.bn2, 'relu6'); conv_op(blk.conv_pwl, blk.bn3, '', 'end' if residual else '')
        else:  # depthwise separable
            conv_op(blk.conv_dw, blk.bn1, 'relu6', 'start' if residual else ''); conv_op(blk.conv_pw, blk.bn2, '', 'end' if residual else '')
conv_op(m.conv_head, m.bn2, 'relu6')
ops.append({'op': 'pool'})
ops.append({'op': 'fc', 'cin': m.classifier.in_features, 'cout': m.classifier.out_features, 'w': add(m.classifier.weight.detach().float().numpy().astype(np.float16)), 'b': add(m.classifier.bias.detach().float().numpy().astype(np.float32))})
hdr = json.dumps({'ops': ops, 'mean': [0.485, 0.456, 0.406], 'std': [0.229, 0.224, 0.225], 'size': 224, 'crop': 0.875}, separators=(',', ':')).encode()
hdr += b' ' * ((-(8 + len(hdr))) % 4)
open(sys.argv[2], 'wb').write(b'MNV2' + struct.pack('<I', len(hdr)) + hdr + b''.join(blobs))
from timm.data import ImageNetInfo
info = ImageNetInfo(); json.dump([info.index_to_description(i) for i in range(1000)], open(sys.argv[3], 'w'), ensure_ascii=False, separators=(',', ':'))
print('ops', len(ops), 'bytes', 8 + len(hdr) + off)
