// Dev config++, infra and data-model/LLM helpers. Pure text in/out (no DOM, no network), hand-written, no third-party code.
// Deliberate simplifications: formatters are brace/indent based (no full grammar); the Dockerfile and Kubernetes
// checks are heuristic, line based rule sets; token counts are APPROXIMATE (no real BPE vocabularies are shipped).

const sel = (id, label, choices, def) => ({ id, label, type: 'select', choices, def: def ?? choices[0] });
const txt = (id, label, def = '') => ({ id, label, type: 'text', def });
const num = (id, label, def) => ({ id, label, type: 'number', def });
const chk = (id, label, def = false) => ({ id, label, type: 'checkbox', def });
const lines = (s) => String(s ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const csv = (s) => String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const need = (v, m) => { if (v == null || String(v).trim() === '') throw new Error(m); return String(v).trim(); };
const J = (v) => JSON.stringify(v, null, 2) + '\n';
const YRES = /^(true|false|null|yes|no|on|off|y|n|~)$/i;
const yq = (s) => { s = String(s); return s !== '' && /^[A-Za-z_./][A-Za-z0-9_./ -]*$/.test(s) && !/\s$/.test(s) && !YRES.test(s) && isNaN(Number(s)) ? s : JSON.stringify(s); };
const jparse = (t, what = 'JSON') => { try { return JSON.parse(t); } catch (e) { throw new Error(`Invalid ${what}: ${e.message}`); } };
const T = [];

// ---------- approximate token estimator (shared) ----------
const CJK = '\\u3040-\\u30ff\\u3400-\\u9fff\\uac00-\\ud7af';
const TOK_RE = new RegExp(`[${CJK}]|(?:(?![${CJK}])\\p{L})+|\\p{N}+|\\n+|[^\\s\\p{L}\\p{N}]`, 'gu');
const FAMILIES = { 'GPT-4o / o-series': 0.95, 'GPT-4 / 3.5': 1, 'Claude': 1.1, 'Llama 3': 1, 'Gemini': 0.95, 'Generic': 1 };
// ponytail: heuristic (word pieces ~4 chars/token), typically within +-15% of real BPE counts; swap in a real vocab if exactness matters.
const estTokens = (s, fam = 'Generic') => {
  let n = 0;
  for (const [t] of String(s).matchAll(TOK_RE)) n += /^\p{L}/u.test(t) && !new RegExp(`^[${CJK}]$`).test(t) ? Math.ceil(t.length / 4) : /^\p{N}/u.test(t) ? Math.ceil(t.length / 3) : 1;
  return Math.round(n * (FAMILIES[fam] ?? 1));
};
const fmtN = (n) => Math.round(n).toLocaleString('en-US');

// =====================================================================================
// Dev Config++
// =====================================================================================

T.push({
  id: 'systemd-unit-generator', cat: 'Dev Config++', title: 'systemd Service Unit Generator', desc: 'Build a .service unit file with restart policy, user, environment and optional sandboxing hardening.',
  labels: ['Environment (KEY=VALUE per line, optional)'], sample: 'NODE_ENV=production\nPORT=3000',
  opts: [txt('desc', 'Description', 'My application'), txt('exec', 'ExecStart', '/usr/bin/node /opt/app/server.js'), sel('type', 'Type', ['simple', 'exec', 'notify', 'forking', 'oneshot']),
    txt('user', 'User (blank = root)', 'app'), txt('group', 'Group', ''), txt('wd', 'WorkingDirectory', '/opt/app'), sel('restart', 'Restart', ['on-failure', 'always', 'no', 'on-abnormal', 'on-success']),
    num('rsec', 'RestartSec (s)', 5), txt('after', 'After=', 'network-online.target'), txt('wanted', 'WantedBy=', 'multi-user.target'), chk('harden', 'Add sandboxing hardening', true)],
  run: ([t], o) => {
    const ex = need(o.exec, 'ExecStart is required');
    const env = lines(t).filter((l) => !l.startsWith('#')).map((l) => { if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(l)) throw new Error(`Bad env line "${l}"`); const i = l.indexOf('='); const v = l.slice(i + 1); return `Environment=${/\s/.test(v) ? `"${l.slice(0, i)}=${v.replace(/"/g, '\\"')}"` : l}`; });
    const after = o.after.trim();
    const U = ['[Unit]', `Description=${o.desc.trim() || 'Service'}`, ...(after ? [`After=${after}`, ...(/online/.test(after) ? [`Wants=${after}`] : [])] : [])];
    const S = ['[Service]', `Type=${o.type}`, `ExecStart=${ex}`];
    if (o.user.trim()) S.push(`User=${o.user.trim()}`); if (o.group.trim()) S.push(`Group=${o.group.trim()}`);
    if (o.wd.trim()) S.push(`WorkingDirectory=${o.wd.trim()}`);
    S.push(...env);
    if (o.type !== 'oneshot') S.push(`Restart=${o.restart}`, `RestartSec=${+o.rsec || 5}`);
    if (o.harden) S.push('NoNewPrivileges=true', 'PrivateTmp=true', 'ProtectSystem=strict', 'ProtectHome=true', 'ProtectKernelTunables=true', 'ProtectControlGroups=true', 'RestrictSUIDSGID=true', ...(o.wd.trim() ? [`ReadWritePaths=${o.wd.trim()}`] : []));
    return [U, S, ['[Install]', `WantedBy=${o.wanted.trim() || 'multi-user.target'}`]].map((b) => b.join('\n')).join('\n\n') + '\n';
  },
});

T.push({
  id: 'systemd-timer-generator', cat: 'Dev Config++', title: 'systemd Timer Generator', desc: 'Generate a .timer plus its matching .service (cron replacement) with OnCalendar or monotonic schedules.',
  inputs: 0, sample: '',
  opts: [txt('name', 'Unit name', 'backup'), txt('desc', 'Description', 'Nightly backup'), txt('exec', 'ExecStart', '/usr/local/bin/backup.sh'), sel('mode', 'Schedule type', ['OnCalendar', 'Boot + interval']),
    txt('cal', 'OnCalendar', '*-*-* 03:00:00'), txt('boot', 'OnBootSec (monotonic)', '5min'), txt('every', 'OnUnitActiveSec (monotonic)', '1h'), txt('jitter', 'RandomizedDelaySec', '5min'), chk('persist', 'Persistent=true (catch up missed runs)', true), txt('user', 'User (blank = root)', '')],
  run: (_, o) => {
    const n = need(o.name, 'Unit name required'); if (!/^[A-Za-z0-9:_.@-]+$/.test(n)) throw new Error('Unit name has invalid characters');
    const ex = need(o.exec, 'ExecStart required');
    const tm = ['[Unit]', `Description=${o.desc.trim() || n}`, '', '[Timer]'];
    if (o.mode === 'OnCalendar') tm.push(`OnCalendar=${need(o.cal, 'OnCalendar required')}`, ...(o.persist ? ['Persistent=true'] : []));
    else tm.push(`OnBootSec=${need(o.boot, 'OnBootSec required')}`, `OnUnitActiveSec=${need(o.every, 'OnUnitActiveSec required')}`);
    if (o.jitter.trim()) tm.push(`RandomizedDelaySec=${o.jitter.trim()}`);
    tm.push(`Unit=${n}.service`, '', '[Install]', 'WantedBy=timers.target');
    const sv = ['[Unit]', `Description=${o.desc.trim() || n}`, '', '[Service]', 'Type=oneshot', `ExecStart=${ex}`, ...(o.user.trim() ? [`User=${o.user.trim()}`] : [])];
    return `# --- /etc/systemd/system/${n}.timer ---\n${tm.join('\n')}\n\n# --- /etc/systemd/system/${n}.service ---\n${sv.join('\n')}\n\n# Enable: systemctl daemon-reload && systemctl enable --now ${n}.timer\n`;
  },
});

T.push({
  id: 'caddyfile-generator', cat: 'Dev Config++', title: 'Caddyfile Generator', desc: 'Build a Caddyfile site block: reverse proxy, static files, SPA, PHP-FPM or redirect, with compression, headers and www redirect.',
  inputs: 0, sample: '',
  opts: [txt('host', 'Site address', 'example.com'), sel('mode', 'Mode', ['reverse_proxy', 'file_server', 'spa', 'php_fastcgi', 'redir']), txt('target', 'Upstream / root / redirect target', 'localhost:3000'),
    chk('enc', 'encode zstd gzip', true), chk('sec', 'Security headers', true), chk('log', 'Access log', true), chk('www', 'Redirect www to apex'), sel('tls', 'TLS', ['automatic', 'internal (self-signed)']), txt('email', 'ACME email (global)', '')],
  run: (_, o) => {
    const host = need(o.host, 'Site address required'), tg = need(o.target, 'Target required'), B = [];
    if (o.enc) B.push('encode zstd gzip');
    if (o.sec) B.push('header {', '\tStrict-Transport-Security "max-age=31536000; includeSubDomains"', '\tX-Content-Type-Options nosniff', '\tX-Frame-Options SAMEORIGIN', '\tReferrer-Policy strict-origin-when-cross-origin', '\t-Server', '}');
    if (o.log) B.push('log');
    if (o.tls.startsWith('internal')) B.push('tls internal');
    if (o.mode === 'reverse_proxy') B.push(`reverse_proxy ${tg}`);
    else if (o.mode === 'file_server') B.push(`root * ${tg}`, 'file_server');
    else if (o.mode === 'spa') B.push(`root * ${tg}`, 'try_files {path} /index.html', 'file_server');
    else if (o.mode === 'php_fastcgi') B.push(`root * ${tg}`, 'php_fastcgi unix//run/php/php-fpm.sock', 'file_server');
    else B.push(`redir ${tg}{uri} permanent`);
    const out = [];
    if (o.email.trim()) out.push(`{\n\temail ${o.email.trim()}\n}\n`);
    out.push(`${host} {\n${B.map((l) => '\t' + l).join('\n')}\n}\n`);
    if (o.www && !/^https?:|^www\.|:\d+$/.test(host)) out.push(`www.${host} {\n\tredir https://${host}{uri} permanent\n}\n`);
    return out.join('\n');
  },
});

T.push({
  id: 'renovate-config-generator', cat: 'Dev Config++', title: 'Renovate Config Generator', desc: 'Create renovate.json with presets, schedule, automerge and grouping rules.',
  inputs: 0, sample: '',
  opts: [chk('rec', 'extends config:recommended', true), sel('sched', 'Schedule', ['any time', 'before 6am on monday', 'every weekend', 'on the first day of the month']), txt('tz', 'Timezone', 'Europe/Brussels'),
    chk('am', 'Automerge minor/patch (non-major)', true), chk('group', 'Group all non-major updates', true), chk('pin', 'Pin GitHub Action digests'), chk('lock', 'lockFileMaintenance weekly'), txt('labels', 'Labels (csv)', 'dependencies'), num('prs', 'prConcurrentLimit', 5), txt('assign', 'Reviewers (csv)', '')],
  run: (_, o) => {
    const c = { $schema: 'https://docs.renovatebot.com/renovate-schema.json', extends: [...(o.rec ? ['config:recommended'] : []), ...(o.pin ? ['helpers:pinGitHubActionDigests'] : [])] };
    if (o.sched !== 'any time') { c.schedule = [o.sched]; c.timezone = o.tz.trim() || 'UTC'; }
    if (csv(o.labels).length) c.labels = csv(o.labels);
    if (csv(o.assign).length) c.reviewers = csv(o.assign);
    c.prConcurrentLimit = +o.prs || 5;
    const rules = [];
    if (o.group) rules.push({ matchUpdateTypes: ['minor', 'patch'], groupName: 'all non-major dependencies', groupSlug: 'all-minor-patch' });
    if (o.am) rules.push({ matchUpdateTypes: ['minor', 'patch'], matchCurrentVersion: '!/^0/', automerge: true });
    if (rules.length) c.packageRules = rules;
    if (o.lock) c.lockFileMaintenance = { enabled: true, schedule: ['before 6am on monday'] };
    return J(c);
  },
});

