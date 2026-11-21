// Second-pass tools for rows first skipped in free-browser-tools.md (peerreview/new-list/pass2-A.md). See TOOLS.md.
// Data files (same-origin, lazily fetched, sources in data/SOURCES-pass2.md): data/oui.tsv, data/tlds.tsv, data/bsc-bright.tsv.
// Skipped: 838 IP geolocation enricher (needs a BGP prefix-to-ASN table, ~8 MB+), 1469 Time Zone Map (boundary polygons, ODbL
// share-alike and size). Details: peerreview/new-list/pass2-A.md
const T = [];
const NET = 'Network & HTTP', REF = 'Reference', COL = 'Color', DT = 'Date & Time', SCI = 'Math & Science';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const need = (t, what = 'some input') => { if (!String(t ?? '').trim()) throw new Error(`Paste ${what} first.`); return String(t); };
const lines = (t) => String(t).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const optNum = (v, d, lo = -Infinity, hi = Infinity) => { const n = Number(v); return v === '' || v == null || !Number.isFinite(n) ? d : Math.min(hi, Math.max(lo, n)); };

// Lazily load a same-origin data file as text (browser: fetch; Node tests: fs). Cached per file.
const _data = {};
function dataText(name) {
  return (_data[name] ||= (async () => {
    const url = new URL('../../data/' + name, import.meta.url);
    if (typeof window === 'undefined') { const fs = await import('node:fs/promises'); return fs.readFile(url, 'utf8'); }
    const r = await fetch(url); if (!r.ok) throw new Error(`Could not load ${name} (HTTP ${r.status}).`);
    return r.text();
  })());
}

// ---------------------------------------------------------------- 646 MAC address vendor lookup
let _oui;
async function ouiMap() {
  return (_oui ||= (async () => {
    const m = new Map();
    for (const l of (await dataText('oui.tsv')).split('\n')) { if (!l) continue; const i = l.indexOf('\t'); m.set(l.slice(0, i), l.slice(i + 1)); }
    return m;
  })());
}
T.push({
  id: 'mac-address-vendor-lookup', cat: NET, title: 'MAC Address Vendor Lookup (IEEE OUI)',
  desc: 'Find the company behind a MAC address or OUI prefix using a bundled copy of the IEEE MA-L, MA-M and MA-S public listings. Works offline, flags randomised (locally administered) addresses.',
  inputs: 1, labels: ['MAC addresses or OUI prefixes, one per line'], placeholder: ['00:1B:63:84:45:E6\nF4-F5-D8-12-34-56\n001A.2B3C.4D5E\nB827EB'],
  sample: '00:1B:63:84:45:E6\nF4-F5-D8-12-34-56\nB8:27:EB:01:02:03\n3C:5A:B4:11:22:33\n02:42:ac:11:00:02\n70:B3:D5:12:34:56\nFF:FF:FF:FF:FF:FF',
  run: async ([inp]) => {
    const rows = lines(need(inp, 'one or more MAC addresses')).slice(0, 2000), map = await ouiMap(), out = [];
    for (const raw of rows) {
      const hex = raw.replace(/^0x/i, '').replace(/[^0-9a-f]/gi, '').toUpperCase();
      if (hex.length < 6 || /[^0-9a-fx:.\-\s_]/i.test(raw)) { out.push(`${raw}\n  not a MAC address or OUI (need at least 6 hex digits)`); continue; }
      const b0 = parseInt(hex.slice(0, 2), 16), local = !!(b0 & 2), multi = !!(b0 & 1);
      const flags = [local ? 'locally administered (often randomised or virtual: the vendor prefix may be meaningless)' : 'universally administered', multi ? 'group/multicast bit set' : 'unicast'].join(', ');
      let reg = '', name;
      for (const [len, r] of [[9, 'MA-S'], [7, 'MA-M'], [6, 'MA-L']]) { if (hex.length >= len && map.has(hex.slice(0, len))) { name = map.get(hex.slice(0, len)); reg = `${r} ${hex.slice(0, len)}`; break; } }
      const pretty = hex.match(/.{1,2}/g).join(':');
      let v;
      if (name === undefined) v = local ? 'no registry match (expected: locally administered address)' : 'no match in the bundled IEEE listing';
      else if (name === '') v = 'privately registered (the company name is not published)';
      else v = name;
      let note = '';
      if (name === 'IEEE Registration Authority' && hex.length < 9) note = '\n  note: this block is sub-allocated; paste the full address (at least 9 hex digits) to find the holder';
      out.push(`${pretty}\n  vendor: ${v}${reg ? `\n  block: ${reg}` : ''}\n  bits: ${flags}${note}`);
    }
    return out.join('\n\n') + `\n\nData: IEEE Registration Authority public listings (MA-L, MA-M, MA-S), retrieved 2026-10-23, ${map.size.toLocaleString('en')} blocks. Company addresses are not included. Newer assignments are missing until the bundle is refreshed.`;
  },
});

