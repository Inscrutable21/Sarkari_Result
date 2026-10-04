const cheerio = require('cheerio');

const sectionTypes = [
  ['importantDates', /important dates|application begin|schedule/i],
  ['applicationFee', /application fee|payment mode/i],
  ['ageLimit', /age limit|age relaxation|minimum age/i],
  ['eligibility', /eligibility|qualification|experience/i],
  ['selectionProcess', /selection process|selection procedure|mode of selection/i],
  ['salary', /salary|pay scale|pay level|remuneration|stipend/i],
  ['howToApply', /how to (?:apply|fill)|application process|application procedure/i],
  ['documents', /documents|document checklist/i],
  ['examPattern', /exam pattern|syllabus|examination scheme|marking scheme/i],
  ['physicalStandards', /physical|pet\b|pst\b/i],
  ['vacancy', /vacancy|vacancies|post name|category wise/i]
];
const clean = text => String(text || '').replace(/\s+/g, ' ').trim();

/** Extract text and structured rows only. Source HTML is never sent to the UI. */
function extractAdditionalDetails(html, sourceUrl) {
  const $ = cheerio.load(html);
  $('script, style, nav, footer, iframe, form, .advertisement, .adsbygoogle').remove();
  const root = $('article, .entry-content, main').first().length
    ? $('article, .entry-content, main').first() : $('body');
  const sections = [];
  const tables = [];
  const links = [];
  const fields = { importantDates: {}, applicationFee: {}, ageLimit: {} };
  const seen = new Set();

  function addSection(title, lines) {
    const type = sectionTypes.find(([, pattern]) => pattern.test(title))?.[0];
    if (!type) return;
    const items = [...new Set(lines.map(clean).filter(line => line && line !== clean(title)))].slice(0, 80);
    if (!items.length) return;
    const key = `${type}:${items.join('|')}`;
    if (seen.has(key)) return;
    seen.add(key);
    sections.push({ type, title: clean(title).slice(0, 250), items });
    if (fields[type]) for (const item of items) {
      const colon = item.indexOf(':');
      if (colon > 0) fields[type][item.slice(0, colon).trim()] = item.slice(colon + 1).trim();
      else fields[type][item] = '';
    }
  }

  root.find('td, th').each((_, cell) => {
    if ($(cell).find('table').length) return;
    const heading = $(cell).find('h1,h2,h3,h4,h5,strong,b').first();
    const title = clean(heading.text());
    const lines = $(cell).find('li').length
      ? $(cell).find('li').map((_, el) => $(el).text()).get()
      : $(cell).find('p').map((_, el) => $(el).text()).get();
    if (lines.length) addSection(title || clean($(cell).text()).slice(0, 160), lines);
  });

  root.find('h2,h3,h4,h5').each((_, heading) => {
    const content = $(heading).nextUntil('h1,h2,h3,h4,h5');
    const lines = [];
    content.each((_, el) => {
      if ($(el).is('table')) return;
      if ($(el).find('li').length) lines.push(...$(el).find('li').map((_, li) => $(li).text()).get());
      else lines.push($(el).text());
    });
    addSection($(heading).text(), lines);
  });

  // Preserve non-three-column breakdowns: reservation, district, physical and
  // exam-pattern tables. Split layout tables at spanning section headings.
  root.find('table').each((_, table) => {
    let title = clean($(table).find('caption').first().text()) || 'Additional notification details';
    let rows = [];
    function flush() {
      if (rows.length >= 2 && rows.some(row => row.length >= 2)) {
        tables.push({ title, rows: rows.slice(0, 150) });
      }
      rows = [];
    }
    $(table).find('tr').each((_, tr) => {
      if ($(tr).closest('table')[0] !== table) return;
      const cells = $(tr).children('td,th');
      if (cells.length === 1 && cells.find('li').length) {
        addSection(title, cells.find('li').map((_, li) => $(li).text()).get());
      }
      if (cells.find('table').length || (cells.length <= 2 && cells.find('li').length) || cells.find('a').length) { flush(); return; }
      const values = cells.map((_, cell) => clean($(cell).text())).get();
      if (values.length === 1) {
        flush();
        if (values[0]) title = values[0].slice(0, 250);
      } else if (values.length >= 2 && values.some(Boolean)) rows.push(values.slice(0, 12));
    });
    flush();
  });

  root.find('a[href]').each((_, anchor) => {
    const label = clean($(anchor).text());
    try {
      const url = new URL($(anchor).attr('href'), sourceUrl);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
      if (/whatsapp|t\.me|facebook|youtube|play\.google|instagram/i.test(url.hostname)) return;
      const rowLabel = clean($(anchor).closest('tr').children('td,th').first().text());
      const finalLabel = /click here|^link\b/i.test(label) ? rowLabel : label;
      if (!/apply|notification|advertisement|official|download|syllabus|result|admit|registration|answer key/i.test(finalLabel)) return;
      if (!links.some(link => link.url === url.href)) links.push({ label: finalLabel.slice(0, 250), url: url.href });
    } catch {}
  });

  return { schemaVersion: 2, sections: sections.slice(0, 40), additionalTables: tables.slice(0, 20), extractedLinks: links.slice(0, 30), ...fields };
}

module.exports = { extractAdditionalDetails };
