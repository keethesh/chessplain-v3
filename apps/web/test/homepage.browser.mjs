// Run with a Puppeteer-compatible page against the running web app.
export async function verifyHomepage(page, baseURL = 'http://localhost:3000') {
  const failures = [];
  for (const width of [1440, 900, 390, 320]) {
    await page.setViewport({ width, height: 900 });
    await page.goto(baseURL, { waitUntil: 'networkidle2' });
    await page.evaluate(() => document.fonts.ready);
    const state = await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const hero = document.querySelector('.hero-copy');
      const form = document.querySelector('.submit-panel');
      return {
        display: body.display,
        margin: body.margin,
        ink: body.getPropertyValue('--w-ink1').trim(),
        mainCount: document.querySelectorAll('main').length,
        navCount: document.querySelectorAll('nav').length,
        footerCount: document.querySelectorAll('footer').length,
        scrollY,
        overflow: document.documentElement.scrollWidth > innerWidth,
        heroOverflow: hero.scrollWidth > hero.clientWidth,
        formOverflow: form.scrollWidth > form.clientWidth,
      };
    });
    const check = (valid, message) => { if (!valid) failures.push(`${width}px: ${message}`); };
    check(state.display === 'flex' && state.margin === '0px', 'shared layout/reset CSS is missing');
    check(Boolean(state.ink), 'shared theme tokens are missing');
    check(state.mainCount === 1 && state.navCount === 1 && state.footerCount === 1, 'duplicated page landmarks');
    check(state.scrollY === 0, 'page jumps past the hero on arrival');
    check(!state.overflow && !state.heroOverflow && !state.formOverflow, 'content overflows its viewport or container');
  }
  if (failures.length) throw new Error(failures.join('\n'));
  return 'Homepage rendering passed at 1440, 900, 390 and 320px.';
}