// ---------------------------------------------------------------- TLD info
let _tld;
async function tldMap() {
  return (_tld ||= (async () => {
    const m = new Map(); let ver = '';
    for (const l of (await dataText('tlds.tsv')).split('\n')) {
      if (!l) continue; if (l[0] === '#') { ver = l.slice(2); continue; }
      const [p, u, type, mgr] = l.split('\t'); m.set(p, { p, u, type, mgr });
      if (u) m.set(u, m.get(p));
    }
    m.ver = ver; return m;
  })());
}
const lastLabel = (s) => {
  let h = s.trim(); h = h.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^[^@/]*@/, '').split(/[/?#:\s]/)[0].replace(/\.$/, '');
  if (!h) return '';
  try { h = new URL('http://' + h).hostname; } catch { /* keep as typed */ }
  return h.split('.').pop().toLowerCase();
};
T.push({
  id: 'tld-info-lookup', cat: NET, title: 'TLD Info Lookup (IANA Root Zone: Type, Manager, Punycode)',
  desc: 'Look up any top-level domain, domain, URL or email address in a bundled copy of the IANA root zone list: type (generic, country code, special use), registry manager and the punycode and Unicode forms.',
  inputs: 1, labels: ['TLDs, domains, URLs or emails, one per line'], placeholder: ['.com\nexample.co.uk\nhttps://пример.рф/\nname@site.xyz'],
  sample: '.com\nexample.co.uk\nhttps://пример.рф/page\nname@site.xyz\nрф\n.arpa\nnotatld',
  run: async ([inp]) => {
    const map = await tldMap(), out = [];
    for (const raw of lines(need(inp, 'one or more domains or TLDs')).slice(0, 2000)) {
      const lab = lastLabel(raw);
      const e = map.get(lab);
      if (!e) { out.push(`${raw}\n  .${lab || '?'} is not in the IANA root zone list (${map.ver.split(',')[0]}); it may be a new, retired or invalid TLD`); continue; }
      out.push(`${raw}\n  TLD: .${e.u || e.p}${e.u ? `\n  punycode: .${e.p}` : ''}\n  type: ${e.type}\n  manager: ${e.mgr || '(not assigned)'}`);
    }
    return out.join('\n\n') + `\n\nSource: IANA tlds-alpha-by-domain.txt (${map.ver}) and the IANA Root Zone Database page, retrieved 2026-10-23. Second-level suffixes such as co.uk are not in the root zone; they come from the Public Suffix List, which is a different dataset.`;
  },
});

// ---------------------------------------------------------------- 1360 swatch matcher (xkcd colour survey names, CC0)
const XKCD = 'cloudy blue:acc2d9|dark pastel green:56ae57|dust:b2996e|electric lime:a8ff04|fresh green:69d84f|light eggplant:894585|nasty green:70b23f|really light blue:d4ffff|tea:65ab7c|warm purple:952e8f|yellowish tan:fcfc81|cement:a5a391|dark grass green:388004|dusty teal:4c9085|grey teal:5e9b8a|macaroni and cheese:efb435|pinkish tan:d99b82|spruce:0a5f38|strong blue:0c06f7|toxic green:61de2a|windows blue:3778bf|blue blue:2242c7|blue with a hint of purple:533cc6|booger:9bb53c|bright sea green:05ffa6|dark green blue:1f6357|deep turquoise:017374|green teal:0cb577|strong pink:ff0789|bland:afa88b|deep aqua:08787f|lavender pink:dd85d7|light moss green:a6c875|light seafoam green:a7ffb5|olive yellow:c2b709|pig pink:e78ea5|deep lilac:966ebd|desert:ccad60|dusty lavender:ac86a8|purpley grey:947e94|purply:983fb2|candy pink:ff63e9|light pastel green:b2fba5|boring green:63b365|kiwi green:8ee53f|light grey green:b7e1a1|orange pink:ff6f52|tea green:bdf8a3|very light brown:d3b683|egg shell:fffcc4|eggplant purple:430541|powder pink:ffb2d0|reddish grey:997570|baby shit brown:ad900d|liliac:c48efd|stormy blue:507b9c|ugly brown:7d7103|custard:fffd78|darkish pink:da467d|deep brown:410200|greenish beige:c9d179|manilla:fffa86|off blue:5684ae|battleship grey:6b7c85|browny green:6f6c0a|bruise:7e4071|kelley green:009337|sickly yellow:d0e429|sunny yellow:fff917|azul:1d5dec|darkgreen:054907|green/yellow:b5ce08|lichen:8fb67b|light light green:c8ffb0|pale gold:fdde6c|sun yellow:ffdf22|tan green:a9be70|burple:6832e3|butterscotch:fdb147|toupe:c7ac7d|dark cream:fff39a|indian red:850e04|light lavendar:efc0fe|poison green:40fd14|baby puke green:b6c406|bright yellow green:9dff00|charcoal grey:3c4142|squash:f2ab15|cinnamon:ac4f06|light pea green:c4fe82|radioactive green:2cfa1f|raw sienna:9a6200|baby purple:ca9bf7|cocoa:875f42|light royal blue:3a2efe|orangeish:fd8d49|rust brown:8b3103|sand brown:cba560|swamp:698339|tealish green:0cdc73|burnt siena:b75203|camo:7f8f4e|dusk blue:26538d|fern:63a950|old rose:c87f89|pale light green:b1fc99|peachy pink:ff9a8a|rosy pink:f6688e|light bluish green:76fda8|light bright green:53fe5c|light neon green:4efd54|light seafoam:a0febf|tiffany blue:7bf2da|washed out green:bcf5a6|browny orange:ca6b02|nice blue:107ab0|sapphire:2138ab|greyish teal:719f91|orangey yellow:fdb915|parchment:fefcaf|straw:fcf679|very dark brown:1d0200|terracota:cb6843|ugly blue:31668a|clear blue:247afd|creme:ffffb6|foam green:90fda9|grey/green:86a17d|light gold:fddc5c|seafoam blue:78d1b6|topaz:13bbaf|violet pink:fb5ffc|wintergreen:20f986|yellow tan:ffe36e|dark fuchsia:9d0759|indigo blue:3a18b1|light yellowish green:c2ff89|pale magenta:d767ad|rich purple:720058|sunflower yellow:ffda03|green/blue:01c08d|leather:ac7434|racing green:014600|vivid purple:9900fa|dark royal blue:02066f|hazel:8e7618|muted pink:d1768f|booger green:96b403|canary:fdff63|cool grey:95a3a6|dark taupe:7f684e|darkish purple:751973|true green:089404|coral pink:ff6163|dark sage:598556|dark slate blue:214761|flat blue:3c73a8|mushroom:ba9e88|rich blue:021bf9|dirty purple:734a65|greenblue:23c48b|icky green:8fae22|light khaki:e6f2a2|warm blue:4b57db|dark hot pink:d90166|deep sea blue:015482|carmine:9d0216|dark yellow green:728f02|pale peach:ffe5ad|plum purple:4e0550|golden rod:f9bc08|neon red:ff073a|old pink:c77986|very pale blue:d6fffe|blood orange:fe4b03|grapefruit:fd5956|sand yellow:fce166|clay brown:b2713d|dark blue grey:1f3b4d|flat green:699d4c|light green blue:56fca2|warm pink:fb5581|dodger blue:3e82fc|gross green:a0bf16|ice:d6fffa|metallic blue:4f738e|pale salmon:ffb19a|sap green:5c8b15|algae:54ac68|bluey grey:89a0b0|greeny grey:7ea07a|highlighter green:1bfc06|light light blue:cafffb|light mint:b6ffbb|raw umber:a75e09|vivid blue:152eff|deep lavender:8d5eb7|dull teal:5f9e8f|light greenish blue:63f7b4|mud green:606602|pinky:fc86aa|red wine:8c0034|shit green:758000|tan brown:ab7e4c|darkblue:030764|rosa:fe86a4|lipstick:d5174e|pale mauve:fed0fc|claret:680018|dandelion:fedf08|orangered:fe420f|poop green:6f7c00|ruby:ca0147|dark:1b2431|greenish turquoise:00fbb0|pastel red:db5856|piss yellow:ddd618|bright cyan:41fdfe|dark coral:cf524e|algae green:21c36f|darkish red:a90308|reddy brown:6e1005|blush pink:fe828c|camouflage green:4b6113|lawn green:4da409|putty:beae8a|vibrant blue:0339f8|dark sand:a88f59|purple/blue:5d21d0|saffron:feb209|twilight:4e518b|warm brown:964e02|bluegrey:85a3b2|bubble gum pink:ff69af|duck egg blue:c3fbf4|greenish cyan:2afeb7|petrol:005f6a|royal:0c1793|butter:ffff81|dusty orange:f0833a|off yellow:f1f33f|pale olive green:b1d27b|orangish:fc824a|leaf:71aa34|light blue grey:b7c9e2|dried blood:4b0101|lightish purple:a552e6|rusty red:af2f0d|lavender blue:8b88f8|light grass green:9af764|light mint green:a6fbb2|sunflower:ffc512|velvet:750851|brick orange:c14a09|lightish red:fe2f4a|pure blue:0203e2|twilight blue:0a437a|violet red:a50055|yellowy brown:ae8b0c|carnation:fd798f|muddy yellow:bfac05|dark seafoam green:3eaf76|deep rose:c74767|dusty red:b9484e|grey/blue:647d8e|lemon lime:bffe28|purple/pink:d725de|brown yellow:b29705|purple brown:673a3f|wisteria:a87dc2|banana yellow:fafe4b|lipstick red:c0022f|water blue:0e87cc|brown grey:8d8468|vibrant purple:ad03de|baby green:8cff9e|barf green:94ac02|eggshell blue:c4fff7|sandy yellow:fdee73|cool green:33b864|pale:fff9d0|blue/grey:758da3|hot magenta:f504c9|greyblue:77a1b5|purpley:8756e4|baby shit green:889717|brownish pink:c27e79|dark aquamarine:017371|diarrhea:9f8303|light mustard:f7d560|pale sky blue:bdf6fe|turtle green:75b84f|bright olive:9cbb04|dark grey blue:29465b|greeny brown:696006|lemon green:adf802|light periwinkle:c1c6fc|seaweed green:35ad6b|sunshine yellow:fffd37|ugly purple:a442a0|medium pink:f36196|puke brown:947706|very light pink:fff4f2|viridian:1e9167|bile:b5c306|faded yellow:feff7f|very pale green:cffdbc|vibrant green:0add08|bright lime:87fd05|spearmint:1ef876|light aquamarine:7bfdc7|light sage:bcecac|yellowgreen:bbf90f|baby poo:ab9004|dark seafoam:1fb57a|deep teal:00555a|heather:a484ac|rust orange:c45508|dirty blue:3f829d|fern green:548d44|bright lilac:c95efb|weird green:3ae57f|peacock blue:016795|avocado green:87a922|faded orange:f0944d|grape purple:5d1451|hot green:25ff29|lime yellow:d0fe1d|mango:ffa62b|shamrock:01b44c|bubblegum:ff6cb5|purplish brown:6b4247|vomit yellow:c7c10c|pale cyan:b7fffa|key lime:aeff6e|tomato red:ec2d01|lightgreen:76ff7b|merlot:730039|night blue:040348|purpleish pink:df4ec8|apple:6ecb3c|baby poop green:8f9805|green apple:5edc1f|heliotrope:d94ff5|yellow/green:c8fd3d|almost black:070d0d|cool blue:4984b8|leafy green:51b73b|mustard brown:ac7e04|dusk:4e5481|dull brown:876e4b|frog green:58bc08|vivid green:2fef10|bright light green:2dfe54|fluro green:0aff02|kiwi:9cef43|seaweed:18d17b|navy green:35530a|ultramarine blue:1805db|iris:6258c4|pastel orange:ff964f|yellowish orange:ffab0f|perrywinkle:8f8ce7|tealish:24bca8|dark plum:3f012c|pear:cbf85f|pinkish orange:ff724c|midnight purple:280137|light urple:b36ff6|dark mint:48c072|greenish tan:bccb7a|light burgundy:a8415b|turquoise blue:06b1c4|ugly pink:cd7584|sandy:f1da7a|electric pink:ff0490|muted purple:805b87|mid green:50a747|greyish:a8a495|neon yellow:cfff04|banana:ffff7e|carnation pink:ff7fa7|tomato:ef4026|sea:3c9992|muddy brown:886806|turquoise green:04f489|buff:fef69e|fawn:cfaf7b|muted blue:3b719f|pale rose:fdc1c5|dark mint green:20c073|amethyst:9b5fc0|blue/green:0f9b8e|chestnut:742802|sick green:9db92c|pea:a4bf20|rusty orange:cd5909|stone:ada587|rose red:be013c|pale aqua:b8ffeb|deep orange:dc4d01|earth:a2653e|mossy green:638b27|grassy green:419c03|pale lime green:b1ff65|light grey blue:9dbcd4|pale grey:fdfdfe|asparagus:77ab56|blueberry:464196|purple red:990147|pale lime:befd73|greenish teal:32bf84|caramel:af6f09|deep magenta:a0025c|light peach:ffd8b1|milk chocolate:7f4e1e|ocher:bf9b0c|off green:6ba353|purply pink:f075e6|lightblue:7bc8f6|dusky blue:475f94|golden:f5bf03|light beige:fffeb6|butter yellow:fffd74|dusky purple:895b7b|french blue:436bad|ugly yellow:d0c101|greeny yellow:c6f808|orangish red:f43605|shamrock green:02c14d|orangish brown:b25f03|tree green:2a7e19|deep violet:490648|gunmetal:536267|blue/purple:5a06ef|cherry:cf0234|sandy brown:c4a661|warm grey:978a84|dark indigo:1f0954|midnight:03012d|bluey green:2bb179|grey pink:c3909b|soft purple:a66fb5|blood:770001|brown red:922b05|medium grey:7d7f7c|berry:990f4b|poo:8f7303|purpley pink:c83cb9|light salmon:fea993|snot:acbb0d|easter purple:c071fe|light yellow green:ccfd7f|dark navy blue:00022e|drab:828344|light rose:ffc5cb|rouge:ab1239|purplish red:b0054b|slime green:99cc04|baby poop:937c00|irish green:019529|pink/purple:ef1de7|dark navy:000435|greeny blue:42b395|light plum:9d5783|pinkish grey:c8aca9|dirty orange:c87606|rust red:aa2704|pale lilac:e4cbff|orangey red:fa4224|primary blue:0804f9|kermit green:5cb200|brownish purple:76424e|murky green:6c7a0e|wheat:fbdd7e|very dark purple:2a0134|bottle green:044a05|watermelon:fd4659|deep sky blue:0d75f8|fire engine red:fe0002|yellow ochre:cb9d06|pumpkin orange:fb7d07|pale olive:b9cc81|light lilac:edc8ff|lightish green:61e160|carolina blue:8ab8fe|mulberry:920a4e|shocking pink:fe02a2|auburn:9a3001|bright lime green:65fe08|celadon:befdb7|pinkish brown:b17261|poo brown:885f01|bright sky blue:02ccfe|celery:c1fd95|dirt brown:836539|strawberry:fb2943|dark lime:84b701|copper:b66325|medium brown:7f5112|muted green:5fa052|robin\'s egg:6dedfd|bright aqua:0bf9ea|bright lavender:c760ff|ivory:ffffcb|very light purple:f6cefc|light navy:155084|pink red:f5054f|olive brown:645403|poop brown:7a5901|mustard green:a8b504|ocean green:3d9973|very dark blue:000133|dusty green:76a973|light navy blue:2e5a88|minty green:0bf77d|adobe:bd6c48|barney:ac1db8|jade green:2baf6a|bright light blue:26f7fd|light lime:aefd6c|dark khaki:9b8f55|orange yellow:ffad01|ocre:c69c04|maize:f4d054|faded pink:de9dac|british racing green:05480d|sandstone:c9ae74|mud brown:60460f|light sea green:98f6b0|robin egg blue:8af1fe|aqua marine:2ee8bb|dark sea green:11875d|soft pink:fdb0c0|orangey brown:b16002|cherry red:f7022a|burnt yellow:d5ab09|brownish grey:86775f|camel:c69f59|purplish grey:7a687f|marine:042e60|greyish pink:c88d94|pale turquoise:a5fbd5|pastel yellow:fffe71|bluey purple:6241c7|canary yellow:fffe40|faded red:d3494e|sepia:985e2b|coffee:a6814c|bright magenta:ff08e8|mocha:9d7651|ecru:feffca|purpleish:98568d|cranberry:9e003a|darkish green:287c37|brown orange:b96902|dusky rose:ba6873|melon:ff7855|sickly green:94b21c|silver:c5c9c7|purply blue:661aee|purpleish blue:6140ef|hospital green:9be5aa|shit brown:7b5804|mid blue:276ab3|amber:feb308|easter green:8cfd7e|soft blue:6488ea|cerulean blue:056eee|golden brown:b27a01|bright turquoise:0ffef9|red pink:fa2a55|red purple:820747|greyish brown:7a6a4f|vermillion:f4320c|russet:a13905|steel grey:6f828a|lighter purple:a55af4|bright violet:ad0afd|prussian blue:004577|slate green:658d6d|dirty pink:ca7b80|dark blue green:005249|pine:2b5d34|yellowy green:bff128|dark gold:b59410|bluish:2976bb|darkish blue:014182|dull red:bb3f3f|pinky red:fc2647|bronze:a87900|pale teal:82cbb2|military green:667c3e|barbie pink:fe46a5|bubblegum pink:fe83cc|pea soup green:94a617|dark mustard:a88905|shit:7f5f00|medium purple:9e43a2|very dark green:062e03|dirt:8a6e45|dusky pink:cc7a8b|red violet:9e0168|lemon yellow:fdff38|pistachio:c0fa8b|dull yellow:eedc5b|dark lime green:7ebd01|denim blue:3b5b92|teal blue:01889f|lightish blue:3d7afd|purpley blue:5f34e7|light indigo:6d5acf|swamp green:748500|brown green:706c11|dark maroon:3c0008|hot purple:cb00f5|dark forest green:002d04|faded blue:658cbb|drab green:749551|light lime green:b9ff66|snot green:9dc100|yellowish:faee66|light blue green:7efbb3|bordeaux:7b002c|light mauve:c292a1|ocean:017b92|marigold:fcc006|muddy green:657432|dull orange:d8863b|steel:738595|electric purple:aa23ff|fluorescent green:08ff08|yellowish brown:9b7a01|blush:f29e8e|soft green:6fc276|bright orange:ff5b00|lemon:fdff52|purple grey:866f85|acid green:8ffe09|pale lavender:eecffe|violet blue:510ac9|light forest green:4f9153|burnt red:9f2305|khaki green:728639|cerise:de0c62|faded purple:916e99|apricot:ffb16d|dark olive green:3c4d03|grey brown:7f7053|green grey:77926f|true blue:010fcc|pale violet:ceaefa|periwinkle blue:8f99fb|light sky blue:c6fcff|blurple:5539cc|green brown:544e03|bluegreen:017a79|bright teal:01f9c6|brownish yellow:c9b003|pea soup:929901|forest:0b5509|barney purple:a00498|ultramarine:2000b1|purplish:94568c|puke yellow:c2be0e|bluish grey:748b97|dark periwinkle:665fd1|dark lilac:9c6da5|reddish:c44240|light maroon:a24857|dusty purple:825f87|terra cotta:c9643b|avocado:90b134|marine blue:01386a|teal green:25a36f|slate grey:59656d|lighter green:75fd63|electric green:21fc0d|dusty blue:5a86ad|golden yellow:fec615|bright yellow:fffd01|light lavender:dfc5fe|umber:b26400|poop:7f5e00|dark peach:de7e5d|jungle green:048243|eggshell:ffffd4|denim:3b638c|yellow brown:b79400|dull purple:84597e|chocolate brown:411900|wine red:7b0323|neon blue:04d9ff|dirty green:667e2c|light tan:fbeeac|ice blue:d7fffe|cadet blue:4e7496|dark mauve:874c62|very light blue:d5ffff|grey purple:826d8c|pastel pink:ffbacd|very light green:d1ffbd|dark sky blue:448ee4|evergreen:05472a|dull pink:d5869d|aubergine:3d0734|mahogany:4a0100|reddish orange:f8481c|deep green:02590f|vomit green:89a203|purple pink:e03fd8|dusty pink:d58a94|faded green:7bb274|camo green:526525|pinky purple:c94cbe|pink purple:db4bda|brownish red:9e3623|dark rose:b5485d|mud:735c12|brownish:9c6d57|emerald green:028f1e|pale brown:b1916e|dull blue:49759c|burnt umber:a0450e|medium green:39ad48|clay:b66a50|light aqua:8cffdb|light olive green:a4be5c|brownish orange:cb7723|dark aqua:05696b|purplish pink:ce5dae|dark salmon:c85a53|greenish grey:96ae8d|jade:1fa774|ugly green:7a9703|dark beige:ac9362|emerald:01a049|pale red:d9544d|light magenta:fa5ff7|sky:82cafc|light cyan:acfffc|yellow orange:fcb001|reddish purple:910951|reddish pink:fe2c54|orchid:c875c4|dirty yellow:cdc50a|orange red:fd411e|deep red:9a0200|orange brown:be6400|cobalt blue:030aa7|neon pink:fe019a|rose pink:f7879a|greyish purple:887191|raspberry:b00149|aqua green:12e193|salmon pink:fe7b7c|tangerine:ff9408|brownish green:6a6e09|red brown:8b2e16|greenish brown:696112|pumpkin:e17701|pine green:0a481e|charcoal:343837|baby pink:ffb7ce|cornflower:6a79f7|blue violet:5d06e9|chocolate:3d1c02|greyish green:82a67d|scarlet:be0119|green yellow:c9ff27|dark olive:373e02|sienna:a9561e|pastel purple:caa0ff|terracotta:ca6641|aqua blue:02d8e9|sage green:88b378|blood red:980002|deep pink:cb0162|grass:5cac2d|moss:769958|pastel blue:a2bffe|bluish green:10a674|green blue:06b48b|dark tan:af884a|greenish blue:0b8b87|pale orange:ffa756|vomit:a2a415|forrest green:154406|dark lavender:856798|dark violet:34013f|purple blue:632de9|dark cyan:0a888a|olive drab:6f7632|pinkish:d46a7e|cobalt:1e488f|neon purple:bc13fe|light turquoise:7ef4cc|apple green:76cd26|dull green:74a662|wine:80013f|powder blue:b1d1fc|off white:ffffe4|electric blue:0652ff|dark turquoise:045c5a|blue purple:5729ce|azure:069af3|bright red:ff000d|pinkish red:f10c45|cornflower blue:5170d7|light olive:acbf69|grape:6c3461|greyish blue:5e819d|purplish blue:601ef9|yellowish green:b0dd16|greenish yellow:cdfd02|medium blue:2c6fbb|dusty rose:c0737a|light violet:d6b4fc|midnight blue:020035|bluish purple:703be7|red orange:fd3c06|dark magenta:960056|greenish:40a368|ocean blue:03719c|coral:fc5a50|cream:ffffc2|reddish brown:7f2b0a|burnt sienna:b04e0f|brick:a03623|sage:87ae73|grey green:789b73|white:ffffff|robin\'s egg blue:98eff9|moss green:658b38|steel blue:5a7d9a|eggplant:380835|light yellow:fffe7a|leaf green:5ca904|light grey:d8dcd6|puke:a5a502|pinkish purple:d648d7|sea blue:047495|pale purple:b790d4|slate blue:5b7c99|blue grey:607c8e|hunter green:0b4008|fuchsia:ed0dd9|crimson:8c000f|pale yellow:ffff84|ochre:bf9005|mustard yellow:d2bd0a|light red:ff474c|cerulean:0485d1|pale pink:ffcfdc|deep blue:040273|rust:a83c09|light teal:90e4c1|slate:516572|goldenrod:fac205|dark yellow:d5b60a|dark grey:363737|army green:4b5d16|grey blue:6b8ba4|seafoam:80f9ad|puce:a57e52|spring green:a9f971|dark orange:c65102|sand:e2ca76|pastel green:b0ff9d|mint:9ffeb0|light orange:fdaa48|bright pink:fe01b1|chartreuse:c1f80a|deep purple:36013f|dark brown:341c02|taupe:b9a281|pea green:8eab12|puke green:9aae07|kelly green:02ab2e|seafoam green:7af9ab|blue green:137e6d|khaki:aaa662|burgundy:610023|dark teal:014d4e|brick red:8f1402|royal purple:4b006e|plum:580f41|mint green:8fff9f|gold:dbb40c|baby blue:a2cffe|yellow green:c0fb2d|bright purple:be03fd|dark red:840000|pale blue:d0fefe|grass green:3f9b0b|navy:01153e|aquamarine:04d8b2|burnt orange:c04e01|neon green:0cff0c|bright blue:0165fc|rose:cf6275|light pink:ffd1df|mustard:ceb301|indigo:380282|lime:aaff32|sea green:53fca1|periwinkle:8e82fe|dark pink:cb416b|olive green:677a04|peach:ffb07c|pale green:c7fdb5|light brown:ad8150|hot pink:ff028d|black:000000|lilac:cea2fd|navy blue:001146|royal blue:0504aa|beige:e6daa6|salmon:ff796c|olive:6e750e|maroon:650021|bright green:01ff07|dark purple:35063e|mauve:ae7181|forest green:06470c|aqua:13eac9|cyan:00ffff|tan:d1b26f|dark blue:00035b|lavender:c79fef|turquoise:06c2ac|dark green:033500|violet:9a0eea|light purple:bf77f6|lime green:89fe05|grey:929591|sky blue:75bbfd|yellow:ffff14|magenta:c20078|light green:96f97b|orange:f97306|teal:029386|light blue:95d0fc|red:e50000|brown:653700|pink:ff81c0|blue:0343df|green:15b01a|purple:7e1e9c';
let _xk;
const xkcd = () => (_xk ||= XKCD.split('|').map((s) => { const i = s.lastIndexOf(':'); const hex = s.slice(i + 1); return { name: s.slice(0, i), hex, lab: rgb2lab([0, 2, 4].map((k) => parseInt(hex.slice(k, k + 2), 16))) }; }));
function rgb2lab([r, g, b]) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047, Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B, Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
// CIEDE2000, Sharma, Wu, Dalal (2005), "The CIEDE2000 colour-difference formula: implementation notes".
function de2000(l1, l2) {
  const rad = Math.PI / 180, [L1, a1, b1] = l1, [L2, a2, b2] = l2;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2, G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2, Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hp = (b, a) => (b === 0 && a === 0 ? 0 : ((Math.atan2(b, a) / rad) + 360) % 360), hp1 = hp(b1, ap1), hp2 = hp(b2, ap2);
  const dL = L2 - L1, dC = Cp2 - Cp1; let dh = 0;
  if (Cp1 * Cp2 !== 0) { dh = hp2 - hp1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(dh * rad / 2), Lb = (L1 + L2) / 2, Cpb = (Cp1 + Cp2) / 2;
  let hb = hp1 + hp2; if (Cp1 * Cp2 === 0) hb = hp1 + hp2; else if (Math.abs(hp1 - hp2) <= 180) hb /= 2; else hb = (hb + (hb < 360 ? 360 : -360)) / 2;
  const T_ = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const dTh = 30 * Math.exp(-(((hb - 275) / 25) ** 2)), Rc = 2 * Math.sqrt(Cpb ** 7 / (Cpb ** 7 + 25 ** 7));
  const Sl = 1 + 0.015 * (Lb - 50) ** 2 / Math.sqrt(20 + (Lb - 50) ** 2), Sc = 1 + 0.045 * Cpb, Sh = 1 + 0.015 * Cpb * T_, Rt = -Math.sin(2 * dTh * rad) * Rc;
  return Math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh));
}
function parseRgb(s) {
  s = s.trim().toLowerCase(); let m;
  if ((m = s.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/))) { let h = m[1]; if (h.length === 3) h = [...h].map((c) => c + c).join(''); return [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16)); }
  if ((m = s.match(/^(?:rgb\()?\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*\)?$/))) { const v = m.slice(1, 4).map(Number); if (v.every((x) => x <= 255)) return v; }
  if ((m = s.match(/^hsl\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*\)$/))) {
    const h = (+m[1] % 360) / 360, sa = Math.min(1, +m[2] / 100), l = Math.min(1, +m[3] / 100), q = l < 0.5 ? l * (1 + sa) : l + sa - l * sa, p = 2 * l - q;
    const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((x) => Math.round(x * 255));
  }
  return null;
}
T.push({
  id: 'color-swatch-matcher', cat: COL, title: 'Color Swatch Matcher (Nearest Named Colors by CIEDE2000)',
  desc: 'Match any color to the closest of 949 plain-English color names from the CC0 xkcd color survey, ranked by CIEDE2000 distance, with a swatch preview. Not a Pantone or RAL matcher: those palettes are proprietary.',
  inputs: 1, labels: ['Colors (hex, rgb(), r g b or hsl()), one per line'], placeholder: ['#e0115f\nrgb(34, 139, 34)\nhsl(200, 60%, 50%)'],
  opts: [{ id: 'n', label: 'Matches per color', type: 'number', def: 5 }],
  sample: '#e0115f\nrgb(34, 139, 34)\nhsl(200, 60%, 50%)\n#ffbf00',
  run: ([inp], o) => {
    const n = Math.round(optNum(o.n, 5, 1, 20)), list = xkcd(), rows = [];
    for (const l of lines(need(inp, 'one or more colors')).slice(0, 100)) {
      const rgb = parseRgb(l); if (!rgb) throw new Error(`Cannot read the color "${l}". Use #rrggbb, rgb(r, g, b) or hsl(h, s%, l%).`);
      const lab = rgb2lab(rgb), hex = rgb.map((x) => x.toString(16).padStart(2, '0')).join('');
      const best = list.map((c) => ({ c, d: de2000(lab, c.lab) })).sort((a, b) => a.d - b.d).slice(0, n);
      rows.push({ l, hex, best });
    }
    const html = `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui,sans-serif;margin:12px;color:#1a1a1a;background:#fff}table{border-collapse:collapse;margin:0 0 20px}th,td{padding:4px 10px;border-bottom:1px solid #ccc;text-align:left}th{background:#eee}.s{display:inline-block;width:28px;height:18px;border:1px solid #555;vertical-align:middle}h2{font-size:15px;margin:14px 0 4px}p{max-width:60ch}@media(prefers-color-scheme:dark){body{background:#161616;color:#eee}th{background:#2a2a2a}td,th{border-color:#444}}</style>` +
      rows.map((r) => `<h2><span class="s" style="background:#${r.hex}"></span> ${esc(r.l)} (#${r.hex})</h2><table><caption class="sr" style="position:absolute;left:-9999px">Nearest names for ${esc(r.l)}</caption><tr><th scope="col">Swatch</th><th scope="col">Name</th><th scope="col">Hex</th><th scope="col">Distance (dE2000)</th></tr>` +
        r.best.map((b) => `<tr><td><span class="s" style="background:#${b.c.hex}"></span></td><td>${esc(b.c.name)}</td><td>#${b.c.hex}</td><td>${b.d.toFixed(1)}</td></tr>`).join('') + '</table>').join('') +
      '<p>Distance under about 2 is hard to see, under about 5 is a close match. Names come from the xkcd color survey (CC0); they are everyday names, not a standard like Pantone or RAL. Distances assume sRGB and a D65 white point.</p>';
    return { html };
  },
});

