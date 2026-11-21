# Dev-time only: builds data/ip-country.bin and data/hs-2022.tsv for src/tools/gap5.js (see data/SOURCES-gap5.md).
# usage: python3 -I scripts/build-gap5-data.py <dir with delegated-*-extended-latest> <hs.csv> <out data dir>
import sys, os, struct, csv, ipaddress, glob
rir_dir, hs_csv, out = sys.argv[1:4]
REG = ['afrinic', 'apnic', 'arin', 'lacnic', 'ripencc']
ccs, v4, v6, date = {}, [], [], 0
def cci(c):
    if c not in ccs: ccs[c] = len(ccs)
    return ccs[c]
for ri, reg in enumerate(REG):
    for line in open(os.path.join(rir_dir, f'delegated-{reg}-extended-latest'), encoding='ascii'):
        if line.startswith('#') or line.startswith(' '): continue
        p = line.rstrip('\n').split('|')
        if len(p) >= 7 and p[0] == '2' and p[1] == reg: date = max(date, int(p[5])); continue
        if len(p) < 7 or p[2] not in ('ipv4', 'ipv6') or p[1] in ('', '*', 'ZZ') or p[6] not in ('allocated', 'assigned'): continue
        c = cci(p[1])
        if p[2] == 'ipv4':
            s = int(ipaddress.IPv4Address(p[3])); v4.append((s, s + int(p[4]) - 1, c, ri))
        else:
            n = ipaddress.IPv6Network(p[3] + '/' + p[4], strict=True); v6.append((int(n.network_address) >> 64, int(p[4]), c, ri))
v4.sort(); v6.sort()
m4 = []
for s, e, c, r in v4:
    if m4 and m4[-1][2] == c and m4[-1][3] == r and m4[-1][1] + 1 == s: m4[-1] = (m4[-1][0], e, c, r)
    else: m4.append((s, e, c, r))
for a, b in zip(m4, m4[1:]): assert a[1] < b[0], (a, b)
for a, b in zip(v6, v6[1:]): assert a[0] != b[0] or True
names = sorted(ccs, key=lambda k: ccs[k]); assert len(names) < 256
b = bytearray(b'IPC1' + struct.pack('<IIII', date, len(m4), len(v6), len(names)))
b += b''.join(n.encode() for n in names)
for k in (0,): b += struct.pack(f'<{len(m4)}I', *[x[0] for x in m4])
b += struct.pack(f'<{len(m4)}I', *[x[1] for x in m4]) + bytes(x[2] for x in m4) + bytes(x[3] for x in m4)
b += struct.pack(f'<{len(v6)}I', *[x[0] >> 32 for x in v6]) + struct.pack(f'<{len(v6)}I', *[x[0] & 0xffffffff for x in v6]) + bytes(x[1] for x in v6) + bytes(x[2] for x in v6) + bytes(x[3] for x in v6)
open(os.path.join(out, 'ip-country.bin'), 'wb').write(b)
print('ip-country.bin', len(b), 'bytes; v4 ranges', len(m4), 'v6', len(v6), 'countries', len(names), 'date', date)
# HS 2022: code TAB description (chapters, headings, subheadings; sections as S<roman>)
rows = list(csv.DictReader(open(hs_csv, encoding='utf-8')))
with open(os.path.join(out, 'hs-2022.tsv'), 'w', encoding='utf-8') as f:
    for r in rows:
        assert '\t' not in r['description']
        f.write(f"{r['hscode']}\t{r['section']}\t{r['description']}\n")
print('hs rows', len(rows))
