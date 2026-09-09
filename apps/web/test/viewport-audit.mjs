/**
 * Real-viewport layout audit over CDP. No test-runner or browser dependency:
 * Obscura provides the CDP endpoint and Node 22 provides `WebSocket`.
 *
 * Organic traffic from TikTok, Instagram and X arrives almost entirely on
 * phones, much of it inside in-app browsers whose usable width is narrower
 * than the device. 320px is the floor worth supporting (iPhone SE / small
 * Android in an in-app webview).
 *
 * Usage:
 *   obscura serve --port 9222 &
 *   node apps/web/test/viewport-audit.mjs http://127.0.0.1:3111
 */

const BASE = process.argv[2] || 'http://127.0.0.1:3111';
const CDP = process.env.CDP_URL || 'http://127.0.0.1:9222';

const VIEWPORTS = [
  { label: '320px  iPhone SE / in-app webview', width: 320, height: 568, mobile: true },
  { label: '390px  iPhone 14/15', width: 390, height: 844, mobile: true },
  { label: '430px  iPhone Pro Max', width: 430, height: 932, mobile: true },
  { label: '768px  tablet', width: 768, height: 1024, mobile: false },
  { label: '1440px desktop', width: 1440, height: 900, mobile: false },
];

const PAGES = ['/', '/pricing', '/r/demo-sample'];

// Anything below this is unreadable body copy on a phone.
const MIN_BODY_FONT_PX = 12;
// Apple HIG / Material minimum comfortable tap target.
const MIN_TAP_TARGET_PX = 44;

let nextId = 1;

async function connect() {
  // Obscura serves a browser-level endpoint; a page session must be created and
  // attached explicitly (the /json/list page endpoint reports "No page").
  const version = await fetch(`${CDP}/json/version`).then((r) => r.json());
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  const pending = new Map();
  let sessionId = null;

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
  });

  const raw = (method, params = {}, session) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      const msg = { id, method, params };
      if (session) msg.sessionId = session;
      ws.send(JSON.stringify(msg));
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 45000);
    });

  const { targetId } = await raw('Target.createTarget', { url: 'about:blank' });
  ({ sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true }));
  if (!sessionId) throw new Error('could not attach a CDP page session');

  const send = (method, params = {}) => raw(method, params, sessionId);
  return { ws, send };
}

// Runs in the page. Returns every layout problem it can see.
const MEASURE = `(() => {
  const docWidth = document.documentElement.scrollWidth;
  const viewWidth = window.innerWidth;
  const problems = [];

  if (docWidth > viewWidth + 1) {
    const offenders = [...document.querySelectorAll('*')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > viewWidth + 1 || r.left < -1);
      })
      .slice(0, 6)
      .map((el) => {
        const r = el.getBoundingClientRect();
        const cls = typeof el.className === 'string' ? el.className.split(/\\s+/).slice(0, 3).join('.') : '';
        return \`\${el.tagName.toLowerCase()}\${cls ? '.' + cls : ''} [\${Math.round(r.left)}..\${Math.round(r.right)}]\`;
      });
    problems.push(\`horizontal overflow: document \${docWidth}px vs viewport \${viewWidth}px -> \${offenders.join(' | ')}\`);
  }

  const tiny = [...document.querySelectorAll('p, li, span, a, button, label, input')]
    .filter((el) => {
      if (!el.textContent || !el.textContent.trim()) return false;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      return parseFloat(s.fontSize) < ${MIN_BODY_FONT_PX};
    })
    .slice(0, 5)
    .map((el) => \`\${el.tagName.toLowerCase()} \${parseFloat(getComputedStyle(el).fontSize)}px "\${el.textContent.trim().slice(0, 28)}"\`);
  if (tiny.length) problems.push(\`text below ${MIN_BODY_FONT_PX}px: \${tiny.join(' | ')}\`);

  const smallTargets = [...document.querySelectorAll('a, button, input[type=submit], [role=button]')]
    .filter((el) => {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      // Inline text links inside a paragraph are not tap targets in the HIG sense.
      if (el.closest('p, li')) return false;
      // Chessboard squares are grid cells, not controls: they carry no label and
      // their size is dictated by the board width.
      const labelled = (el.textContent || '').trim() || el.getAttribute('aria-label');
      if (!labelled) return false;
      return r.height < ${MIN_TAP_TARGET_PX};
    })
    .slice(0, 5)
    .map((el) => {
      const r = el.getBoundingClientRect();
      return \`\${el.tagName.toLowerCase()} \${Math.round(r.width)}x\${Math.round(r.height)} "\${(el.textContent || '').trim().slice(0, 22)}"\`;
    });
  if (smallTargets.length && window.innerWidth <= 430) {
    problems.push(\`tap target under ${MIN_TAP_TARGET_PX}px tall: \${smallTargets.join(' | ')}\`);
  }

  const landmarks = {
    main: document.querySelectorAll('main').length,
    nav: document.querySelectorAll('nav').length,
    footer: document.querySelectorAll('footer').length,
    h1: document.querySelectorAll('h1').length,
  };
  if (landmarks.main !== 1) problems.push(\`expected exactly 1 <main>, found \${landmarks.main}\`);
  if (landmarks.h1 !== 1) problems.push(\`expected exactly 1 <h1>, found \${landmarks.h1}\`);

  const imgsNoAlt = [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length;
  if (imgsNoAlt) problems.push(\`\${imgsNoAlt} <img> without alt\`);

  return { docWidth, viewWidth, problems, landmarks };
})()`;

async function main() {
  const { ws, send } = await connect();
  for (const domain of ['Page.enable', 'Runtime.enable']) {
    try {
      await send(domain);
    } catch {
      // Optional on this backend.
    }
  }

  const failures = [];
  let checks = 0;

  for (const page of PAGES) {
    for (const vp of VIEWPORTS) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.mobile,
      });

      await send('Page.navigate', { url: `${BASE}${page}` });
      // Settle: the app hydrates and loads fonts before layout is final.
      await new Promise((r) => setTimeout(r, 2200));

      const { result } = await send('Runtime.evaluate', {
        expression: MEASURE,
        returnByValue: true,
        awaitPromise: false,
      });

      checks++;
      const value = result?.value;
      if (!value) {
        failures.push(`${page} @ ${vp.label}: measurement returned nothing`);
        continue;
      }
      for (const problem of value.problems) {
        failures.push(`${page} @ ${vp.label}: ${problem}`);
      }
      const status = value.problems.length ? `${value.problems.length} problem(s)` : 'clean';
      console.log(`  ${page.padEnd(16)} ${vp.label.padEnd(34)} ${status}`);
    }
  }

  ws.close();

  console.log(`\n${checks} page/viewport combinations checked.`);
  if (failures.length) {
    console.error(`\nFAILURES (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('All viewports clean.');
}

main().catch((err) => {
  console.error('audit failed:', err.message);
  process.exit(1);
});