// ---------------------------------------------------------------- 1151 public holidays (rule based, ten countries, 2015-2060)
// Rules written from each country's published holiday law/calendar and cross-checked against python-holidays 0.107 (MIT) for
// 2015-2060 and, for England and Wales, against the official GOV.UK bank-holidays.json (2019-2028). Not an official calendar.
const easter = (y) => { // Meeus/Jones/Butcher Gregorian computus
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, mo - 1, da);
};
const DAY = 86400000, WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const nth = (y, m, wd, n) => { // n>0: nth weekday of month; n=-1: last
  if (n > 0) { const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); return Date.UTC(y, m - 1, 1 + ((wd - first + 7) % 7) + 7 * (n - 1)); }
  const last = new Date(Date.UTC(y, m, 0)); return last.getTime() - ((last.getUTCDay() - wd + 7) % 7) * DAY;
};
const fx = (m, d, name, o = {}) => ({ name, f: (y) => Date.UTC(y, m - 1, d), ...o });
const es = (off, name) => ({ name, f: (y) => easter(y) + off * DAY });
const NY = fx(1, 1, "New Year's Day"), XM = fx(12, 25, 'Christmas Day'), LAB = fx(5, 1, 'Labour Day'), ASC = es(39, 'Ascension Day'), WHM = es(50, 'Whit Monday (Pentecost Monday)'),
  EM = es(1, 'Easter Monday'), ES_ = es(0, 'Easter Sunday'), GF = es(-2, 'Good Friday'), PS = es(49, 'Pentecost Sunday'), ASS = fx(8, 15, 'Assumption Day'), AS = fx(11, 1, "All Saints' Day"), B2 = fx(12, 26, 'Boxing Day / St Stephen\'s Day'), EPI = fx(1, 6, 'Epiphany'), IMM = fx(12, 8, 'Immaculate Conception');