const DEP_ECO = ['bundler', 'cargo', 'composer', 'devcontainers', 'docker', 'docker-compose', 'dotnet-sdk', 'elm', 'gitsubmodule', 'github-actions', 'gomod', 'gradle', 'maven', 'mix', 'npm', 'nuget', 'pip', 'pub', 'swift', 'terraform', 'uv', 'bun', 'helm'];
T.push({
  id: 'dependabot-config-generator', cat: 'Dev Config++', title: 'Dependabot Config Generator', desc: 'Generate .github/dependabot.yml from "ecosystem directory" lines with schedule and grouping.',
  labels: ['ecosystem directory (one per line)'], sample: 'npm /\ndocker /\ngithub-actions /\npip /backend',
  opts: [sel('int', 'Interval', ['weekly', 'daily', 'monthly']), sel('day', 'Day (weekly)', ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']), num('limit', 'open-pull-requests-limit', 10), chk('group', 'Group minor/patch updates', true), txt('prefix', 'Commit message prefix', 'chore(deps)')],
  run: ([t], o) => {
    const L = ['version: 2', 'updates:'];
    const rows = lines(t).filter((l) => !l.startsWith('#')); if (!rows.length) throw new Error('Add at least one line like: npm /');
    for (const r of rows) {
      const [eco, dir = '/'] = r.split(/\s+/); if (!DEP_ECO.includes(eco)) throw new Error(`Unknown ecosystem "${eco}". Known: ${DEP_ECO.join(', ')}`);
      L.push(`  - package-ecosystem: ${JSON.stringify(eco)}`, `    directory: ${JSON.stringify(dir)}`, '    schedule:', `      interval: ${o.int}`, ...(o.int === 'weekly' ? [`      day: ${o.day}`] : []), `    open-pull-requests-limit: ${+o.limit || 10}`);
      if (o.prefix.trim()) L.push('    commit-message:', `      prefix: ${JSON.stringify(o.prefix.trim())}`);
      if (o.group) L.push('    groups:', '      minor-and-patch:', '        update-types:', '          - "minor"', '          - "patch"');
    }
    return L.join('\n') + '\n';
  },
});

const PC = {
  basic: ['https://github.com/pre-commit/pre-commit-hooks', 'v5.0.0', ['trailing-whitespace', 'end-of-file-fixer', 'check-yaml', 'check-json', 'check-merge-conflict', 'check-added-large-files']],
  prettier: ['https://github.com/pre-commit/mirrors-prettier', 'v3.1.0', ['prettier']],
  eslint: ['https://github.com/pre-commit/mirrors-eslint', 'v9.12.0', ['eslint']],
  ruff: ['https://github.com/astral-sh/ruff-pre-commit', 'v0.6.9', ['ruff', 'ruff-format']],
  black: ['https://github.com/psf/black', '24.10.0', ['black']],
  shellcheck: ['https://github.com/shellcheck-py/shellcheck-py', 'v0.10.0.1', ['shellcheck']],
  gitleaks: ['https://github.com/gitleaks/gitleaks', 'v8.18.4', ['gitleaks']],
  hadolint: ['https://github.com/hadolint/hadolint', 'v2.12.0', ['hadolint']],
  terraform: ['https://github.com/antonbabenko/pre-commit-terraform', 'v1.96.1', ['terraform_fmt', 'terraform_validate']],
  yamllint: ['https://github.com/adrienverge/yamllint', 'v1.35.1', ['yamllint']],
  commitlint: ['https://github.com/alessandrojcm/commitlint-pre-commit-hook', 'v9.18.0', ['commitlint']],
  codespell: ['https://github.com/codespell-project/codespell', 'v2.3.0', ['codespell']],
};
T.push({
  id: 'pre-commit-config-generator', cat: 'Dev Config++', title: 'pre-commit Config Generator', desc: 'Generate .pre-commit-config.yaml from hook presets (revs are examples; run pre-commit autoupdate).',
  labels: ['Presets (one per line)'], placeholder: [Object.keys(PC).join('\n')], sample: 'basic\nprettier\nruff\nshellcheck\ngitleaks\nterraform',
  opts: [txt('stages', 'default_install_hook_types (csv)', 'pre-commit'), chk('fail', 'fail_fast', false)],
  run: ([t], o) => {
    const L = ['# Run `pre-commit autoupdate` to bump the pinned revs.'];
    const st = csv(o.stages); if (st.length) L.push(`default_install_hook_types: [${st.join(', ')}]`); if (o.fail) L.push('fail_fast: true');
    L.push('repos:');
    const names = lines(t); if (!names.length) throw new Error('List at least one preset');
    for (const n of names) {
      const p = PC[n.toLowerCase()]; if (!p) throw new Error(`Unknown preset "${n}". Known: ${Object.keys(PC).join(', ')}`);
      L.push(`  - repo: ${p[0]}`, `    rev: ${p[1]}`, '    hooks:', ...p[2].map((h) => `      - id: ${h}`));
    }
    return L.join('\n') + '\n';
  },
});

T.push({
  id: 'commitlint-semantic-release-generator', cat: 'Dev Config++', title: 'commitlint + semantic-release Config', desc: 'Generate commitlint.config.js, .releaserc.json and a husky commit-msg hook for conventional-commit based releases.',
  inputs: 0, sample: '',
  opts: [txt('branches', 'Release branches (csv)', 'main'), chk('changelog', 'Changelog plugin', true), chk('npm', 'npm publish', true), chk('git', 'Commit release assets (git plugin)', true), chk('gh', 'GitHub releases', true), num('len', 'Max header length', 100), txt('scopes', 'Allowed scopes (csv, blank = any)', '')],
  run: (_, o) => {
    const plugins = ['@semantic-release/commit-analyzer', '@semantic-release/release-notes-generator'];
    if (o.changelog) plugins.push('@semantic-release/changelog'); if (o.npm) plugins.push('@semantic-release/npm'); if (o.gh) plugins.push('@semantic-release/github');
    if (o.git) plugins.push(['@semantic-release/git', { assets: [...(o.changelog ? ['CHANGELOG.md'] : []), ...(o.npm ? ['package.json'] : [])], message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}' }]);
    const rules = { 'header-max-length': [2, 'always', +o.len || 100] };
    if (csv(o.scopes).length) rules['scope-enum'] = [2, 'always', csv(o.scopes)];
    return `# --- commitlint.config.js ---\nexport default ${JSON.stringify({ extends: ['@commitlint/config-conventional'], rules }, null, 2)};\n\n# --- .releaserc.json ---\n${J({ branches: csv(o.branches), plugins })}\n# --- .husky/commit-msg ---\nnpx --no-install commitlint --edit "$1"\n\n# Install: npm i -D @commitlint/cli @commitlint/config-conventional semantic-release husky\n`;
  },
});

const DI = {
  node: ['node_modules', 'npm-debug.log*', 'yarn-error.log', '.npm', '.next', '.nuxt', 'dist', 'coverage'],
  python: ['__pycache__', '*.py[cod]', '.venv', 'venv', '.pytest_cache', '.mypy_cache', '.ruff_cache', '*.egg-info', '.tox'],
  go: ['vendor', '*.test', '*.out', 'bin'],
  java: ['target', 'build', '.gradle', '*.class', '.mvn/wrapper/maven-wrapper.jar'],
  rust: ['target', '**/*.rs.bk'],
  php: ['vendor', 'storage/logs', '.phpunit.result.cache'],
  dotnet: ['bin', 'obj', '*.user', '.vs'],
  ruby: ['.bundle', 'log', 'tmp', 'vendor/bundle'],
};
T.push({
  id: 'dockerignore-generator', cat: 'Dev Config++', title: '.dockerignore Generator', desc: 'Generate a .dockerignore with common VCS/IDE/secret patterns plus stack-specific build artefacts.',
  labels: ['Stacks (one per line)'], placeholder: [Object.keys(DI).join('\n')], sample: 'node\npython',
  opts: [chk('secrets', 'Ignore .env and key files', true), chk('docs', 'Ignore docs and markdown (except README)'), chk('docker', 'Ignore Dockerfile/compose files')],
  run: ([t], o) => {
    const L = ['# VCS / IDE', '.git', '.gitignore', '.github', '.idea', '.vscode', '*.swp', '.DS_Store'];
    for (const s of lines(t)) { const p = DI[s.toLowerCase()]; if (!p) throw new Error(`Unknown stack "${s}". Known: ${Object.keys(DI).join(', ')}`); L.push('', `# ${s}`, ...p); }
    if (o.secrets) L.push('', '# secrets', '.env', '.env.*', '*.pem', '*.key', 'id_rsa*');
    if (o.docs) L.push('', '# docs', '*.md', '!README.md', 'docs');
    if (o.docker) L.push('', '# docker', 'Dockerfile*', 'docker-compose*.yml', '.dockerignore');
    L.push('', '# logs / OS', '*.log', 'Thumbs.db');
    return L.join('\n') + '\n';
  },
});

// ---- cron dialects ----
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MACROS = { '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *', '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *' };
const dowName = (f) => f.split(',').map((p) => { const [b, st] = p.split('/'); return b.replace(/\d+/g, (d) => { if (+d > 7) throw new Error(`Bad day-of-week ${d}`); return DOW[+d % 7]; }) + (st ? '/' + st : ''); }).join(',');
T.push({
  id: 'cron-dialect-converter', cat: 'Dev Config++', title: 'Cron Dialect Converter', desc: 'Convert a standard 5-field cron to Quartz, Spring, AWS EventBridge, GitHub Actions and Kubernetes CronJob syntax.',
  labels: ['Standard cron (min hour dom month dow) or @daily etc.'], sample: '30 2 * * 1-5',
  opts: [txt('tz', 'Time zone for K8s CronJob', 'Etc/UTC')],
  run: ([t], o) => {
    let c = t.trim().replace(/\s+/g, ' '); c = MACROS[c.toLowerCase()] || c;
    const f = c.split(' '); if (f.length !== 5) throw new Error('Expected 5 fields: minute hour day-of-month month day-of-week');
    f.forEach((x, i) => { if (!/^[0-9A-Za-z*,\/\-]+$/.test(x)) throw new Error(`Invalid characters in field ${i + 1}: ${x}`); });
    const [mi, hr, dm, mo, dw] = f, domSet = dm !== '*', dowSet = dw !== '*';
    const dn = dowName(dw);
    const qd = domSet ? dm : dowSet ? '?' : '*', qw = domSet ? '?' : dowSet ? dn : '?';
    const note = domSet && dowSet ? '\n# Note: standard cron ORs day-of-month and day-of-week; Quartz/EventBridge cannot, so the day-of-week was dropped. Split into two schedules if you need both.\n' : '';
        return `# Standard / Unix / Kubernetes\n${c}\n\n# Quartz (sec min hour dom month dow [year])\n0 ${mi} ${hr} ${qd} ${mo} ${qw}\n\n# Spring @Scheduled (sec min hour dom month dow)\n0 ${mi} ${hr} ${dm} ${mo} ${dowSet ? dn : '*'}\n\n# AWS EventBridge / CloudWatch (min hour dom month dow year)\ncron(${mi} ${hr} ${qd} ${mo} ${qw} *)\n\n# GitHub Actions (UTC only)\non:\n  schedule:\n    - cron: '${c}'\n\n# Kubernetes CronJob\nspec:\n  schedule: "${c}"\n  timeZone: ${o.tz.trim() || 'Etc/UTC'}\n${note}`;
  },
});

T.push({
  id: 'redirect-rules-converter', cat: 'Dev Config++', title: 'Redirect Rules Converter', desc: 'Turn "from to [code]" lines into nginx, Apache, Caddy, Netlify _redirects or Vercel JSON redirects.',
  labels: ['from to [status] (one per line)'], sample: '/old-page /new-page 301\n/blog/2019 /archive 302\n/legacy https://example.com/new',
  opts: [sel('fmt', 'Output', ['nginx', 'Apache', 'Caddy', 'Netlify _redirects', 'Vercel JSON'])],
  run: ([t], o) => {
    const R = lines(t).filter((l) => !l.startsWith('#')).map((l) => {
      const [a, b, c = '301'] = l.split(/\s+/); if (!a || !b) throw new Error(`Need "from to": ${l}`);
      if (!/^\//.test(a)) throw new Error(`"from" must be a path starting with /: ${a}`);
      if (!/^(301|302|303|307|308)$/.test(c)) throw new Error(`Unsupported status ${c}`);
      return [a, b, c];
    });
    if (!R.length) throw new Error('Add at least one rule');
    switch (o.fmt) {
      case 'nginx': return R.map(([a, b, c]) => `location = ${a} {\n    return ${c} ${b};\n}`).join('\n\n') + '\n';
      case 'Apache': return R.map(([a, b, c]) => `Redirect ${c} ${a} ${b}`).join('\n') + '\n';
      case 'Caddy': return R.map(([a, b, c]) => `redir ${a} ${b} ${c === '301' ? 'permanent' : c === '302' ? 'temporary' : c}`).join('\n') + '\n';
      case 'Netlify _redirects': return R.map(([a, b, c]) => `${a} ${b} ${c}`).join('\n') + '\n';
      default: return J({ redirects: R.map(([a, b, c]) => ({ source: a, destination: b, statusCode: +c })) });
    }
  },
});

// ---- brace-style formatters (nginx, terraform) ----
function braceFmt(src, unit, hcl) {
  const out = []; let depth = 0, blank = false, heredoc = null;
  const strip = (s) => s.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""').replace(hcl ? /(#|\/\/).*$/ : /#.*$/, '');
  for (const raw of src.replace(/\t/g, '    ').split(/\r?\n/)) {
    if (heredoc) { out.push(raw); if (raw.trim() === heredoc) heredoc = null; continue; }
    const t = raw.trim();
    if (!t) { blank = out.length > 0; continue; }
    if (blank) out.push(''); blank = false;
    const s = strip(t);
    const open = (s.match(/[{[(]/g) || []).length, close = (s.match(/[}\])]/g) || []).length;
    const lead = /^[}\])]/.test(s) ? Math.min(depth, (s.match(/^[}\])]+/)[0] || '').length) : 0;
    out.push(unit.repeat(Math.max(0, depth - lead)) + (hcl ? t.replace(/\s+/g, (m, i, all) => m) : t.replace(/[ ]{2,}/g, (m, i, all) => (/["']/.test(all.slice(0, i)) ? m : ' '))));
    depth = Math.max(0, depth + open - close);
    const hm = hcl && t.match(/<<-?\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/); if (hm) heredoc = hm[1];
  }
  if (hcl) { // align "=" in runs of consecutive attribute lines of equal indent (matches terraform fmt)
    const A = /^(\s*)([A-Za-z_][\w.\-]*|"[^"]*")(\s*)=(?!=)\s*(.*)$/;
    for (let i = 0; i < out.length;) {
      const m = A.exec(out[i]); if (!m) { i++; continue; }
      if (/[{[(]$/.test(m[4])) { out[i] = `${m[1]}${m[2]} = ${m[4]}`; i++; continue; }
      let j = i; const grp = [];
      while (j < out.length) { const k = A.exec(out[j]); if (!k || k[1] !== m[1] || /[{[(]$/.test(k[4])) break; grp.push(k); j++; }
      const w = Math.max(...grp.map((g) => g[2].length));
      grp.forEach((g, n) => { out[i + n] = `${g[1]}${g[2].padEnd(w)} = ${g[4]}`; });
      i = j;
    }
  }
  return out.join('\n') + '\n';
}
// put each directive / brace on its own line (outside quotes and comments)
function ngxSplit(src) {
  let o = '', q = '', cm = false;
  const eol = (i) => { const m = /^[ \t]*\r?\n/.exec(src.slice(i + 1, i + 200)); return m ? m[0].length : 0; };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (cm) { o += c; if (c === '\n') cm = false; continue; }
    if (q) { o += c; if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") { q = c; o += c; } else if (c === '#') { cm = true; o += c; }
    else if (c === '{' || c === ';') { o += (c === '{' ? ' {' : ';') + '\n'; i += eol(i); }
    else if (c === '}') { o += (/\n\s*$/.test(o) || !o ? '' : '\n') + '}\n'; i += eol(i); }
    else o += c;
  }
  return o;
}
T.push({
  id: 'nginx-formatter', cat: 'Dev Config++', title: 'nginx Config Formatter', desc: 'Re-indent nginx.conf by brace depth, collapse spaces and blank lines. Comments and values are never changed.',
  labels: ['nginx config'], sample: 'server{listen 80;\nserver_name   example.com;\n  location / {\nproxy_pass http://app;\n  # keep\n    proxy_set_header Host   $host;\n}\n\n\nlocation /static/ { root /var/www; }\n}',
  opts: [sel('ind', 'Indent', ['4 spaces', '2 spaces', 'tab'])],
  // ponytail: braces inside unquoted regexes (e.g. {2,3}) confuse the depth counter; quote such patterns.
  run: ([t], o) => braceFmt(ngxSplit(t), o.ind === 'tab' ? '\t' : o.ind.startsWith('2') ? '  ' : '    ', false),
});
T.push({
  id: 'terraform-formatter', cat: 'Dev Config++', title: 'Terraform / HCL Formatter', desc: 'Indent HCL by nesting depth and align "=" in consecutive attribute lines (terraform fmt style). Heredocs untouched.',
  labels: ['HCL'], sample: 'resource "aws_instance" "web" {\nami = "ami-123"\n  instance_type   = "t3.micro"\ntags = {\nName = "web"\n    Env = "prod"\n}\n}\n',
  run: ([t]) => braceFmt(t, '  ', true),
});

// ---- GraphQL formatter ----
function gqlFmt(src) {
  const toks = [...src.matchAll(/"""[\s\S]*?"""|"(?:[^"\\]|\\.)*"|#[^\n]*|\.\.\.|[{}()\[\]:!=$@|&,]|[A-Za-z_]\w*|-?[\d.]+(?:[eE][+-]?\d+)?/g)].map((m) => m[0]);
  const out = []; let cur = [], ind = 0, par = 0;
  const join = (a) => { let r = ''; a.forEach((k, i) => { const p = a[i - 1]; if (!i) r = k; else if (k === ',' || k === ':' || k === ')' || k === ']' || k === '!' || k === '(' || (k === '[' && p !== ':' && p !== '=')) r += k; else if (p === '(' || p === '[' || p === '$' || p === '@' || (p === '...' && k !== 'on')) r += k; else r += ' ' + k; }); return r; };
  const flush = (suffix = '') => { if (cur.length || suffix) out.push('  '.repeat(ind) + join(cur) + suffix); cur = []; };
  for (const k of toks) {
    if (k[0] === '#') { flush(); out.push('  '.repeat(ind) + k); continue; }
    if (par) { if (k === '(' || k === '[') par++; if (k === ')' || k === ']') par--; cur.push(k); continue; }
    if (k === ',') continue;
    if (k === '{') { flush(' {'.replace(/^ /, cur.length ? ' ' : '')); ind++; continue; }
    if (k === '}') { flush(); ind = Math.max(0, ind - 1); out.push('  '.repeat(ind) + '}'); if (!ind) out.push(''); continue; }
    if (k === '(' || k === '[') { par++; cur.push(k); continue; }
    const last = cur.at(-1);
    const glue = !last || last === ':' || last === '@' || last === '...' || last === '$' || (last === 'on' && cur.at(-2) === '...') || ind === 0 || k === '@' || k === ':' || k === '!' || k === '=' || k === ')' || last === '=';
    if (ind > 0 && !glue && /^[A-Za-z_.]/.test(k) && !(last === ')' && false)) flush();
    cur.push(k);
  }
  flush();
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
T.push({
  id: 'graphql-query-formatter', cat: 'Dev Config++', title: 'GraphQL Query Formatter', desc: 'Pretty-print GraphQL queries, mutations and fragments with 2-space indentation.',
  labels: ['GraphQL'], sample: 'query GetUser($id: ID!, $first: Int = 10){user(id:$id){id,name posts(first:$first){edges{node{id title}}} ...on Admin{role}}}',
  run: ([t]) => { need(t, 'Paste a GraphQL document'); const bal = (t.match(/{/g) || []).length - (t.match(/}/g) || []).length; if (bal) throw new Error('Unbalanced braces'); return gqlFmt(t); },
});

// =====================================================================================
// Infra+
// =====================================================================================

T.push({
  id: 'terraform-scaffolder', cat: 'Infra+', title: 'Terraform AWS Scaffolder', desc: 'Scaffold providers, remote state, VPC, S3 bucket and EC2 instance blocks (formatted like terraform fmt).',
  inputs: 0, sample: '',
  opts: [txt('region', 'Region', 'eu-west-1'), txt('name', 'Name prefix', 'demo'), sel('backend', 'State backend', ['none', 's3', 'local']), chk('vpc', 'VPC + 2 public subnets', true), chk('s3', 'Private encrypted S3 bucket', true), chk('ec2', 'EC2 instance + security group'), txt('cidr', 'VPC CIDR', '10.0.0.0/16')],
  run: (_, o) => {
    const n = need(o.name, 'Name prefix required'); if (!/^[a-z0-9-]+$/.test(n)) throw new Error('Name prefix: lowercase letters, digits, dashes');
    const r = need(o.region, 'Region required'), B = [];
    B.push(`terraform {\n  required_version = ">= 1.5.0"\n  required_providers {\n    aws = {\n      source = "hashicorp/aws"\n      version = "~> 5.0"\n    }\n  }\n${o.backend === 's3' ? `  backend "s3" {\n    bucket = "${n}-tfstate"\n    key = "terraform.tfstate"\n    region = "${r}"\n    use_lockfile = true\n    encrypt = true\n  }\n` : o.backend === 'local' ? '  backend "local" {\n    path = "terraform.tfstate"\n  }\n' : ''}}`);
    B.push(`provider "aws" {\n  region = var.region\n  default_tags {\n    tags = {\n      Project = var.name\n      ManagedBy = "terraform"\n    }\n  }\n}`);
    B.push(`variable "region" {\n  type = string\n  default = "${r}"\n}\n\nvariable "name" {\n  type = string\n  default = "${n}"\n}`);
    if (o.vpc || o.ec2) B.push(`variable "vpc_cidr" {\n  type = string\n  default = "${o.cidr.trim() || '10.0.0.0/16'}"\n}\n\ndata "aws_availability_zones" "available" {\n  state = "available"\n}\n\nresource "aws_vpc" "main" {\n  cidr_block = var.vpc_cidr\n  enable_dns_support = true\n  enable_dns_hostnames = true\n  tags = { Name = "\${var.name}-vpc" }\n}\n\nresource "aws_internet_gateway" "main" {\n  vpc_id = aws_vpc.main.id\n}\n\nresource "aws_subnet" "public" {\n  count = 2\n  vpc_id = aws_vpc.main.id\n  cidr_block = cidrsubnet(var.vpc_cidr, 8, count.index)\n  availability_zone = data.aws_availability_zones.available.names[count.index]\n  map_public_ip_on_launch = true\n  tags = { Name = "\${var.name}-public-\${count.index}" }\n}\n\nresource "aws_route_table" "public" {\n  vpc_id = aws_vpc.main.id\n  route {\n    cidr_block = "0.0.0.0/0"\n    gateway_id = aws_internet_gateway.main.id\n  }\n}\n\nresource "aws_route_table_association" "public" {\n  count = 2\n  subnet_id = aws_subnet.public[count.index].id\n  route_table_id = aws_route_table.public.id\n}`);
    if (o.s3) B.push(`resource "aws_s3_bucket" "data" {\n  bucket = "\${var.name}-data"\n}\n\nresource "aws_s3_bucket_versioning" "data" {\n  bucket = aws_s3_bucket.data.id\n  versioning_configuration {\n    status = "Enabled"\n  }\n}\n\nresource "aws_s3_bucket_server_side_encryption_configuration" "data" {\n  bucket = aws_s3_bucket.data.id\n  rule {\n    apply_server_side_encryption_by_default {\n      sse_algorithm = "AES256"\n    }\n  }\n}\n\nresource "aws_s3_bucket_public_access_block" "data" {\n  bucket = aws_s3_bucket.data.id\n  block_public_acls = true\n  block_public_policy = true\n  ignore_public_acls = true\n  restrict_public_buckets = true\n}`);
    if (o.ec2) B.push(`data "aws_ssm_parameter" "al2023" {\n  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"\n}\n\nresource "aws_security_group" "web" {\n  name = "\${var.name}-web"\n  vpc_id = aws_vpc.main.id\n  ingress {\n    from_port = 443\n    to_port = 443\n    protocol = "tcp"\n    cidr_blocks = ["0.0.0.0/0"]\n  }\n  egress {\n    from_port = 0\n    to_port = 0\n    protocol = "-1"\n    cidr_blocks = ["0.0.0.0/0"]\n  }\n}\n\nresource "aws_instance" "web" {\n  ami = data.aws_ssm_parameter.al2023.value\n  instance_type = "t3.micro"\n  subnet_id = aws_subnet.public[0].id\n  vpc_security_group_ids = [aws_security_group.web.id]\n  metadata_options {\n    http_tokens = "required"\n  }\n  tags = { Name = "\${var.name}-web" }\n}\n\noutput "instance_public_ip" {\n  value = aws_instance.web.public_ip\n}`);
    return braceFmt(B.join('\n\n'), '  ', true);
  },
});

T.push({
  id: 'ansible-playbook-generator', cat: 'Infra+', title: 'Ansible Playbook Scaffolder', desc: 'Scaffold a playbook with packages, services, users, firewall ports and a restart handler.',
  inputs: 0, sample: '',
  opts: [txt('name', 'Play name', 'Configure web servers'), txt('hosts', 'Hosts', 'webservers'), chk('become', 'become: true', true), txt('pkgs', 'Packages (csv)', 'nginx, git, curl'), txt('svcs', 'Services to enable (csv)', 'nginx'), txt('users', 'Users to create (csv)', 'deploy'), txt('ports', 'Open TCP ports with ufw (csv)', '22, 80, 443'), chk('upd', 'Update apt cache first', true)],
  run: (_, o) => {
    const L = ['---', `- name: ${yq(need(o.name, 'Play name required'))}`, `  hosts: ${yq(need(o.hosts, 'Hosts required'))}`, `  become: ${!!o.become}`, '  tasks:'];
    const pk = csv(o.pkgs), sv = csv(o.svcs), us = csv(o.users), po = csv(o.ports);
    if (o.upd) L.push('    - name: Update apt cache', '      ansible.builtin.apt:', '        update_cache: true', '        cache_valid_time: 3600');
    if (pk.length) L.push('    - name: Install packages', '      ansible.builtin.package:', '        name:', ...pk.map((p) => `          - ${yq(p)}`), '        state: present');
    for (const u of us) L.push(`    - name: Ensure user ${u} exists`, '      ansible.builtin.user:', `        name: ${yq(u)}`, '        shell: /bin/bash', '        state: present');
    if (po.length) { po.forEach((p) => { if (!/^\d+$/.test(p) || +p > 65535) throw new Error(`Bad port ${p}`); }); L.push('    - name: Allow ports through ufw', '      community.general.ufw:', '        rule: allow', '        port: "{{ item }}"', '        proto: tcp', `      loop: [${po.join(', ')}]`); }
    if (sv.length) L.push('    - name: Enable and start services', '      ansible.builtin.service:', '        name: "{{ item }}"', '        state: started', '        enabled: true', `      loop: [${sv.map(yq).join(', ')}]`);
    if (sv.length) L.push('  handlers:', `    - name: Restart ${sv[0]}`, '      ansible.builtin.service:', `        name: ${yq(sv[0])}`, '        state: restarted');
    return L.join('\n') + '\n';
  },
});

T.push({
  id: 'helm-chart-scaffolder', cat: 'Infra+', title: 'Helm Chart Scaffolder', desc: 'Generate a minimal Helm chart (Chart.yaml, values.yaml, helpers, Deployment, Service, optional Ingress).',
  inputs: 0, sample: '',
  opts: [txt('name', 'Chart name', 'myapp'), txt('image', 'Image repository', 'ghcr.io/acme/myapp'), txt('tag', 'Image tag (blank = appVersion)', ''), txt('ver', 'Chart version', '0.1.0'), txt('app', 'appVersion', '1.0.0'), num('port', 'Container port', 8080), num('rep', 'Replicas', 2), chk('ing', 'Ingress template', true), txt('host', 'Ingress host', 'myapp.example.com')],
  run: (_, o) => {
    const n = need(o.name, 'Chart name required'); if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(n)) throw new Error('Chart name: lowercase DNS label');
    const port = +o.port || 8080;
    const files = {
      'Chart.yaml': `apiVersion: v2\nname: ${n}\ndescription: A Helm chart for ${n}\ntype: application\nversion: ${o.ver.trim() || '0.1.0'}\nappVersion: ${JSON.stringify(o.app.trim() || '1.0.0')}\n`,
      'values.yaml': `replicaCount: ${+o.rep || 1}\n\nimage:\n  repository: ${o.image.trim() || 'nginx'}\n  tag: ${JSON.stringify(o.tag.trim())}\n  pullPolicy: IfNotPresent\n\nnameOverride: ""\nfullnameOverride: ""\n\nservice:\n  type: ClusterIP\n  port: 80\n  targetPort: ${port}\n\ningress:\n  enabled: ${!!o.ing}\n  className: ""\n  annotations: {}\n  hosts:\n    - host: ${o.host.trim() || 'chart.example.local'}\n      paths:\n        - path: /\n          pathType: Prefix\n  tls: []\n\nresources:\n  requests:\n    cpu: 100m\n    memory: 128Mi\n  limits:\n    memory: 256Mi\n\nenv: {}\n`,
      'templates/_helpers.tpl': `{{- define "${n}.name" -}}\n{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}\n{{- end }}\n\n{{- define "${n}.fullname" -}}\n{{- if .Values.fullnameOverride }}\n{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}\n{{- else }}\n{{- $name := default .Chart.Name .Values.nameOverride }}\n{{- if contains $name .Release.Name }}\n{{- .Release.Name | trunc 63 | trimSuffix "-" }}\n{{- else }}\n{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}\n{{- end }}\n{{- end }}\n{{- end }}\n\n{{- define "${n}.selectorLabels" -}}\napp.kubernetes.io/name: {{ include "${n}.name" . }}\napp.kubernetes.io/instance: {{ .Release.Name }}\n{{- end }}\n\n{{- define "${n}.labels" -}}\nhelm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}\n{{ include "${n}.selectorLabels" . }}\napp.kubernetes.io/version: {{ .Chart.AppVersion | quote }}\napp.kubernetes.io/managed-by: {{ .Release.Service }}\n{{- end }}\n`,
      'templates/deployment.yaml': `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: {{ include "${n}.fullname" . }}\n  labels:\n    {{- include "${n}.labels" . | nindent 4 }}\nspec:\n  replicas: {{ .Values.replicaCount }}\n  selector:\n    matchLabels:\n      {{- include "${n}.selectorLabels" . | nindent 6 }}\n  template:\n    metadata:\n      labels:\n        {{- include "${n}.selectorLabels" . | nindent 8 }}\n    spec:\n      containers:\n        - name: {{ .Chart.Name }}\n          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"\n          imagePullPolicy: {{ .Values.image.pullPolicy }}\n          ports:\n            - name: http\n              containerPort: {{ .Values.service.targetPort }}\n          {{- with .Values.env }}\n          env:\n            {{- range $k, $v := . }}\n            - name: {{ $k }}\n              value: {{ $v | quote }}\n            {{- end }}\n          {{- end }}\n          resources:\n            {{- toYaml .Values.resources | nindent 12 }}\n`,
      'templates/service.yaml': `apiVersion: v1\nkind: Service\nmetadata:\n  name: {{ include "${n}.fullname" . }}\n  labels:\n    {{- include "${n}.labels" . | nindent 4 }}\nspec:\n  type: {{ .Values.service.type }}\n  ports:\n    - port: {{ .Values.service.port }}\n      targetPort: http\n      protocol: TCP\n      name: http\n  selector:\n    {{- include "${n}.selectorLabels" . | nindent 4 }}\n`,
    };
    if (o.ing) files['templates/ingress.yaml'] = `{{- if .Values.ingress.enabled }}\napiVersion: networking.k8s.io/v1\nkind: Ingress\nmetadata:\n  name: {{ include "${n}.fullname" . }}\n  labels:\n    {{- include "${n}.labels" . | nindent 4 }}\n  {{- with .Values.ingress.annotations }}\n  annotations:\n    {{- toYaml . | nindent 4 }}\n  {{- end }}\nspec:\n  {{- with .Values.ingress.className }}\n  ingressClassName: {{ . }}\n  {{- end }}\n  {{- with .Values.ingress.tls }}\n  tls:\n    {{- toYaml . | nindent 4 }}\n  {{- end }}\n  rules:\n    {{- range .Values.ingress.hosts }}\n    - host: {{ .host | quote }}\n      http:\n        paths:\n          {{- range .paths }}\n          - path: {{ .path }}\n            pathType: {{ .pathType }}\n            backend:\n              service:\n                name: {{ include "${n}.fullname" $ }}\n                port:\n                  number: {{ $.Values.service.port }}\n          {{- end }}\n    {{- end }}\n{{- end }}\n`;
    return Object.entries(files).map(([f, c]) => `# ===== ${n}/${f} =====\n${c}`).join('\n');
  },
});

const REGO = {
  'RBAC allow by role': (p, x) => `package ${p}\n\nimport rego.v1\n\ndefault allow := false\n\n# roles: ${x.join(', ')}\nrole_permissions := {\n${x.map((r, i) => `\t${JSON.stringify(r)}: [{"action": "${i === 0 ? '*' : 'read'}", "resource": "*"}]`).join(',\n')},\n}\n\nallow if {\n\tsome role in input.user.roles\n\tsome perm in role_permissions[role]\n\tperm.action in {input.action, "*"}\n\tperm.resource in {input.resource, "*"}\n}\n`,
  'Deny list (blocked values)': (p, x) => `package ${p}\n\nimport rego.v1\n\nblocked := {${x.map((v) => JSON.stringify(v)).join(', ')}}\n\ndeny contains msg if {\n\tinput.name in blocked\n\tmsg := sprintf("%s is not allowed", [input.name])\n}\n`,
  'Kubernetes: deny privileged containers': (p) => `package ${p}\n\nimport rego.v1\n\ndeny contains msg if {\n\tinput.request.kind.kind == "Pod"\n\tsome c in input.request.object.spec.containers\n\tc.securityContext.privileged == true\n\tmsg := sprintf("container %q must not run privileged", [c.name])\n}\n`,
  'Kubernetes: required labels': (p, x) => `package ${p}\n\nimport rego.v1\n\nrequired := {${x.map((v) => JSON.stringify(v)).join(', ')}}\n\ndeny contains msg if {\n\tprovided := {l | some l, _ in input.request.object.metadata.labels}\n\tmissing := required - provided\n\tcount(missing) > 0\n\tmsg := sprintf("missing required labels: %v", [missing])\n}\n`,
  'Terraform plan: no public S3 ACL': (p) => `package ${p}\n\nimport rego.v1\n\ndeny contains msg if {\n\tsome rc in input.resource_changes\n\trc.type == "aws_s3_bucket"\n\trc.change.after.acl in {"public-read", "public-read-write"}\n\tmsg := sprintf("%s must not use a public ACL", [rc.address])\n}\n`,
  'HTTP API authz (method + path)': (p) => `package ${p}\n\nimport rego.v1\n\ndefault allow := false\n\nallow if {\n\tinput.method == "GET"\n\tinput.path == ["public", _]\n}\n\nallow if {\n\tinput.method in {"POST", "PUT", "DELETE"}\n\tinput.user.role == "admin"\n}\n`,
};
T.push({
  id: 'rego-snippet-helper', cat: 'Infra+', title: 'OPA / Rego Snippet Helper', desc: 'Generate common Open Policy Agent policies (RBAC, deny lists, Kubernetes admission, Terraform plan checks) in Rego v1 syntax.',
  labels: ['Values (one per line: roles / blocked names / labels)'], sample: 'admin\nviewer',
  opts: [sel('tpl', 'Template', Object.keys(REGO)), txt('pkg', 'Package', 'policy.main')],
  run: ([t], o) => { const pk = need(o.pkg, 'Package required'); if (!/^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)*$/.test(pk)) throw new Error('Invalid package name'); return REGO[o.tpl](pk, lines(t).length ? lines(t) : ['example']); },
});

const ACTION_RE = /^(\*|[A-Za-z0-9-]+:[A-Za-z0-9*?]+)$/;
T.push({
  id: 'aws-iam-policy-builder', cat: 'Infra+', title: 'AWS IAM Policy Builder', desc: 'Compose an IAM policy from "Effect | actions | resources | Operator key=value" lines.',
  labels: ['Effect | actions | resources | [condition]'], sample: 'Allow | s3:GetObject, s3:ListBucket | arn:aws:s3:::my-bucket, arn:aws:s3:::my-bucket/*\nAllow | logs:CreateLogStream, logs:PutLogEvents | * | StringEquals aws:RequestedRegion=eu-west-1\nDeny | s3:DeleteObject | arn:aws:s3:::my-bucket/*',
  opts: [txt('principal', 'Principal (for resource policies, blank = identity policy)', '')],
  run: ([t], o) => {
    const st = lines(t).filter((l) => !l.startsWith('#')).map((l, i) => {
      const p = l.split('|').map((x) => x.trim()); if (p.length < 3) throw new Error(`Line ${i + 1}: need "Effect | actions | resources"`);
      if (!/^(Allow|Deny)$/.test(p[0])) throw new Error(`Line ${i + 1}: effect must be Allow or Deny`);
      const act = csv(p[1]), res = csv(p[2]); if (!act.length || !res.length) throw new Error(`Line ${i + 1}: actions and resources required`);
      act.forEach((a) => { if (!ACTION_RE.test(a)) throw new Error(`Line ${i + 1}: bad action "${a}"`); });
      const s = { Sid: `Statement${i + 1}`, Effect: p[0] };
      if (o.principal.trim()) s.Principal = o.principal.trim() === '*' ? '*' : { AWS: csv(o.principal).length > 1 ? csv(o.principal) : o.principal.trim() };
      s.Action = act.length === 1 ? act[0] : act; s.Resource = res.length === 1 ? res[0] : res;
      if (p[3]) { const m = p[3].match(/^(\S+)\s+(\S+?)=(.+)$/); if (!m) throw new Error(`Line ${i + 1}: condition must be "Operator key=value[,value]"`); const v = csv(m[3]); s.Condition = { [m[1]]: { [m[2]]: v.length === 1 ? v[0] : v } }; }
      return s;
    });
    if (!st.length) throw new Error('Add at least one statement');
    return J({ Version: '2012-10-17', Statement: st });
  },
});

T.push({
  id: 'aws-iam-policy-linter', cat: 'Infra+', title: 'AWS IAM Policy Linter', desc: 'Check an IAM policy JSON for wildcards, privilege-escalation actions, missing Version and structural mistakes.',
  labels: ['IAM policy JSON'], sample: '{"Version":"2008-10-17","Statement":[{"Effect":"Allow","Action":"*","Resource":"*"},{"Effect":"Allow","Action":["iam:PassRole","s3:*"],"Resource":"*"},{"Effect":"Allow","NotAction":"iam:*","Resource":"arn:aws:s3:::b/*"},{"Sid":"x","Effect":"Permit","Action":"s3Get","Resource":"*"}]}',
  run: ([t]) => {
    const p = jparse(t, 'policy JSON'), F = [], add = (sev, m) => F.push(`${sev.padEnd(7)} ${m}`);
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error('Policy must be a JSON object');
    if (!p.Version) add('WARNING', 'Missing Version; add "2012-10-17" so policy variables work'); else if (p.Version !== '2012-10-17') add('WARNING', `Version "${p.Version}" is outdated; use "2012-10-17"`);
    const st = Array.isArray(p.Statement) ? p.Statement : p.Statement ? [p.Statement] : []; if (!st.length) add('ERROR', 'No Statement');
    const sids = new Set(), arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
    const risky = ['iam:PassRole', 'iam:CreateAccessKey', 'iam:AttachUserPolicy', 'iam:AttachRolePolicy', 'iam:PutUserPolicy', 'iam:PutRolePolicy', 'iam:CreatePolicyVersion', 'iam:UpdateAssumeRolePolicy', 'sts:AssumeRole', 'lambda:UpdateFunctionCode', 'kms:Decrypt'];
    st.forEach((s, i) => {
      const w = `Statement[${i}]${s.Sid ? ` (${s.Sid})` : ''}`;
      if (s.Sid) { if (sids.has(s.Sid)) add('ERROR', `${w}: duplicate Sid`); sids.add(s.Sid); if (!/^[A-Za-z0-9]+$/.test(s.Sid)) add('ERROR', `${w}: Sid must be alphanumeric`); }
      if (s.Effect !== 'Allow' && s.Effect !== 'Deny') add('ERROR', `${w}: Effect must be "Allow" or "Deny", got ${JSON.stringify(s.Effect)}`);
      if (s.Action && s.NotAction) add('ERROR', `${w}: Action and NotAction are mutually exclusive`);
      if (!s.Action && !s.NotAction) add('ERROR', `${w}: missing Action`);
      if (s.Resource && s.NotResource) add('ERROR', `${w}: Resource and NotResource are mutually exclusive`);
      if (!s.Resource && !s.NotResource && !s.Principal) add('ERROR', `${w}: missing Resource`);
      const allow = s.Effect === 'Allow', acts = arr(s.Action), res = arr(s.Resource);
      acts.forEach((a) => { if (typeof a !== 'string' || !ACTION_RE.test(a)) add('ERROR', `${w}: malformed action ${JSON.stringify(a)} (expected service:Action)`); });
      if (allow && acts.includes('*') && res.includes('*')) add('CRITICAL', `${w}: Action "*" on Resource "*" grants full administrator access`);
      else {
        if (allow && acts.includes('*')) add('HIGH', `${w}: Action "*" allows every API call`);
        if (allow && res.includes('*') && !s.Condition) add('MEDIUM', `${w}: Resource "*" without Condition; scope to specific ARNs`);
      }
      acts.filter((a) => /^[\w-]+:\*$/.test(a)).forEach((a) => add(a.startsWith('iam:') || a.startsWith('sts:') ? 'HIGH' : 'MEDIUM', `${w}: service-wide wildcard "${a}"; list only needed actions`));
      if (allow) acts.filter((a) => risky.includes(a)).forEach((a) => add(res.includes('*') ? 'HIGH' : 'LOW', `${w}: "${a}" can enable privilege escalation${res.includes('*') ? ' on all resources' : ''}`));
      if (allow && s.NotAction) add('HIGH', `${w}: Allow + NotAction grants everything except the listed actions`);
      if (allow && s.NotResource) add('MEDIUM', `${w}: Allow + NotResource grants access to all but the listed resources`);
      if (s.Principal === '*' || arr(s.Principal?.AWS).includes('*')) add(s.Condition ? 'MEDIUM' : 'CRITICAL', `${w}: Principal "*" makes this public${s.Condition ? ' (limited by Condition)' : ''}`);
    });
    return (F.length ? F.join('\n') : 'No issues found.') + `\n\n${st.length} statement(s), ${F.length} finding(s).`;
  },
});

const PROM = {
  InstanceDown: [0, (t, d) => ({ e: 'up == 0', s: 'critical', m: `Instance {{ $labels.instance }} is down`, d: `{{ $labels.job }} target has been unreachable for more than ${d}.` })],
  HighCpu: [85, (t) => ({ e: `100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > ${t}`, s: 'warning', m: 'High CPU on {{ $labels.instance }}', d: `CPU usage above ${t}% (now {{ $value | printf "%.1f" }}%).` })],
  HighMemory: [90, (t) => ({ e: `(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100 > ${t}`, s: 'warning', m: 'High memory on {{ $labels.instance }}', d: `Memory usage above ${t}%.` })],
  DiskLow: [10, (t) => ({ e: `node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay"} * 100 < ${t}`, s: 'warning', m: 'Disk almost full on {{ $labels.instance }}', d: `Less than ${t}% free on {{ $labels.mountpoint }}.` })],
  High5xxRate: [5, (t) => ({ e: `sum by (job) (rate(http_requests_total{status=~"5.."}[5m])) / sum by (job) (rate(http_requests_total[5m])) * 100 > ${t}`, s: 'critical', m: 'High 5xx error rate for {{ $labels.job }}', d: `More than ${t}% of requests fail with 5xx.` })],
  HighLatencyP95: [0.5, (t) => ({ e: `histogram_quantile(0.95, sum by (le, job) (rate(http_request_duration_seconds_bucket[5m]))) > ${t}`, s: 'warning', m: 'High p95 latency for {{ $labels.job }}', d: `p95 latency above ${t}s.` })],
  PodCrashLooping: [3, (t) => ({ e: `increase(kube_pod_container_status_restarts_total[15m]) > ${t}`, s: 'critical', m: 'Pod {{ $labels.namespace }}/{{ $labels.pod }} is crash looping', d: `Container restarted more than ${t} times in 15 minutes.` })],
  CertExpiry: [14, (t) => ({ e: `(probe_ssl_earliest_cert_expiry - time()) / 86400 < ${t}`, s: 'warning', m: 'TLS certificate expiring for {{ $labels.instance }}', d: `Certificate expires in less than ${t} days.` })],
};
T.push({
  id: 'prometheus-alert-generator', cat: 'Infra+', title: 'Prometheus Alert Rule Generator', desc: 'Generate a rules file with ready-made alerts (down, CPU, memory, disk, 5xx, latency, crash loops, cert expiry).',
  labels: ['Alert [threshold] per line'], placeholder: [Object.keys(PROM).join('\n')], sample: 'InstanceDown\nHighCpu 85\nHighMemory 90\nDiskLow 10\nHigh5xxRate 5\nHighLatencyP95 0.5\nPodCrashLooping\nCertExpiry 14',
  opts: [txt('group', 'Group name', 'app-alerts'), txt('for', 'for:', '5m'), txt('team', 'Extra label team= (blank to skip)', '')],
  run: ([t], o) => {
    if (!/^\d+(ms|s|m|h|d|w|y)$/.test(o.for.trim())) throw new Error('"for" must look like 5m, 30s, 1h');
    const L = ['groups:', `  - name: ${yq(o.group.trim() || 'alerts')}`, '    rules:'];
    const rows = lines(t); if (!rows.length) throw new Error('List at least one alert');
    for (const r of rows) {
      const [n, th] = r.split(/\s+/), a = PROM[n]; if (!a) throw new Error(`Unknown alert "${n}". Known: ${Object.keys(PROM).join(', ')}`);
      const thr = th == null ? a[0] : Number(th); if (!Number.isFinite(thr)) throw new Error(`Bad threshold for ${n}`);
      const x = a[1](thr, o.for.trim());
      L.push(`      - alert: ${n}`, `        expr: '${x.e.replace(/'/g, "''")}'`, `        for: ${o.for.trim()}`, '        labels:', `          severity: ${x.s}`, ...(o.team.trim() ? [`          team: ${yq(o.team.trim())}`] : []), '        annotations:', `          summary: ${JSON.stringify(x.m)}`, `          description: ${JSON.stringify(x.d)}`);
    }
    return L.join('\n') + '\n';
  },
});

T.push({
  id: 'prometheus-config-generator', cat: 'Infra+', title: 'Prometheus Config Generator', desc: 'Generate prometheus.yml from "job target1,target2 [metrics_path]" lines with Alertmanager and rule files.',
  labels: ['job targets [metrics_path]'], sample: 'node host1:9100,host2:9100\napp app:8080 /actuator/prometheus',
  opts: [txt('scrape', 'scrape_interval', '15s'), txt('eval', 'evaluation_interval', '15s'), txt('am', 'Alertmanager target (blank = none)', 'alertmanager:9093'), txt('rules', 'rule_files glob (blank = none)', 'rules/*.yml'), chk('self', 'Scrape Prometheus itself', true)],
  run: ([t], o) => {
    const L = ['global:', `  scrape_interval: ${o.scrape.trim() || '15s'}`, `  evaluation_interval: ${o.eval.trim() || '15s'}`];
    if (o.rules.trim()) L.push('', 'rule_files:', `  - ${yq(o.rules.trim())}`);
    if (o.am.trim()) L.push('', 'alerting:', '  alertmanagers:', '    - static_configs:', `        - targets: [${JSON.stringify(o.am.trim())}]`);
    L.push('', 'scrape_configs:');
    if (o.self) L.push('  - job_name: prometheus', '    static_configs:', '      - targets: ["localhost:9090"]');
    for (const r of lines(t)) {
      const [job, tg, path] = r.split(/\s+/); if (!tg) throw new Error(`Need "job targets": ${r}`);
      L.push(`  - job_name: ${yq(job)}`, ...(path ? [`    metrics_path: ${yq(path)}`] : []), '    static_configs:', `      - targets: [${csv(tg).map((x) => JSON.stringify(x)).join(', ')}]`);
    }
    return L.join('\n') + '\n';
  },
});

// ---- Dockerfile linter ----
function dfParse(src) {
  const L = src.split(/\r?\n/), ins = [];
  for (let i = 0; i < L.length; i++) {
    let l = L[i]; const line = i + 1;
    if (/^\s*(#|$)/.test(l)) continue;
    while (/\\\s*$/.test(l) && i + 1 < L.length) { i++; if (/^\s*#/.test(L[i])) continue; l = l.replace(/\\\s*$/, ' ') + L[i].trim(); }
    const m = l.match(/^\s*([A-Za-z]+)\s*(.*)$/); if (m) ins.push({ cmd: m[1].toUpperCase(), args: m[2].trim(), line });
  }
  return ins;
}
T.push({
  id: 'dockerfile-linter', cat: 'Infra+', title: 'Dockerfile Linter', desc: 'Hadolint-style checks (DL3xxx rule codes): latest tags, apt/apk/pip hygiene, ADD vs COPY, USER root, CMD form, secrets in ENV.',
  labels: ['Dockerfile'], sample: 'FROM node\nMAINTAINER me@example.com\nENV API_KEY=abc123\nWORKDIR app\nRUN cd /app && apt-get update && apt-get install curl\nRUN pip install flask\nADD . /app\nCOPY --from=builder /x /y\nEXPOSE 99999\nCMD npm start\nUSER root\n',
  run: ([t]) => {
    const I = dfParse(t); if (!I.length) throw new Error('No instructions found');
    const F = [], add = (line, code, sev, m) => F.push({ line, text: `${String(line).padStart(4)}  ${code}  ${sev.padEnd(7)} ${m}` });
    const stages = new Set(); let lastUser = null, sawHealth = false, cmds = 0, eps = 0, prevRun = false, hasWd = false, sawFrom = false;
    I.forEach(({ cmd, args, line }, idx) => {
      if (cmd !== 'RUN') { if (cmd !== 'FROM' || true) prevRun = prevRun && false; }
      if (cmd === 'FROM') {
        sawFrom = true; hasWd = false;
        const m = args.replace(/--\S+\s*/g, '').match(/^(\S+)(?:\s+as\s+(\S+))?/i);
        if (m) {
          const img = m[1];
          if (img !== 'scratch' && !stages.has(img.toLowerCase())) {
            if (!/[:@]/.test(img.replace(/^[^/]*:\d+\//, ''))) add(line, 'DL3006', 'warning', `Always tag the version of an image explicitly (${img})`);
            else if (/:latest$/.test(img)) add(line, 'DL3007', 'warning', 'Using latest is prone to errors; pin the version');
          }
          if (m[2]) { if (stages.has(m[2].toLowerCase())) add(line, 'DL3024', 'error', `FROM aliases must be unique (${m[2]})`); stages.add(m[2].toLowerCase()); }
        }
        lastUser = null;
      } else if (cmd === 'MAINTAINER') add(line, 'DL4000', 'error', 'MAINTAINER is deprecated; use LABEL maintainer=...');
      else if (cmd === 'WORKDIR') { hasWd = true; if (!/^(\/|[A-Za-z]:|\$|"?\$)/.test(args)) add(line, 'DL3000', 'error', 'Use absolute WORKDIR'); }
      else if (cmd === 'USER') lastUser = args;
      else if (cmd === 'HEALTHCHECK') sawHealth = true;
      else if (cmd === 'ADD' && !/https?:\/\/|\.(tar|tgz|gz|xz|bz2)\b/.test(args)) add(line, 'DL3020', 'error', 'Use COPY instead of ADD for files and folders');
      else if (cmd === 'COPY') {
        const f = args.match(/--from=(\S+)/); if (f && !/^\d+$/.test(f[1]) && !stages.has(f[1].toLowerCase()) && !/\//.test(f[1])) add(line, 'DL3022', 'warning', `COPY --from should reference a previously defined FROM alias (${f[1]})`);
        const parts = args.replace(/--\S+\s*/g, '').split(/\s+/); const dest = parts[parts.length - 1];
        if (dest && !hasWd && !/^(\/|[A-Za-z]:|\$)/.test(dest) && !/^\[/.test(args)) add(line, 'DL3045', 'warning', 'COPY to a relative destination without WORKDIR set');
      } else if (cmd === 'CMD') { cmds++; if (!/^\[/.test(args)) add(line, 'DL3025', 'warning', 'Use arguments JSON notation for CMD and ENTRYPOINT'); }
      else if (cmd === 'ENTRYPOINT') { eps++; if (!/^\[/.test(args)) add(line, 'DL3025', 'warning', 'Use arguments JSON notation for CMD and ENTRYPOINT'); }
      else if (cmd === 'EXPOSE') { for (const p of args.split(/\s+/)) { const n = +p.split('/')[0]; if (/^\d+/.test(p) && (n < 0 || n > 65535)) add(line, 'DL3011', 'error', `Valid UNIX ports range from 0 to 65535 (${p})`); } }
      else if (cmd === 'ENV' || cmd === 'ARG') { if (/(PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY)\w*\s*[= ]\s*[^\s$]/i.test(args)) add(line, 'DL9001', 'warning', `Possible secret in ${cmd}; use build secrets or runtime env instead`); }
      if (cmd === 'RUN') {
        if (prevRun) add(line, 'DL3059', 'info', 'Multiple consecutive RUN instructions; consider consolidation');
        const a = args;
        if (/(^|[;&|]\s*|\s)cd\s/.test(a) && /^cd\s|&&\s*cd\s|;\s*cd\s/.test(a)) add(line, 'DL3003', 'warning', 'Use WORKDIR to switch to a directory');
        if (/\bsudo\b/.test(a)) add(line, 'DL3004', 'error', 'Do not use sudo; run as the right USER instead');
        if (/\bapt\s+(install|update|upgrade)/.test(a)) add(line, 'DL3027', 'warning', 'Do not use apt as it is meant for interactive use; use apt-get');
        if (/apt-get\s+install/.test(a)) {
          if (!/(-y|--yes|--assume-yes|-qq)\b/.test(a)) add(line, 'DL3014', 'warning', 'Use the -y switch to avoid manual input');
          if (!/--no-install-recommends/.test(a)) add(line, 'DL3015', 'info', 'Avoid additional packages by specifying --no-install-recommends');
          const pk = a.replace(/.*apt-get\s+install\s*/, '').split(/[;&|]/)[0].split(/\s+/).filter((x) => x && !x.startsWith('-'));
          if (pk.some((p) => !/=/.test(p))) add(line, 'DL3008', 'warning', 'Pin versions in apt-get install (package=version)');
          if (!/rm\s+-rf\s+\/var\/lib\/apt\/lists/.test(a)) add(line, 'DL3009', 'info', 'Delete the apt-get lists after installing something');
          if (/apt-get\s+install/.test(a) && !/apt-get\s+update/.test(a)) add(line, 'DL3009', 'info', 'apt-get install without update in the same RUN can use stale caches');
        }
        if (/\bapk\s+add/.test(a)) { if (!/--no-cache/.test(a)) add(line, 'DL3019', 'info', 'Use apk add with --no-cache'); if (/apk\s+add[^;&|]*\s[a-z][\w.+-]*(\s|$)/.test(a) && !/=/.test(a.replace(/.*apk\s+add/, ''))) add(line, 'DL3018', 'warning', 'Pin versions in apk add (package=version)'); }
        if (/\bpip3?\s+install/.test(a)) { if (!/--no-cache-dir/.test(a)) add(line, 'DL3042', 'warning', 'Avoid cache directory with pip install --no-cache-dir'); if (!/==|-r\s|requirements|-e\s|\.\s*$|\.whl/.test(a)) add(line, 'DL3013', 'warning', 'Pin versions in pip install (package==version)'); }
        if (/\bnpm\s+install\b/.test(a) && !/npm\s+install\s+-g|--global/.test(a) && /npm\s+install\s*$/.test(a)) add(line, 'DL3016', 'info', 'Prefer npm ci for reproducible installs');
        if (/\b(wget|curl)\b[^|]*\|\s*(ba)?sh/.test(a)) add(line, 'DL4006', 'warning', 'Piping downloads into a shell is risky; verify a checksum first');
        if (/\|/.test(a) && !/pipefail/.test(a) && !/\|\|/.test(a.replace(/\|\|/g, '')) && /[^|]\|[^|]/.test(a)) add(line, 'DL4006', 'warning', 'Set the SHELL option -o pipefail before RUN with a pipe in it');
        if (/\b(ssh|vim|nano|shutdown|service|ps|free|top|kill|mount)\s/.test(a.replace(/^(.*?&&\s*)?/, '')) && /^(ssh|vim|nano|shutdown|service|ps|free|top|kill|mount)\b/.test(a)) add(line, 'DL3001', 'info', 'Command is not meaningful inside a container build');
        prevRun = true;
      } else if (cmd !== 'ONBUILD') prevRun = false;
      if (cmd !== 'RUN') prevRun = false;
    });
    if (!sawFrom) add(1, 'DL3061', 'error', 'Dockerfile must begin with FROM (or ARG)');
    if (lastUser === 'root' || lastUser === '0') add(I.findLast((x) => x.cmd === 'USER').line, 'DL3002', 'warning', 'Last USER should not be root');
    if (lastUser === null && sawFrom) add(I.at(-1).line, 'DL3002', 'info', 'No USER instruction: container will run as root');
    if (cmds > 1) add(I.findLast((x) => x.cmd === 'CMD').line, 'DL4003', 'warning', 'Multiple CMD instructions; only the last takes effect');
    if (eps > 1) add(I.findLast((x) => x.cmd === 'ENTRYPOINT').line, 'DL4004', 'error', 'Multiple ENTRYPOINT instructions; only the last takes effect');
    if (!sawHealth) add(I.at(-1).line, 'DL3057', 'info', 'HEALTHCHECK instruction missing');
    F.sort((a, b) => a.line - b.line);
    const cnt = (s) => F.filter((f) => f.text.includes(` ${s} `)).length;
    return (F.length ? F.map((f) => f.text).join('\n') : 'No issues found.') + `\n\n${F.length} finding(s): ${cnt('error')} error, ${cnt('warning')} warning, ${cnt('info')} info`;
  },
});

// ---- Kubernetes manifest validator (structural, YAML text based) ----
const KAPI = { Deployment: 'apps/v1', StatefulSet: 'apps/v1', DaemonSet: 'apps/v1', ReplicaSet: 'apps/v1', Service: 'v1', ConfigMap: 'v1', Secret: 'v1', Pod: 'v1', Namespace: 'v1', PersistentVolumeClaim: 'v1', ServiceAccount: 'v1', Ingress: 'networking.k8s.io/v1', NetworkPolicy: 'networking.k8s.io/v1', CronJob: 'batch/v1', Job: 'batch/v1', HorizontalPodAutoscaler: 'autoscaling/v2', Role: 'rbac.authorization.k8s.io/v1', ClusterRole: 'rbac.authorization.k8s.io/v1', RoleBinding: 'rbac.authorization.k8s.io/v1', ClusterRoleBinding: 'rbac.authorization.k8s.io/v1' };
const WORKLOAD = new Set(['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob', 'Pod']);
// returns the indented child lines of top-level key `key` in a doc (array of lines), or null
const kBlock = (L, key) => {
  const re = new RegExp(`^(\\s*)${key}:(.*)$`); const i = L.findIndex((l) => re.test(l)); if (i < 0) return null;
  const base = L[i].length - L[i].trimStart().length, out = [];
  for (let j = i + 1; j < L.length; j++) { if (L[j].trim() === '' || /^\s*#/.test(L[j])) continue; const ind = L[j].length - L[j].trimStart().length; if (ind <= base && !(ind === base && L[j].trimStart().startsWith('- '))) break; out.push(L[j]); }
  return out;
};
T.push({
  id: 'k8s-manifest-validator', cat: 'Infra+', title: 'Kubernetes Manifest Validator', desc: 'Structural lint of YAML manifests: apiVersion/kind pairs, names, selectors vs labels, container images, resources, probes, privileged mode.',
  labels: ['Kubernetes YAML (multi-document ok)'], sample: 'apiVersion: apps/v1beta1\nkind: Deployment\nmetadata:\n  name: Web_App\nspec:\n  replicas: 2\n  selector:\n    matchLabels:\n      app: web\n  template:\n    metadata:\n      labels:\n        app: webb\n    spec:\n      containers:\n        - name: web\n          image: nginx:latest\n          securityContext:\n            privileged: true\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: web\nspec:\n  selector:\n    app: web\n',
  // ponytail: indentation/regex based (no YAML parser): flow-style ({a: b}) manifests are only partly checked.
  run: ([t]) => {
    const docs = t.split(/^---\s*$/m).map((d) => d.replace(/\r/g, '')).filter((d) => d.replace(/^\s*#.*$/gm, '').trim());
    if (!docs.length) throw new Error('No YAML documents found');
    const F = [];
    docs.forEach((d, n) => {
      const L = d.split('\n'), at = (sev, m) => F.push(`doc ${n + 1}  ${sev.padEnd(7)} ${m}`);
      if (L.some((l) => /^\s*\t/.test(l))) at('ERROR', 'Tab character used for indentation (YAML requires spaces)');
      const top = (k) => { const m = d.match(new RegExp(`^${k}:[ \\t]*(.*?)[ \\t]*(#.*)?$`, 'm')); return m ? m[1].replace(/^["']|["']$/g, '') : null; };
      const api = top('apiVersion'), kind = top('kind');
      if (!api) at('ERROR', 'missing apiVersion'); if (!kind) { at('ERROR', 'missing kind'); return; }
      const w = kind;
      if (api && KAPI[kind] && KAPI[kind] !== api) at('ERROR', `${w}: apiVersion should be ${KAPI[kind]}, got ${api}`);
      if (api && /beta|v1alpha/.test(api)) at('WARNING', `${w}: apiVersion ${api} is beta/alpha and may be removed`);
      const meta = kBlock(L, 'metadata'); const nm = meta && meta.map((l) => l.match(/^\s{2}name:\s*(\S+)/)).find(Boolean);
      if (!nm) at('ERROR', `${w}: metadata.name missing`); else { const v = nm[1].replace(/^["']|["']$/g, ''); if (!/^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/.test(v) || v.length > 253) at('ERROR', `${w}: metadata.name "${v}" is not a valid DNS-1123 name (lowercase, digits, - and .)`); }
      const spec = kBlock(L, 'spec') || [];
      if (['Deployment', 'StatefulSet', 'DaemonSet', 'Service', 'Ingress', 'Job', 'CronJob', 'Pod', 'PersistentVolumeClaim', 'NetworkPolicy', 'HorizontalPodAutoscaler'].includes(kind) && !spec.length) at('ERROR', `${w}: missing spec`);
      if (['ConfigMap', 'Secret'].includes(kind) && !/^(data|stringData|binaryData):/m.test(d)) at('INFO', `${w}: has no data`);
      if (kind === 'Service') { if (!spec.some((l) => /^\s+selector:/.test(l)) && !/type:\s*ExternalName/.test(d)) at('WARNING', 'Service: no selector (no endpoints unless managed manually)'); if (!spec.some((l) => /^\s+ports:/.test(l)) && !/type:\s*ExternalName/.test(d)) at('ERROR', 'Service: spec.ports missing'); }
      if (['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet'].includes(kind)) {
        const sel = kBlock(spec, 'selector'), tmpl = kBlock(spec, 'template');
        if (!sel) at('ERROR', `${w}: spec.selector is required`); if (!tmpl) at('ERROR', `${w}: spec.template is required`);
        if (sel && tmpl) {
          const ml = kBlock(sel, 'matchLabels'); const labs = kBlock(kBlock(tmpl, 'metadata') || [], 'labels') || [];
          (ml || []).forEach((l) => { const m = l.match(/^\s*([\w./-]+):\s*(\S+)/); if (m && !labs.some((x) => new RegExp(`^\\s*${m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*["']?${m[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/^["']|["']$/g, '')}["']?\\s*$`).test(x))) at('ERROR', `${w}: selector ${m[1]}=${m[2]} does not match template labels`); });
        }
      }
      if (WORKLOAD.has(kind)) {
        const ci = L.findIndex((l) => /^\s*containers:\s*$/.test(l));
        if (ci < 0) at('ERROR', `${w}: no containers defined`);
        else {
          const ind = L[ci].length - L[ci].trimStart().length, body = [];
          for (let j = ci + 1; j < L.length; j++) { const li = L[j].length - L[j].trimStart().length; if (L[j].trim() && li < ind) break; if (L[j].trim() && li === ind && !L[j].trimStart().startsWith('-')) break; body.push(L[j]); }
          const ctr = []; body.forEach((l) => { if (/^\s*-\s/.test(l) && l.length - l.trimStart().length === ind + (L[ci + 1] && /^\s*-/.test(L[ci + 1]) && L[ci + 1].length - L[ci + 1].trimStart().length === ind ? 0 : 2) - (0)) ctr.push([]); if (ctr.length) ctr.at(-1).push(l); });
          const items = ctr.length ? ctr : [body];
          items.forEach((c, k) => {
            const s = c.join('\n'), cn = (s.match(/name:\s*(\S+)/) || [])[1] || `#${k + 1}`;
            const img = (s.match(/\bimage:\s*["']?([^\s"']+)/) || [])[1];
            if (!img) at('ERROR', `${w}: container ${cn} has no image`);
            else if (!/[:@]/.test(img.replace(/^[^/]*:\d+\//, ''))) at('WARNING', `${w}: container ${cn} image "${img}" has no tag (implies :latest)`);
            else if (/:latest$/.test(img)) at('WARNING', `${w}: container ${cn} uses :latest`);
            if (!/\bresources:/.test(s)) at('INFO', `${w}: container ${cn} has no resource requests/limits`);
            if (!/\b(readinessProbe|livenessProbe|startupProbe):/.test(s) && kind !== 'Job' && kind !== 'CronJob') at('INFO', `${w}: container ${cn} has no probes`);
            if (/privileged:\s*true/.test(s)) at('ERROR', `${w}: container ${cn} runs privileged`);
            if (/allowPrivilegeEscalation:\s*true/.test(s)) at('WARNING', `${w}: container ${cn} allows privilege escalation`);
            if (/runAsUser:\s*0\b/.test(s)) at('WARNING', `${w}: container ${cn} runs as root (runAsUser: 0)`);
          });
        }
        if (/hostNetwork:\s*true/.test(d)) at('WARNING', `${w}: hostNetwork is enabled`);
        if (/hostPath:/.test(d)) at('WARNING', `${w}: hostPath volume used`);
      }
      if (kind === 'Ingress' && !/rules:|defaultBackend:/.test(d)) at('WARNING', 'Ingress: no rules or defaultBackend');
    });
    const e = F.filter((f) => f.includes(' ERROR ')).length;
    return (F.length ? F.join('\n') : 'No issues found.') + `\n\n${docs.length} document(s), ${F.length} finding(s), ${e} error(s).`;
  },
});

const urlenc = (s) => encodeURIComponent(s);
T.push({
  id: 'postgres-connection-builder', cat: 'Infra+', title: 'PostgreSQL Connection String Builder', desc: 'Build a postgres:// URI, libpq keyword string, JDBC URL, psql command and PG* env vars from parts (percent-encodes the password).',
  inputs: 0, sample: '',
  opts: [txt('host', 'Host', 'localhost'), num('port', 'Port', 5432), txt('db', 'Database', 'app'), txt('user', 'User', 'postgres'), txt('pw', 'Password', 'p@ss:w/rd'), sel('ssl', 'sslmode', ['prefer', 'disable', 'require', 'verify-ca', 'verify-full']), txt('app', 'application_name', ''), num('timeout', 'connect_timeout (s, 0 = default)', 0)],
  run: (_, o) => {
    const h = need(o.host, 'Host required'), db = need(o.db, 'Database required'), port = +o.port || 5432;
    const q = [`sslmode=${o.ssl}`, ...(o.app.trim() ? [`application_name=${urlenc(o.app.trim())}`] : []), ...(+o.timeout ? [`connect_timeout=${+o.timeout}`] : [])];
    const auth = o.user.trim() ? urlenc(o.user.trim()) + (o.pw ? ':' + urlenc(o.pw) : '') + '@' : '';
    const hostp = h.includes(':') ? `[${h}]` : h;
    const kv = (k, v) => `${k}=${/[\s'\\]/.test(v) || v === '' ? `'${v.replace(/([\\'])/g, '\\$1')}'` : v}`;
    return `# URI (DATABASE_URL)\npostgresql://${auth}${hostp}:${port}/${urlenc(db)}?${q.join('&')}\n\n# libpq keyword/value\n${[kv('host', h), kv('port', String(port)), kv('dbname', db), ...(o.user.trim() ? [kv('user', o.user.trim())] : []), ...(o.pw ? [kv('password', o.pw)] : []), kv('sslmode', o.ssl)].join(' ')}\n\n# JDBC\njdbc:postgresql://${hostp}:${port}/${urlenc(db)}?${[`sslmode=${o.ssl}`, ...(o.user.trim() ? [`user=${urlenc(o.user.trim())}`] : []), ...(o.pw ? [`password=${urlenc(o.pw)}`] : [])].join('&')}\n\n# psql\npsql "postgresql://${o.user.trim() ? urlenc(o.user.trim()) + '@' : ''}${hostp}:${port}/${urlenc(db)}?sslmode=${o.ssl}"\n\n# Environment\nPGHOST=${h}\nPGPORT=${port}\nPGDATABASE=${db}\n${o.user.trim() ? `PGUSER=${o.user.trim()}\n` : ''}${o.pw ? `PGPASSWORD=${o.pw}\n` : ''}PGSSLMODE=${o.ssl}\n`;
  },
});

// =====================================================================================
// Data Models / LLM
// =====================================================================================

const PRISMA_T = { int: 'Int', string: 'String', str: 'String', bool: 'Boolean', boolean: 'Boolean', float: 'Float', datetime: 'DateTime', date: 'DateTime', json: 'Json', bigint: 'BigInt', decimal: 'Decimal', bytes: 'Bytes' };
T.push({
  id: 'prisma-schema-generator', cat: 'Data Models', title: 'Prisma Schema Generator', desc: 'Write schema.prisma from a compact DSL; relations get foreign keys and back-references automatically.',
  labels: ['Model: field:type modifiers, ...'], placeholder: ['User: id:int pk, email:string unique, name:string?, posts:Post[]\nPost: id:int pk, title:string, published:bool default=false, author:User, createdAt:datetime now'],
  sample: 'User: id:int pk, email:string unique, name:string?, posts:Post[], createdAt:datetime now\nPost: id:int pk, title:string, published:bool default=false, author:User, createdAt:datetime now',
  opts: [sel('prov', 'Provider', ['postgresql', 'mysql', 'sqlite', 'sqlserver', 'mongodb', 'cockroachdb']), txt('env', 'Env var for URL', 'DATABASE_URL'), chk('map', 'Add @@map snake_case table names')],
  // ponytail: one relation per model pair (no named relations); add @relation("name") by hand for multiples.
  run: ([t], o) => {
    const M = new Map(), mongo = o.prov === 'mongodb';
    for (const l of lines(t).filter((x) => !x.startsWith('#'))) {
      const i = l.indexOf(':'); if (i < 1) throw new Error(`Expected "Model: fields": ${l}`);
      const name = l.slice(0, i).trim(); if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) throw new Error(`Model name must be PascalCase: ${name}`);
      const fields = csv(l.slice(i + 1)).map((f) => {
        const m = f.match(/^(\w+)\s*:\s*([A-Za-z0-9]+)(\[\]|\?)?\s*(.*)$/); if (!m) throw new Error(`Bad field "${f}" in ${name}`);
        const mods = m[4].split(/\s+/).filter(Boolean), raw = m[2], key = raw.toLowerCase();
        return { name: m[1], raw, scalar: PRISMA_T[key] || null, suf: m[3] || '', mods };
      });
      M.set(name, fields);
    }
    if (!M.size) throw new Error('Add at least one model');
    const pk = (mn) => M.get(mn)?.find((f) => f.mods.includes('pk')) || M.get(mn)?.find((f) => f.name === 'id');
    const out = new Map([...M].map(([k, v]) => [k, []]));
    const has = new Set();
    for (const [mn, fs] of M) for (const f of fs) if (!f.scalar && M.has(f.raw)) has.add(`${mn}>${f.raw}`);
    for (const [mn, fs] of M) {
      for (const f of fs) {
        const a = [];
        if (f.scalar) {
          const ty = (mongo && f.mods.includes('pk')) ? 'String' : f.scalar;
          if (f.mods.includes('pk')) a.push('@id', ...(mongo ? ['@default(auto())', '@map("_id")', '@db.ObjectId'] : ty === 'Int' || ty === 'BigInt' ? ['@default(autoincrement())'] : ty === 'String' ? [f.mods.includes('cuid') ? '@default(cuid())' : '@default(uuid())'] : []));
          if (f.mods.includes('unique')) a.push('@unique'); if (f.mods.includes('now')) a.push('@default(now())'); if (f.mods.includes('updatedAt')) a.push('@updatedAt');
          for (const md of f.mods) { const d = md.match(/^default=(.+)$/); if (d) a.push(`@default(${/^(true|false|-?\d+(\.\d+)?|now\(\)|uuid\(\)|cuid\(\)|autoincrement\(\))$/.test(d[1]) ? d[1] : JSON.stringify(d[1])})`); const mp = md.match(/^map=(.+)$/); if (mp) a.push(`@map(${JSON.stringify(mp[1])})`); }
          out.get(mn).push([f.name, ty + f.suf, a.join(' ')]);
        } else {
          if (!M.has(f.raw)) throw new Error(`${mn}.${f.name}: unknown type or model "${f.raw}"`);
          if (f.suf === '[]') {
            out.get(mn).push([f.name, f.raw + '[]', '']);
            if (!has.has(`${f.raw}>${mn}`)) { const back = mn[0].toLowerCase() + mn.slice(1); const target = pk(mn); if (!target) throw new Error(`${mn} needs a pk field`); const fk = back + 'Id'; out.get(f.raw).push([back, mn + '?', `@relation(fields: [${fk}], references: [${target.name}])`], [fk, (mongo ? 'String' : target.scalar || 'Int') + '?', mongo ? '@db.ObjectId' : '']); has.add(`${f.raw}>${mn}`); }
          } else {
            const target = pk(f.raw); if (!target) throw new Error(`${f.raw} needs a pk field`);
            const fk = f.name + target.name[0].toUpperCase() + target.name.slice(1);
            out.get(mn).push([f.name, f.raw + (f.suf || ''), `@relation(fields: [${fk}], references: [${target.name}])`], [fk, (mongo ? 'String' : target.scalar) + f.suf, mongo ? '@db.ObjectId' : '']);
            if (![...M.get(f.raw)].some((x) => x.raw === mn && x.suf === '[]') && !out.get(f.raw).some((x) => x[1] === mn + '[]')) out.get(f.raw).push([mn[0].toLowerCase() + mn.slice(1) + 's', mn + '[]', '']);
          }
        }
      }
    }
    // fix the back-relation FK rows pushed as 2 separate rows above (relation field + FK scalar)
    const L = [`generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "${o.prov}"\n  url      = env("${o.env.trim() || 'DATABASE_URL'}")\n}`];
    for (const [mn, rows] of out) {
      const w1 = Math.max(...rows.map((r) => r[0].length)), w2 = Math.max(...rows.map((r) => r[1].length));
      const body = rows.map((r) => `  ${r[0].padEnd(w1)} ${r[2] ? r[1].padEnd(w2) + ' ' + r[2] : r[1]}`.trimEnd());
      if (o.map) body.push('', `  @@map(${JSON.stringify(mn.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase() + 's')})`);
      L.push(`model ${mn} {\n${body.join('\n')}\n}`);
    }
    return L.join('\n\n') + '\n';
  },
});

const strictify = (s, req = true) => {
  if (!s || typeof s !== 'object') return s;
  const o = Array.isArray(s) ? s.map((x) => strictify(x)) : { ...s };
  if (Array.isArray(o)) return o;
  if (o.properties) {
    const r = new Set(o.required || []); const p = {};
    for (const [k, v] of Object.entries(o.properties)) { let c = strictify(v); if (!r.has(k) && c && typeof c.type === 'string') c = { ...c, type: [c.type, 'null'] }; p[k] = c; }
    o.properties = p; o.required = Object.keys(p); o.additionalProperties = false;
  }
  if (o.items) o.items = strictify(o.items);
  for (const k of ['anyOf', 'oneOf', 'allOf']) if (o[k]) o[k] = o[k].map((x) => strictify(x));
  if (o.$defs) o.$defs = Object.fromEntries(Object.entries(o.$defs).map(([k, v]) => [k, strictify(v)]));
  return o;
};
T.push({
  id: 'llm-tool-definition-builder', cat: 'Data Models', title: 'LLM Tool Definition Builder', desc: 'Wrap a JSON Schema into OpenAI (Chat / Responses, strict mode) and Anthropic tool-definition JSON.',
  labels: ['JSON Schema for the arguments (type: object)'], sample: '{"type":"object","properties":{"city":{"type":"string","description":"City name"},"unit":{"type":"string","enum":["c","f"]}},"required":["city"]}',
  opts: [txt('name', 'Tool name', 'get_weather'), txt('desc', 'Description', 'Get the current weather for a city.'), sel('target', 'Target', ['All', 'OpenAI Chat Completions', 'OpenAI Responses', 'Anthropic']), chk('strict', 'OpenAI strict mode (all fields required, additionalProperties false)', true)],
  run: ([t], o) => {
    const sch = jparse(t, 'JSON Schema'); if (!sch || sch.type !== 'object') throw new Error('Top-level schema must have "type": "object"');
    const name = need(o.name, 'Tool name required'); if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) throw new Error('Tool name: 1-64 chars of letters, digits, _ or -');
    const { $schema, title, ...params } = sch;
    const oa = o.strict ? strictify(params) : params;
    const chat = { type: 'function', function: { name, description: o.desc.trim(), parameters: oa, ...(o.strict ? { strict: true } : {}) } };
    const resp = { type: 'function', name, description: o.desc.trim(), parameters: oa, ...(o.strict ? { strict: true } : {}) };
    const anth = { name, description: o.desc.trim(), input_schema: params };
    const parts = { 'OpenAI Chat Completions': chat, 'OpenAI Responses': resp, Anthropic: anth };
    if (o.target !== 'All') return J(parts[o.target]);
    return Object.entries(parts).map(([k, v]) => `// ${k}\n${J(v)}`).join('\n');
  },
});

T.push({
  id: 'prompt-template-filler', cat: 'Data Models', title: 'Prompt Template Variable Filler', desc: 'Fill {{variables}} in a prompt template from KEY=VALUE lines or JSON; reports missing and unused variables.',
  inputs: 2, labels: ['Template', 'Values (KEY=VALUE per line, or JSON object)'], sample: 'You are a {{role}} assistant.\nAnswer in {{language}} about {{topic}}.\n{{ missing_var }}', sample2: 'role=support\nlanguage=French\nextra=unused',
  opts: [sel('style', 'Placeholder style', ['{{var}}', '{var}', '${var}', '<var>', '[[var]]']), chk('multi', 'KEY=VALUE values may continue on following lines')],
  run: ([tpl, vals], o) => {
    need(tpl, 'Template is empty');
    let v = {};
    if (/^\s*\{/.test(vals)) v = jparse(vals, 'values JSON'); else {
      let cur = null;
      for (const l of vals.split(/\r?\n/)) { const m = l.match(/^([A-Za-z_][\w.-]*)\s*=(.*)$/); if (m) { cur = m[1]; v[cur] = m[2]; } else if (o.multi && cur && l.trim()) v[cur] += '\n' + l; }
    }
    const re = { '{{var}}': /\{\{\s*([\w.-]+)\s*\}\}/g, '{var}': /\{\s*([\w.-]+)\s*\}/g, '${var}': /\$\{\s*([\w.-]+)\s*\}/g, '<var>': /<\s*([\w.-]+)\s*>/g, '[[var]]': /\[\[\s*([\w.-]+)\s*\]\]/g }[o.style];
    const used = new Set(), miss = new Set();
    const out = tpl.replace(re, (m, k) => { if (k in v) { used.add(k); return typeof v[k] === 'object' ? JSON.stringify(v[k]) : String(v[k]); } miss.add(k); return m; });
    const unused = Object.keys(v).filter((k) => !used.has(k));
    return `${out}\n\n--- report ---\nFilled: ${used.size}\nMissing: ${[...miss].join(', ') || 'none'}\nUnused values: ${unused.join(', ') || 'none'}\nApprox. tokens: ~${fmtN(estTokens(out))}`;
  },
});

T.push({
  id: 'system-prompt-budgeter', cat: 'Data Models', title: 'System Prompt Length Budgeter', desc: 'Split a prompt into "## Section" parts and see approximate token share against a context window and output reserve.',
  labels: ['Prompt with ## Section headings (or XML <tags>)'], sample: '## Role\nYou are a senior support engineer for ACME.\n\n## Rules\n- Never reveal internal tools.\n- Answer in the customer\'s language.\n- Escalate billing disputes.\n\n## Examples\nUser: My invoice is wrong.\nAssistant: I am sorry about that, let me check it.\n',
  opts: [num('ctx', 'Context window (tokens)', 200000), num('out', 'Reserved for output', 4096), num('hist', 'Reserved for history/user input', 8000), sel('fam', 'Model family', Object.keys(FAMILIES))],
  run: ([t], o) => {
    need(t, 'Paste a prompt');
    const parts = []; let cur = { name: '(preamble)', body: '' };
    for (const l of t.split('\n')) { const m = l.match(/^#{1,6}\s+(.+)$/) || l.match(/^<([A-Za-z_][\w-]*)>\s*$/); if (m) { if (cur.body.trim()) parts.push(cur); cur = { name: m[1].trim(), body: '' }; } cur.body += l + '\n'; }
    if (cur.body.trim()) parts.push(cur);
    const rows = parts.map((p) => ({ n: p.name, t: estTokens(p.body, o.fam), c: p.body.length }));
    const total = rows.reduce((a, r) => a + r.t, 0), ctx = +o.ctx || 0, left = ctx - total - (+o.out || 0) - (+o.hist || 0);
    const w = Math.max(...rows.map((r) => r.n.length), 7);
    return `${'Section'.padEnd(w)}  tokens   chars  share\n${rows.map((r) => `${r.n.padEnd(w)}  ${String(r.t).padStart(6)}  ${String(r.c).padStart(6)}  ${(total ? r.t / total * 100 : 0).toFixed(1).padStart(5)}%`).join('\n')}\n${'-'.repeat(w + 24)}\n${'TOTAL'.padEnd(w)}  ${String(total).padStart(6)}\n\nContext window: ${fmtN(ctx)}\nSystem prompt: ~${fmtN(total)} (${ctx ? (total / ctx * 100).toFixed(2) : 0}% of window)\nReserved output + history: ${fmtN((+o.out || 0) + (+o.hist || 0))}\nRemaining for documents/tools: ~${fmtN(left)}${left < 0 ? '  (OVER BUDGET)' : ''}\n(approximate token counts)`;
  },
});

T.push({
  id: 'llm-cost-calculator', cat: 'Data Models', title: 'LLM API Cost Calculator', desc: 'Compute request and monthly cost from tokens and your own per-million prices (prices change; enter current ones).',
  inputs: 0, sample: '',
  opts: [num('pin', 'Input price / 1M tokens (USD)', 3), num('pout', 'Output price / 1M tokens (USD)', 15), num('pcache', 'Cached input price / 1M (USD, 0 = none)', 0.3), num('tin', 'Input tokens per request', 2000), num('tout', 'Output tokens per request', 500), num('hit', 'Cached share of input (%)', 0), num('req', 'Requests per day', 1000), num('days', 'Days per month', 30), num('disc', 'Batch/other discount (%)', 0)],
  run: (_, o) => {
    const hit = Math.min(100, Math.max(0, +o.hit)) / 100, d = 1 - (+o.disc || 0) / 100;
    const per = ((+o.tin * (1 - hit) * o.pin + +o.tin * hit * o.pcache + +o.tout * o.pout) / 1e6) * d;
    const day = per * o.req, mo = day * o.days;
    const f = (x) => '$' + (x < 1 ? x.toFixed(6) : x.toFixed(2));
    return `Per request: ${f(per)}\n  input:  ${f((+o.tin * (1 - hit) * o.pin + +o.tin * hit * o.pcache) / 1e6 * d)}\n  output: ${f(+o.tout * o.pout / 1e6 * d)}\nPer day (${fmtN(o.req)} req): ${f(day)}\nPer month (${o.days} d): ${f(mo)}\nPer year: ${f(mo * 12)}\nTokens per month: ${fmtN((+o.tin + +o.tout) * o.req * o.days)}`;
  },
});

T.push({
  id: 'text-chunk-splitter', cat: 'Data Models', title: 'Text Chunk Splitter (RAG)', desc: 'Split text into overlapping chunks by characters or approximate tokens, preferring paragraph/sentence boundaries.',
  labels: ['Text'], sample: 'Retrieval augmented generation splits long documents into chunks. Each chunk is embedded separately.\n\nOverlap keeps context across boundaries. Sentence aware splitting avoids cutting a thought in half. '.repeat(6),
  opts: [num('size', 'Chunk size', 300), num('overlap', 'Overlap', 40), sel('unit', 'Unit', ['characters', 'approx tokens (x4 chars)']), chk('bound', 'Prefer sentence/paragraph boundaries', true)],
  run: ([t], o) => {
    const k = o.unit.startsWith('approx') ? 4 : 1, size = Math.floor(+o.size * k), ov = Math.floor(+o.overlap * k);
    if (size < 10) throw new Error('Chunk size too small'); if (ov < 0 || ov >= size) throw new Error('Overlap must be >= 0 and smaller than chunk size');
    const s = need(t, 'Paste some text'), ch = []; let i = 0;
    while (i < s.length) {
      let e = Math.min(s.length, i + size);
      if (o.bound && e < s.length) { const win = s.slice(i + Math.floor(size * 0.5), e); const m = [...win.matchAll(/\n\n|[.!?]\s|\n/g)].pop(); if (m) e = i + Math.floor(size * 0.5) + m.index + m[0].length; }
      ch.push(s.slice(i, e)); if (e >= s.length) break; i = Math.max(e - ov, i + 1);
    }
    return `${ch.length} chunk(s)\n\n` + ch.map((c, n) => `--- chunk ${n + 1} (${c.length} chars, ~${estTokens(c)} tokens) ---\n${c}`).join('\n\n');
  },
});

T.push({
  id: 'jsonl-dataset-validator', cat: 'Data Models', title: 'JSONL Dataset Validator', desc: 'Validate JSON Lines fine-tuning / eval datasets: per-line JSON errors, chat "messages" roles, prompt/completion pairs and token estimates.',
  labels: ['JSONL'], sample: '{"messages":[{"role":"system","content":"Be brief."},{"role":"user","content":"Hi"},{"role":"assistant","content":"Hello!"}]}\n{"messages":[{"role":"user","content":"Hi"}]}\n{"prompt":"x"\n{"messages":[{"role":"robot","content":""}]}',
  opts: [sel('fmt', 'Expected format', ['chat messages', 'prompt/completion', 'any JSON object'])],
  run: ([t], o) => {
    const rows = t.split(/\r?\n/).map((l, i) => [i + 1, l]).filter(([, l]) => l.trim()); if (!rows.length) throw new Error('No lines');
    const E = [], roles = new Set(['system', 'user', 'assistant', 'tool', 'developer']); let ok = 0, tok = 0;
    for (const [n, l] of rows) {
      let v; try { v = JSON.parse(l); } catch (e) { E.push(`line ${n}: invalid JSON (${e.message})`); continue; }
      if (!v || typeof v !== 'object' || Array.isArray(v)) { E.push(`line ${n}: must be a JSON object`); continue; }
      const before = E.length;
      if (o.fmt === 'chat messages') {
        if (!Array.isArray(v.messages) || !v.messages.length) E.push(`line ${n}: "messages" must be a non-empty array`);
        else {
          v.messages.forEach((m, i) => { if (!roles.has(m?.role)) E.push(`line ${n}: messages[${i}].role "${m?.role}" invalid`); if (m?.content == null && !m?.tool_calls) E.push(`line ${n}: messages[${i}] has no content`); else if (m.content === '') E.push(`line ${n}: messages[${i}] has empty content`); tok += estTokens(typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content ?? '')); });
          if (!v.messages.some((m) => m?.role === 'assistant')) E.push(`line ${n}: no assistant message to learn from`);
        }
      } else if (o.fmt === 'prompt/completion') {
        for (const k of ['prompt', 'completion']) if (typeof v[k] !== 'string') E.push(`line ${n}: "${k}" must be a string`); else tok += estTokens(v[k]);
      } else tok += estTokens(l);
      if (E.length === before) ok++;
    }
    return `${rows.length} line(s): ${ok} valid, ${rows.length - ok} with problems\nApprox. tokens (content only): ~${fmtN(tok)}\n\n${E.length ? E.join('\n') : 'No problems found.'}`;
  },
});

T.push({
  id: 'mongodb-objectid-parser', cat: 'Data Models', title: 'MongoDB ObjectId Parser', desc: 'Decode ObjectIds into creation time, random value and counter; one per line.',
  labels: ['ObjectIds (24 hex chars, one per line)'], sample: '507f1f77bcf86cd799439011\n65a1b2c3d4e5f60718293a4b',
  run: ([t]) => lines(t).map((id) => {
    if (!/^[0-9a-fA-F]{24}$/.test(id)) throw new Error(`Not a 24-char hex ObjectId: ${id}`);
    const sec = parseInt(id.slice(0, 8), 16);
    return `${id}\n  created: ${new Date(sec * 1000).toISOString()}  (unix ${sec})\n  random:  ${id.slice(8, 18)}\n  counter: ${parseInt(id.slice(18), 16)}`;
  }).join('\n\n'),
});

export default T;