const GBX = { // one-off England and Wales dates (GOV.UK): [year, month, day, name]; "move" replaces the regular date of a named holiday
  move: { 2020: ['Early May bank holiday', 5, 8], 2022: ['Spring bank holiday', 6, 2] },
  extra: [[2022, 6, 3, 'Platinum Jubilee bank holiday'], [2022, 9, 19, 'State Funeral of Queen Elizabeth II'], [2023, 5, 8, 'Coronation of King Charles III']],
};
const COUNTRIES = {
  BE: { name: 'Belgium', list: [NY, ES_, EM, LAB, ASC, PS, WHM, fx(7, 21, 'National Day'), ASS, AS, fx(11, 11, 'Armistice Day'), XM], note: 'Federal public holidays. Community days (11 July Flanders, 27 September French Community, 15 November German-speaking Community) are not public holidays for everyone and are not listed.' },
  FR: { name: 'France', list: [NY, EM, LAB, fx(5, 8, 'Victory in Europe Day'), ASC, WHM, fx(7, 14, 'Bastille Day'), ASS, AS, fx(11, 11, 'Armistice Day'), XM], note: 'Alsace-Moselle also observes Good Friday and 26 December; the overseas departments have extra days. Neither is listed. Whit Monday is a public holiday, but its "day of solidarity" status varies by employer.' },
  DE: { name: 'Germany (nationwide days only)', list: [NY, GF, EM, LAB, ASC, WHM, fx(10, 3, 'German Unity Day'), XM, fx(12, 26, 'Second Day of Christmas'), { name: 'Reformation Day (nationwide in 2017 only)', f: (y) => (y === 2017 ? Date.UTC(2017, 9, 31) : null) }], note: 'Each state adds its own days (for example Epiphany, Corpus Christi, All Saints, Reformation Day, Repentance Day, Women\'s Day in Berlin). Only days valid in every state are listed.' },
  NL: { name: 'Netherlands', list: [NY, GF, ES_, EM, { name: "King's Day", f: (y) => { const d = Date.UTC(y, 3, 27); return new Date(d).getUTCDay() === 0 ? d - DAY : d; } }, fx(5, 5, 'Liberation Day (day off by default only every fifth year: 2025, 2030, ...)'), ASC, PS, WHM, XM, fx(12, 26, 'Second Day of Christmas')], note: 'Liberation Day is a national holiday every year, but most employers give the day off only in years divisible by five.' },
  GB: { name: 'England and Wales', list: [{ name: "New Year's Day", f: (y) => subst(Date.UTC(y, 0, 1)) }, GF, EM, { name: 'Early May bank holiday', f: (y) => (GBX.move[y]?.[0] === 'Early May bank holiday' ? Date.UTC(y, GBX.move[y][1] - 1, GBX.move[y][2]) : nth(y, 5, 1, 1)) }, { name: 'Spring bank holiday', f: (y) => (GBX.move[y]?.[0] === 'Spring bank holiday' ? Date.UTC(y, GBX.move[y][1] - 1, GBX.move[y][2]) : nth(y, 5, 1, -1)) }, { name: 'Summer bank holiday', f: (y) => nth(y, 8, 1, -1) }, { name: 'Christmas Day', f: (y) => subst(Date.UTC(y, 11, 25)) }, { name: 'Boxing Day', f: (y) => { const x = Date.UTC(y, 11, 26), c = new Date(Date.UTC(y, 11, 25)).getUTCDay(); return (c === 5 || c === 6 || c === 0) ? (c === 5 ? x + 2 * DAY : x + (c === 6 ? 2 : 1) * DAY) : x; } }, ...GBX.extra.map(([yy, m, d, name]) => ({ name, f: (y) => (y === yy ? Date.UTC(y, m - 1, d) : null) }))], note: 'Scotland and Northern Ireland differ (for example 2 January, St Andrew\'s Day, 17 March, 12 July). Dates moved for royal events are included for 2020 to 2023.' },
  ES: { name: 'Spain (nationwide days only)', list: [NY, EPI, GF, LAB, ASS, fx(10, 12, 'National Day'), AS, fx(12, 6, 'Constitution Day'), IMM, XM], note: 'Regions add holidays (Holy Thursday, Easter Monday, regional days) and may move a holiday that falls on a Sunday. Only the nationwide days are listed. A holiday on a Sunday is shown on that Sunday; regions may move it.' },
  IT: { name: 'Italy', list: [NY, EPI, ES_, EM, fx(4, 25, 'Liberation Day'), LAB, fx(6, 2, 'Republic Day'), ASS, AS, IMM, XM, fx(12, 26, "Saint Stephen's Day"), { name: 'Saint Francis of Assisi, Patron Saint of Italy (national holiday again from 2026)', f: (y) => (y >= 2026 ? Date.UTC(y, 9, 4) : null) }], note: 'Local patron saint days (for example 7 December in Milan) are not listed. The 4 October holiday from 2026 comes from python-holidays and was not checked against the Italian Official Gazette.' },
  AT: { name: 'Austria', list: [NY, EPI, EM, fx(5, 1, 'Labour Day (State Holiday)'), ASC, WHM, es(60, 'Corpus Christi'), ASS, fx(10, 26, 'National Day'), AS, IMM, XM, fx(12, 26, "Saint Stephen's Day")], note: 'Good Friday is not a public holiday in Austria.' },
  LU: { name: 'Luxembourg', list: [NY, EM, LAB, { name: 'Europe Day', f: (y) => (y >= 2019 ? Date.UTC(y, 4, 9) : null) }, ASC, WHM, fx(6, 23, "National Day (Grand Duke's official birthday)"), ASS, AS, XM, fx(12, 26, "Saint Stephen's Day")], note: 'Europe Day became a holiday in 2019.' },
  US: { name: 'United States (federal holidays)', list: [], note: 'Federal holidays only. Many states and employers add days (and some federal days are not paid days off in the private sector). Observed dates: a Saturday holiday is observed on Friday, a Sunday holiday on Monday.' },
};
function subst(d) { // England and Wales: Sat/Sun New Year or Christmas moves to the next weekday
  const w = new Date(d).getUTCDay(); return w === 6 ? d + 2 * DAY : w === 0 ? d + DAY : d;
}
const usObs = (d) => { const w = new Date(d).getUTCDay(); return w === 6 ? d - DAY : w === 0 ? d + DAY : d; };
function holidaysOf(code, y) {
  const c = COUNTRIES[code], out = [];
  if (code === 'US') {
    const add = (name, d, fixedDay) => { const o = fixedDay ? usObs(d) : d; out.push({ t: o, name: name + (o !== d ? ` (observed; falls on ${WD[new Date(d).getUTCDay()]} ${new Date(d).toISOString().slice(0, 10)})` : '') }); };
    add("New Year's Day", Date.UTC(y, 0, 1), true); add('Martin Luther King Jr. Day', nth(y, 1, 1, 3)); add("Washington's Birthday (Presidents' Day)", nth(y, 2, 1, 3)); add('Memorial Day', nth(y, 5, 1, -1));
    if (y >= 2021) add('Juneteenth National Independence Day', Date.UTC(y, 5, 19), true);
    add('Independence Day', Date.UTC(y, 6, 4), true); add('Labor Day', nth(y, 9, 1, 1)); add("Columbus Day (Indigenous Peoples' Day)", nth(y, 10, 1, 2)); add('Veterans Day', Date.UTC(y, 10, 11), true); add('Thanksgiving Day', nth(y, 11, 4, 4)); add('Christmas Day', Date.UTC(y, 11, 25), true);
    if (new Date(Date.UTC(y + 1, 0, 1)).getUTCDay() === 6) out.push({ t: Date.UTC(y, 11, 31), name: `New Year's Day ${y + 1} (observed; falls on Saturday ${y + 1}-01-01)` });
  } else for (const r of c.list) { const t = r.f(y); if (t != null) out.push({ t, name: r.name }); }
  return out.sort((a, b) => a.t - b.t);
}
T.push({
  id: 'public-holidays-lookup', cat: DT, title: 'Public Holidays Lookup (10 Countries, Rule-Based, No Lookup Sent)',
  desc: 'List national public holidays for Belgium, France, Germany, the Netherlands, England and Wales, Spain, Italy, Austria, Luxembourg or the US federal calendar, computed from the holiday rules in your browser. Years 2015 to 2060.',
  inputs: 0, sample: '',
  opts: [
    { id: 'country', label: 'Country', type: 'select', def: 'BE - Belgium', choices: Object.entries(COUNTRIES).map(([v, c]) => `${v} - ${c.name.replace(/ \(.*/, '')}`) },
    { id: 'year', label: 'Year', type: 'number', def: 2026 },
    { id: 'years', label: 'Number of years', type: 'number', def: 1 },
  ],
  run: (_i, o) => {
    const code = COUNTRIES[String(o.country).slice(0, 2)] ? String(o.country).slice(0, 2) : 'BE', y0 = Math.round(optNum(o.year, 2026)), n = Math.round(optNum(o.years, 1, 1, 10));
    if (y0 < 2015 || y0 + n - 1 > 2060) throw new Error('Rules are checked for the years 2015 to 2060 only.');
    const c = COUNTRIES[code], out = [`${c.name}: public holidays`];
    for (let y = y0; y < y0 + n; y++) {
      out.push('', String(y));
      for (const h of holidaysOf(code, y)) { const d = new Date(h.t); out.push(`${d.toISOString().slice(0, 10)}  ${WD[d.getUTCDay()].slice(0, 3)}  ${h.name}`); }
    }
    out.push('', c.note, 'Computed from holiday rules and cross-checked against python-holidays (MIT) for 2015 to 2060 and, for England and Wales, the GOV.UK bank holiday data (2019 to 2028). Governments can change dates by decree; check an official calendar before you rely on a date.');
    return out.join('\n');
  },
});

// ---------------------------------------------------------------- 1507 night sky viewer
// Stars: Yale Bright Star Catalogue (5th ed.) V<=5.0 at J2000, precessed to the date (Meeus ch. 21 rigorous); proper motion, nutation,
// aberration and refraction are ignored (all under 1 arc minute for this use, except proper motion of a few stars, up to ~1 arc minute).
// Sun, Moon, planets: P. Schlyter, "How to compute planetary positions" (stjarnhimlen.se/comp/ppcomp.html), quoted accuracy 1-2 arc minutes
// for the Sun and Moon, a few arc minutes for planets. Measured against astropy in pass2-A.md.
const rad = Math.PI / 180, DEG = 180 / Math.PI;
const nrm = (x) => ((x % 360) + 360) % 360;
const sd = (x) => Math.sin(x * rad), cd = (x) => Math.cos(x * rad);
let _bsc;
async function bscData() {
  return (_bsc ||= (async () => {
    const stars = [], con = {};
    for (const l of (await dataText('bsc-bright.tsv')).split('\n')) {
      if (!l || l[0] === '#') continue;
      const f = l.split('\t');
      if (l[0] === '@') { con[f[0].slice(1)] = f[1]; continue; }
      stars.push({ hr: +f[0], name: f[1], des: f[2], ra: +f[3], dec: +f[4], v: +f[5], bv: f[6] === '' ? NaN : +f[6], sp: f[7] });
    }
    return { stars, con };
  })());
}
const GREEK = { Alp: 'α', Bet: 'β', Gam: 'γ', Del: 'δ', Eps: 'ε', Zet: 'ζ', Eta: 'η', The: 'θ', Iot: 'ι', Kap: 'κ', Lam: 'λ', Mu: 'μ', Nu: 'ν', Xi: 'ξ', Omi: 'ο', Pi: 'π', Rho: 'ρ', Sig: 'σ', Tau: 'τ', Ups: 'υ', Phi: 'φ', Chi: 'χ', Psi: 'ψ', Ome: 'ω' };
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
function desig(des) { // "9Alp CMa" -> { text: "α CMa (9)", con: "CMa" }
  const con = des.slice(-3), m = des.slice(0, -3).trim().match(/^(\d*)\s*([A-Za-z]{3})?(\d)?$/);
  if (!m || !/^[A-Z][A-Za-z]{2}$/.test(con)) return { text: des, con: '' };
  const [, fl, g, sup] = m; return { text: `${g ? (GREEK[g] || g) + (sup ? SUP[+sup] : '') : fl} ${con}`, con };
}
function precess(ra, dec, T) { // J2000 -> mean equator of date, T in Julian centuries from J2000 (Meeus 21.2)
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) / 3600, z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) / 3600, th = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) / 3600;
  const A = cd(dec) * sd(ra + zeta), B = cd(th) * cd(dec) * cd(ra + zeta) - sd(th) * sd(dec), C = sd(th) * cd(dec) * cd(ra + zeta) + cd(th) * sd(dec);
  return [nrm(Math.atan2(A, B) * DEG + z), Math.asin(C) * DEG];
}
function horiz(ra, dec, lst, lat) {
  const H = lst - ra, x = cd(H) * cd(dec), y = sd(H) * cd(dec), z = sd(dec);
  const xh = x * sd(lat) - z * cd(lat), zh = x * cd(lat) + z * sd(lat);
  return { alt: Math.asin(zh) * DEG, az: nrm(Math.atan2(y, xh) * DEG + 180) };
}
const EL = { // Schlyter orbital elements: [N0,N1, i0,i1, w0,w1, a0,a1, e0,e1, M0,M1] (value = 0 + 1*d)
  Mercury: [48.3313, 3.24587e-5, 7.0047, 5e-8, 29.1241, 1.01444e-5, 0.387098, 0, 0.205635, 5.59e-10, 168.6562, 4.0923344368],
  Venus: [76.6799, 2.4659e-5, 3.3946, 2.75e-8, 54.891, 1.38374e-5, 0.72333, 0, 0.006773, -1.302e-9, 48.0052, 1.6021302244],
  Mars: [49.5574, 2.11081e-5, 1.8497, -1.78e-8, 286.5016, 2.92961e-5, 1.523688, 0, 0.093405, 2.516e-9, 18.6021, 0.5240207766],
  Jupiter: [100.4542, 2.76854e-5, 1.303, -1.557e-7, 273.8777, 1.64505e-5, 5.20256, 0, 0.048498, 4.469e-9, 19.895, 0.0830853001],
  Saturn: [113.6634, 2.3898e-5, 2.4886, -1.081e-7, 339.3939, 2.97661e-5, 9.55475, 0, 0.055546, -9.499e-9, 316.967, 0.0334442282],
  Uranus: [74.0005, 1.3978e-5, 0.7733, 1.9e-8, 96.6612, 3.0565e-5, 19.18171, -1.55e-8, 0.047318, 7.45e-9, 142.5905, 0.011725806],
  Neptune: [131.7806, 3.0173e-5, 1.77, -2.55e-7, 272.8461, -6.027e-6, 30.05826, 3.313e-8, 0.008606, 2.15e-9, 260.2471, 0.005995147],
};
const MAG0 = { Mercury: [-0.36, 0.027], Venus: [-4.34, 0.013], Mars: [-1.51, 0.016], Jupiter: [-9.25, 0.014], Saturn: [-9.0, 0.044], Uranus: [-7.15, 0.001], Neptune: [-6.9, 0.001] };
function kepler(M, e) { // degrees; Newton iteration
  let E = M + e * DEG * sd(M) * (1 + e * cd(M));
  for (let k = 0; k < 20; k++) { const dE = (E - e * DEG * sd(E) - M) / (1 - e * cd(E)); E -= dE; if (Math.abs(dE) < 1e-7) break; }
  return E;
}
function orbit(el, d) {
  const [N0, N1, i0, i1, w0, w1, a0, a1, e0, e1, M0, M1] = el, N = nrm(N0 + N1 * d), i = i0 + i1 * d, w = nrm(w0 + w1 * d), a = a0 + a1 * d, e = e0 + e1 * d, M = nrm(M0 + M1 * d);
  const E = kepler(M, e), xv = a * (cd(E) - e), yv = a * Math.sqrt(1 - e * e) * sd(E), v = Math.atan2(yv, xv) * DEG, r = Math.hypot(xv, yv);
  return { N, i, w, a, e, M, v, r, xh: r * (cd(N) * cd(v + w) - sd(N) * sd(v + w) * cd(i)), yh: r * (sd(N) * cd(v + w) + cd(N) * sd(v + w) * cd(i)), zh: r * sd(v + w) * sd(i) };
}
function solar(d) { // returns Sun geocentric ecliptic position and mean longitude
  const w = 282.9404 + 4.70935e-5 * d, e = 0.016709 - 1.151e-9 * d, M = nrm(356.047 + 0.9856002585 * d), E = kepler(M, e);
  const xv = cd(E) - e, yv = Math.sqrt(1 - e * e) * sd(E), v = Math.atan2(yv, xv) * DEG, r = Math.hypot(xv, yv), lon = nrm(v + w);
  return { lon, r, xs: r * cd(lon), ys: r * sd(lon), M, w, Ls: nrm(M + w) };
}
function eqOf(xg, yg, zg, ecl) { const ye = yg * cd(ecl) - zg * sd(ecl), ze = yg * sd(ecl) + zg * cd(ecl); return { ra: nrm(Math.atan2(ye, xg) * DEG), dec: Math.atan2(ze, Math.hypot(xg, ye)) * DEG, R: Math.sqrt(xg * xg + yg * yg + zg * zg) }; }
function sunMoonPlanets(d, lat, lst) {
  const ecl = 23.4393 - 3.563e-7 * d, S = solar(d), out = [];
  const sun = eqOf(S.xs, S.ys, 0, ecl), sh = horiz(sun.ra, sun.dec, lst, lat); out.push({ name: 'Sun', kind: 'sun', mag: -26.74, ...sun, ...sh });
  // Moon
  const mo = orbit([125.1228, -0.0529538083, 5.1454, 0, 318.0634, 0.1643573223, 60.2666, 0, 0.0549, 0, 115.3654, 13.0649929509], d);
  const Ms = S.M, Mm = mo.M, Nm = mo.N, Lm = nrm(Mm + mo.w + Nm), D = Lm - S.Ls, F = Lm - Nm;
  let lon = Math.atan2(mo.yh, mo.xh) * DEG, la = Math.atan2(mo.zh, Math.hypot(mo.xh, mo.yh)) * DEG, dist = mo.r;
  lon += -1.274 * sd(Mm - 2 * D) + 0.658 * sd(2 * D) - 0.186 * sd(Ms) - 0.059 * sd(2 * Mm - 2 * D) - 0.057 * sd(Mm - 2 * D + Ms) + 0.053 * sd(Mm + 2 * D) + 0.046 * sd(2 * D - Ms) + 0.041 * sd(Mm - Ms) - 0.035 * sd(D) - 0.031 * sd(Mm + Ms) - 0.015 * sd(2 * F - 2 * D) + 0.011 * sd(Mm - 4 * D);
  la += -0.173 * sd(F - 2 * D) - 0.055 * sd(Mm - F - 2 * D) - 0.046 * sd(Mm + F - 2 * D) + 0.033 * sd(F + 2 * D) + 0.017 * sd(2 * Mm + F);
  dist += -0.58 * cd(Mm - 2 * D) - 0.46 * cd(2 * D);
  const mg = eqOf(dist * cd(lon) * cd(la), dist * sd(lon) * cd(la), dist * sd(la), ecl), mh = horiz(mg.ra, mg.dec, lst, lat);
  const par = Math.asin(1 / dist) * DEG, elong = Math.acos(cd(S.lon - lon) * cd(la)) * DEG, FV = 180 - elong;
  const moon = { name: 'Moon', kind: 'moon', ra: mg.ra, dec: mg.dec, R: dist, az: mh.az, alt: mh.alt - par * cd(mh.alt), illum: (1 + cd(FV)) / 2, waxing: nrm(lon - S.lon) < 180, mag: -21.62 + 5 * Math.log10(S.r * dist) + 0.026 * FV + 4e-9 * FV ** 4 };
  out.push(moon);
  // planets
  const sat = orbit(EL.Saturn, d), jup = orbit(EL.Jupiter, d), ura = orbit(EL.Uranus, d), Mj = jup.M, Msa = sat.M, Mu = ura.M;
  for (const [name, el] of Object.entries(EL)) {
    const o = orbit(el, d); let plon = Math.atan2(o.yh, o.xh) * DEG, plat = Math.atan2(o.zh, Math.hypot(o.xh, o.yh)) * DEG;
    if (name === 'Jupiter') plon += -0.332 * sd(2 * Mj - 5 * Msa - 67.6) - 0.056 * sd(2 * Mj - 2 * Msa + 21) + 0.042 * sd(3 * Mj - 5 * Msa + 21) - 0.036 * sd(Mj - 2 * Msa) + 0.022 * cd(Mj - Msa) + 0.023 * sd(2 * Mj - 3 * Msa + 52) - 0.016 * sd(Mj - 5 * Msa - 69);
    if (name === 'Saturn') { plon += 0.812 * sd(2 * Mj - 5 * Msa - 67.6) - 0.229 * cd(2 * Mj - 4 * Msa - 2) + 0.119 * sd(Mj - 2 * Msa - 3) + 0.046 * sd(2 * Mj - 6 * Msa - 69) + 0.014 * sd(Mj - 3 * Msa + 32); plat += -0.02 * cd(2 * Mj - 4 * Msa - 2) + 0.018 * sd(2 * Mj - 6 * Msa - 49); }
    if (name === 'Uranus') plon += 0.04 * sd(Msa - 2 * Mu + 6) + 0.035 * sd(Msa - 3 * Mu + 33) - 0.015 * sd(Mj - Mu + 20);
    const xh = o.r * cd(plon) * cd(plat), yh = o.r * sd(plon) * cd(plat), zh = o.r * sd(plat), xg = xh + S.xs, yg = yh + S.ys, zg = zh;
    const q = eqOf(xg, yg, zg, ecl), h = horiz(q.ra, q.dec, lst, lat), r = o.r, R = q.R, s = S.r;
    const FV2 = Math.acos((r * r + R * R - s * s) / (2 * r * R)) * DEG, elo = Math.acos((s * s + R * R - r * r) / (2 * s * R)) * DEG;
    let mag = MAG0[name][0] + 5 * Math.log10(r * R) + MAG0[name][1] * FV2;
    if (name === 'Mercury') mag += 2.2e-13 * FV2 ** 6; if (name === 'Venus') mag += 4.2e-7 * FV2 ** 3;
    if (name === 'Saturn') {
      const los = Math.atan2(yg, xg) * DEG, las = Math.atan2(zg, Math.hypot(xg, yg)) * DEG, ir = 28.06, Nr = 169.51 + 3.82e-5 * d;
      const B = Math.asin(sd(las) * cd(ir) - cd(las) * sd(ir) * sd(los - Nr)); mag += -2.6 * Math.abs(Math.sin(B)) + 1.2 * Math.sin(B) ** 2;
    }
    out.push({ name, kind: 'planet', ra: q.ra, dec: q.dec, R, elong: elo, mag, ...h });
  }
  return { objs: out, sunAlt: sh.alt };
}
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = (az) => COMPASS[Math.round(az / 22.5) % 16];
function parseWhen(s, offH) {
  const m = String(s).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) throw new Error('Use the date and time format 2026-10-23 22:00.');
  const [y, mo, da, h, mi, se] = m.slice(1).map((x) => (x == null ? 0 : +x));
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) throw new Error('That date or time does not exist.');
  const ms = Date.UTC(y, mo - 1, da, h, mi, se) - offH * 3600000, dt = new Date(ms);
  if (dt.getUTCFullYear() < 1950 || dt.getUTCFullYear() > 2100) throw new Error('The planet formulas are meant for 1950 to 2100.');
  return ms;
}
const starRGB = (bv) => { // rough B-V to colour; decorative only
  if (!Number.isFinite(bv)) return '#ffffff'; const t = Math.max(-0.3, Math.min(1.8, bv));
  return t < 0 ? '#aac4ff' : t < 0.4 ? '#dde6ff' : t < 0.8 ? '#fff4e0' : t < 1.2 ? '#ffd9a0' : '#ffb070';
};
const PCOL = { Sun: '#ffd23f', Moon: '#e8e8e8', Mercury: '#c0c0c0', Venus: '#fff2a8', Mars: '#ff7a59', Jupiter: '#ffd7a8', Saturn: '#e6c88a', Uranus: '#8fe3e3', Neptune: '#7fa6ff' };
T.push({
  id: 'night-sky-viewer', cat: SCI, title: 'Night Sky Viewer (Stars, Moon and Planets Overhead)',
  desc: 'Draw the sky above any place and time: Yale Bright Star Catalogue stars to magnitude 5, the Sun, Moon phase and the planets, as an all-sky SVG chart plus a table of altitude and azimuth. Computed in your browser.',
  inputs: 0, sample: '',
  opts: [
    { id: 'when', label: 'Date and time, local (YYYY-MM-DD HH:MM)', type: 'text', def: '2026-10-23 22:00' },
    { id: 'utc', label: 'Local time offset from UTC in hours (for example 2 for Brussels in summer time)', type: 'number', def: 2 },
    { id: 'lat', label: 'Latitude in degrees (north positive)', type: 'number', def: 50.85 },
    { id: 'lon', label: 'Longitude in degrees (east positive)', type: 'number', def: 4.35 },
    { id: 'mag', label: 'Faintest star magnitude (1 to 5)', type: 'number', def: 4.5 },
  ],
  run: async (_i, o) => {
    const lat = optNum(o.lat, 50.85, -90, 90), lon = optNum(o.lon, 4.35, -180, 180), mlim = optNum(o.mag, 4.5, 1, 5), off = optNum(o.utc, 0, -14, 14);
    const ms = parseWhen(o.when || '2026-10-23 22:00', off), jd = ms / 86400000 + 2440587.5, d = jd - 2451543.5 + 69 / 86400, Tc = (jd - 2451545) / 36525;
    const lst = nrm(280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * Tc * Tc + lon); // IAU 1982 GMST + east longitude
    const { stars, con } = await bscData();
    const { objs, sunAlt } = sunMoonPlanets(d, lat, lst);
    const shown = [];
    for (const s of stars) {
      if (s.v > mlim) continue; const [ra, dec] = precess(s.ra, s.dec, Tc), h = horiz(ra, dec, lst, lat);
      if (h.alt > 0) shown.push({ ...s, ...h });
    }
    const W = 640, R = 290, C = W / 2, pos = (alt, az) => { const r = R * (90 - alt) / 90; return [C - r * Math.sin(az * rad), C - r * Math.cos(az * rad)]; };
    const tw = sunAlt > 0 ? 'Daylight: the Sun is up, so stars are not visible' : sunAlt > -6 ? 'Civil twilight' : sunAlt > -12 ? 'Nautical twilight' : sunAlt > -18 ? 'Astronomical twilight' : 'Night (astronomical darkness)';
    const up = objs.filter((b) => b.alt > 0 && b.kind !== 'sun'), moon = objs.find((b) => b.kind === 'moon');
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" width="100%" style="max-width:640px" role="img" aria-labelledby="t d"><title id="t">Sky chart for latitude ${lat}, longitude ${lon}</title><desc id="d">Looking up with north at the top and east on the left. ${shown.length} stars above the horizon down to magnitude ${mlim}. ${up.length ? 'Above the horizon: ' + up.map((b) => `${b.name} (${compass(b.az)}, ${b.alt.toFixed(0)} degrees high)`).join(', ') + '.' : 'No Moon or planets above the horizon.'} ${tw}.</desc>`;
    svg += `<rect width="${W}" height="${W}" fill="#0b1026"/><circle cx="${C}" cy="${C}" r="${R}" fill="#10183a" stroke="#6b7bb8" stroke-width="1.5"/>`;
    for (const a of [30, 60]) svg += `<circle cx="${C}" cy="${C}" r="${R * (90 - a) / 90}" fill="none" stroke="#33407a" stroke-width="1" stroke-dasharray="3 4"/>`;
    for (const [t, az] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) { const [x, y] = pos(-4, az); svg += `<text x="${x}" y="${y + 5}" fill="#c8d2ff" font-size="15" font-weight="700" text-anchor="middle" font-family="system-ui,sans-serif">${t}</text>`; }
    for (const s of shown.sort((a, b) => b.v - a.v)) { const [x, y] = pos(s.alt, s.az), r = Math.max(0.7, 0.55 + (5.2 - s.v) * 0.62); svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="${starRGB(s.bv)}"/>`; }
    for (const s of shown) if (s.name && s.v <= 2.2) { const [x, y] = pos(s.alt, s.az); svg += `<text x="${(x + 6).toFixed(1)}" y="${(y - 5).toFixed(1)}" fill="#aab6e8" font-size="10.5" font-family="system-ui,sans-serif">${esc(s.name)}</text>`; }
    for (const b of objs) if (b.alt > 0) {
      const [x, y] = pos(b.alt, b.az), big = b.kind === 'sun' || b.kind === 'moon';
      svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${big ? 9 : Math.max(3, 5.5 - b.mag * 0.6).toFixed(1)}" fill="${PCOL[b.name]}" stroke="#fff" stroke-width="0.8"/><text x="${(x + 11).toFixed(1)}" y="${(y + 4).toFixed(1)}" fill="${PCOL[b.name]}" font-size="12" font-weight="700" font-family="system-ui,sans-serif">${b.name}</text>`;
    }
    svg += '</svg>';
    const row = (n, c, m, alt, az, note) => `<tr><th scope="row">${esc(n)}</th><td>${esc(c)}</td><td>${m}</td><td>${alt.toFixed(1)}°</td><td>${az.toFixed(1)}° ${compass(az)}</td><td>${esc(note)}</td></tr>`;
    let rows = objs.map((b) => row(b.name, '', b.mag.toFixed(1), b.alt, b.az, (b.alt > 0 ? 'above horizon' : 'below horizon') + (b.kind === 'moon' ? `; ${(b.illum * 100).toFixed(0)}% lit, ${b.waxing ? 'waxing' : 'waning'}` : b.kind === 'planet' ? `; ${b.elong.toFixed(0)}° from the Sun` : ''))).join('');
    const bright = shown.filter((s) => s.v <= 3.0).sort((a, b) => a.v - b.v).slice(0, 30);
    rows += bright.map((s) => { const ds = desig(s.des); return row(s.name || ds.text, con[ds.con] || '', s.v.toFixed(2), s.alt, s.az, s.name ? ds.text + ` (HR ${s.hr})` : `HR ${s.hr}`); }).join('');
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Night sky</title><style>body{font:14px system-ui,sans-serif;margin:12px;color:#1a1a1a;background:#fff}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{padding:4px 8px;border-bottom:1px solid #ccc;text-align:left}thead th{background:#eee}p{max-width:70ch}@media(prefers-color-scheme:dark){body{background:#161616;color:#eee}thead th{background:#2a2a2a}td,th{border-color:#444}}</style>` +
      `<p role="status"><strong>${esc(tw)}.</strong> Sun altitude ${sunAlt.toFixed(1)}°. Moon ${moon.alt > 0 ? 'is up' : 'is below the horizon'}, ${(moon.illum * 100).toFixed(0)}% lit. Local sidereal time ${(lst / 15).toFixed(2)} h.</p>` + svg +
      `<table><caption>Sun, Moon, planets and the brightest stars (magnitude 3 or brighter) above the horizon</caption><thead><tr><th scope="col">Object</th><th scope="col">Constellation</th><th scope="col">Magnitude</th><th scope="col">Altitude</th><th scope="col">Azimuth (from north, clockwise)</th><th scope="col">Notes</th></tr></thead><tbody>${rows}</tbody></table>` +
      '<p>Chart: you look straight up, north at the top and east on the left, the horizon is the outer circle, dashed rings mark 30 and 60 degrees altitude. Stars: Yale Bright Star Catalogue, positions for J2000 precessed to the date (proper motion, nutation, aberration and refraction ignored). Sun, Moon and planets: P. Schlyter\'s low-precision formulas (a few arc minutes; the time scale difference TT-UT is fixed at 69 s). Constellation lines are not drawn. Rise and set times are not computed. Times: use the local time and the offset you entered; no time zone database is consulted.</p>';
    return { html };
  },
});

// @@MORE@@

export default T;
