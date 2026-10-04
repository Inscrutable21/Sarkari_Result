/**
 * Enhanced SarkariResult.com Scraper
 * Extracts comprehensive listings from homepage and dedicated archives,
 * with deep posting details extraction (dates, fees, vacancy table, official links).
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { extractAdditionalDetails } = require('./detailExtractor');
const { safeFetchOptions } = require('../../utils/safeFetch');

const BASE_URL = 'https://www.sarkariresult.com';
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8'
};

/**
 * Normalizes relative URLs to full absolute URLs
 */
function toAbsoluteUrl(url, base = BASE_URL) {
  if (!url) return '';
  try {
    const parsed = new URL(url, base);
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : '';
  } catch { return ''; }
}

/**
 * Cleans extracted text by trimming and collapsing consecutive whitespace
 */
function cleanText(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Generate a clean URL-friendly ID from a title or link
 */
function generateId(title, link = '') {
  if (link) {
    const slug = link.replace(/\/$/, '').split('/').pop();
    if (slug && slug.length > 2 && !slug.includes('.')) {
      return slug.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    }
  }
  return cleanText(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

/**
 * Scrapes SarkariResult.com homepage with Axios + Cheerio
 */
async function scrapeHomepage() {
  try {
    const response = await axios.get(`${BASE_URL}/`, {
      ...safeFetchOptions,
      headers: DEFAULT_HEADERS,
      timeout: 15000
    });

    const $ = cheerio.load(response.data);

    // 1. Trending / Top Job Highlights (.job-box)
    const trending = [];
    $('.job-box a').each((_, el) => {
      const title = cleanText($(el).text());
      const link = toAbsoluteUrl($(el).attr('href'));
      if (title && link) {
        trending.push({
          id: generateId(title, link),
          title,
          link,
          tag: 'Trending'
        });
      }
    });

    // 2. Multi-column Sections from .gb-grid-wrapper
    const sections = {
      results: [],
      admitCards: [],
      latestJobs: [],
      answerKeys: [],
      syllabus: [],
      admissions: [],
      certificates: [],
      important: []
    };

    $('.gb-grid-wrapper .gb-grid-column').each((_, col) => {
      const headerText = cleanText($(col).find('h2, h3, h4, .gb-headline, strong, b').first().text()).toLowerCase();

      let targetKey = null;
      if (headerText.includes('result')) targetKey = 'results';
      else if (headerText.includes('admit')) targetKey = 'admitCards';
      else if (headerText.includes('latest job') || headerText.includes('offline job') || headerText.includes('outsourcing')) targetKey = 'latestJobs';
      else if (headerText.includes('answer key')) targetKey = 'answerKeys';
      else if (headerText.includes('syllabus')) targetKey = 'syllabus';
      else if (headerText.includes('admission')) targetKey = 'admissions';
      else if (headerText.includes('certificate')) targetKey = 'certificates';
      else if (headerText.includes('important')) targetKey = 'important';

      if (!targetKey) return;

      $(col).find('ul li a, p a').each((_, a) => {
        const title = cleanText($(a).text());
        const link = toAbsoluteUrl($(a).attr('href'));

        // Skip category index link itself
        const isSelfCategory = title.toLowerCase() === targetKey || title.toLowerCase() === headerText || title.toLowerCase() === 'view more';
        if (title && link && !isSelfCategory) {
          const item = {
            id: generateId(title, link),
            title,
            link,
            category: targetKey,
            scrapedAt: new Date().toISOString()
          };
          sections[targetKey].push(item);
        }
      });
    });

    return {
      trending,
      ...sections,
      meta: {
        source: BASE_URL,
        scrapedAt: new Date().toISOString(),
        totalCounts: {
          trending: trending.length,
          results: sections.results.length,
          admitCards: sections.admitCards.length,
          latestJobs: sections.latestJobs.length,
          answerKeys: sections.answerKeys.length,
          syllabus: sections.syllabus.length,
          admissions: sections.admissions.length,
          certificates: sections.certificates.length,
          important: sections.important.length
        }
      }
    };
  } catch (error) {
    console.error('Error scraping SarkariResult homepage:', error.message);
    throw error;
  }
}

/**
 * Scrapes dedicated archive listing pages (e.g. /latestjob/, /result/, /admitcard/)
 * Extracts recent postings (2026/2025)
 */
async function scrapeCategoryArchive(categoryUrl, targetKey, maxItems = 150) {
  try {
    const response = await axios.get(categoryUrl, {
      ...safeFetchOptions,
      headers: DEFAULT_HEADERS,
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const items = [];
    const seenLinks = new Set();

    $('a').each((_, a) => {
      const rawHref = $(a).attr('href') || '';
      const title = cleanText($(a).text());
      const fullUrl = toAbsoluteUrl(rawHref);

      // Match post URLs like sarkariresult.com/2026/..., sarkariresult.com/2025/...
      const isPostUrl = /sarkariresult\.com\/\d{4}\/[^/]+\/?$/i.test(fullUrl);
      const isRelevantTitle = title.length > 5 &&
        !title.toLowerCase().includes('click here') &&
        !title.toLowerCase().includes('view more') &&
        !title.toLowerCase().includes('sarkari hith');

      if (isPostUrl && isRelevantTitle && !seenLinks.has(fullUrl)) {
        seenLinks.add(fullUrl);
        items.push({
          id: generateId(title, fullUrl),
          title,
          link: fullUrl,
          category: targetKey,
          scrapedAt: new Date().toISOString()
        });
      }
    });

    return items.slice(0, maxItems);
  } catch (error) {
    console.warn(`Could not scrape archive for ${categoryUrl}:`, error.message);
    return [];
  }
}

/**
 * Scrapes detailed information for a specific job/exam posting
 */
async function scrapePostingDetails(url) {
  try {
    const response = await axios.get(url, {
      ...safeFetchOptions,
      headers: DEFAULT_HEADERS,
      timeout: 15000
    });

    const $ = cheerio.load(response.data);

    const title = cleanText($('h1').first().text()) || cleanText($('title').text());
    let postDate = '';
    let shortInfo = '';
    const importantDates = {};
    const applicationFee = {};
    const ageLimit = {};
    let totalVacancies = '';
    const vacancyDetails = [];
    const importantLinks = [];

    // Parse information tables
    $('table').each((_, table) => {
      $(table).find('tr').each((_, tr) => {
        const tds = $(tr).find('> td, > th');
        const rowText = cleanText($(tr).text());

        // 1. Post Date / Update
        if (rowText.includes('Post Date') || rowText.includes('Update :')) {
          postDate = cleanText($(tds).last().text()) || rowText;
        }

        // 2. Short Information
        if (rowText.includes('Short Information')) {
          shortInfo = cleanText($(tds).last().text()) || rowText;
        }

        // 3. Two-cell block: Important Dates (cell 0) vs Application Fee (cell 1)
        if (tds.length === 2 && (rowText.includes('Application Begin') || rowText.includes('Important Dates'))) {
          // Left cell: Important Dates
          $(tds[0]).find('li, p').each((_, el) => {
            const t = cleanText($(el).text());
            if (t.includes(':')) {
              const [k, ...v] = t.split(':');
              importantDates[cleanText(k)] = cleanText(v.join(':'));
            } else if (t && !t.toLowerCase().includes('important dates')) {
              importantDates[t] = '';
            }
          });

          // Right cell: Application Fee
          $(tds[1]).find('li, p').each((_, el) => {
            const t = cleanText($(el).text());
            if (t.includes(':')) {
              const [k, ...v] = t.split(':');
              applicationFee[cleanText(k)] = cleanText(v.join(':'));
            } else if (t && !t.toLowerCase().includes('application fee')) {
              applicationFee[t] = '';
            }
          });
        }

        // 4. Age Limit
        if (rowText.includes('Age Limit') || rowText.includes('Minimum Age')) {
          $(tr).find('li, p').each((_, el) => {
            const t = cleanText($(el).text());
            if (t.includes(':')) {
              const [k, ...v] = t.split(':');
              ageLimit[cleanText(k)] = cleanText(v.join(':'));
            } else if (t && !t.toLowerCase().includes('age limit')) {
              ageLimit['Notice'] = t;
            }
          });
        }

        // 5. Total Vacancies
        if (rowText.includes('Total :') || rowText.includes('Total Post')) {
          const match = rowText.match(/Total\s*(?::|Post\s*:)?\s*([0-9,]+(?:\s*Post)?)/i);
          if (match && !totalVacancies) totalVacancies = match[1];
        }

        // 6. Vacancy Eligibility Breakdown (3-cell table row)
        if (tds.length === 3) {
          const postName = cleanText($(tds[0]).text());
          const totalPost = cleanText($(tds[1]).text());
          const eligibility = cleanText($(tds[2]).text());

          if (postName && /\d/.test(totalPost) && eligibility &&
            !postName.toLowerCase().includes('post name') &&
            !postName.toLowerCase().includes('candidate can read')) {
            vacancyDetails.push({ postName, totalPost, eligibility });
          }
        }

        // 7. Important Action Links:
        // When row has 2 cells, cell 0 has descriptive title ("Apply Online", "Download Notification")
        if (tds.length === 2) {
          const labelCandidate = cleanText($(tds[0]).text());
          const linkEl = $(tds[1]).find('a');
          if (linkEl.length > 0) {
            linkEl.each((_, a) => {
              const rawHref = $(a).attr('href');
              const linkText = cleanText($(a).text());
              const finalUrl = toAbsoluteUrl(rawHref, url);

              // Ignore spam / app stores / internal redundant redirects
              if (!finalUrl ||
                finalUrl.includes('play.google.com') ||
                finalUrl.includes('itunes.apple.com') ||
                finalUrl.includes('sarkariresultportal.com') ||
                finalUrl.includes('whatsapp.com') ||
                finalUrl.includes('t.me')) {
                return;
              }

              let finalLabel = labelCandidate;
              if (!finalLabel || finalLabel.length < 3 || finalLabel.toLowerCase().includes('some useful') || finalLabel.toLowerCase().includes('download mobile app')) {
                finalLabel = linkText;
              } else if (linkText && !linkText.toLowerCase().includes('click here') && !linkText.toLowerCase().includes('link')) {
                finalLabel = `${labelCandidate} (${linkText})`;
              }

              if (!importantLinks.some(l => l.url === finalUrl)) {
                importantLinks.push({ label: finalLabel, url: finalUrl });
              }
            });
          }
        }
      });
    });

    const additional = extractAdditionalDetails(response.data, url);
    const mergedLinks = [...importantLinks];
    for (const link of additional.extractedLinks) {
      if (!mergedLinks.some(existing => existing.url === link.url)) mergedLinks.push(link);
    }
    return {
      ...additional,
      title,
      url,
      postDate,
      shortInfo,
      importantDates: { ...importantDates, ...additional.importantDates },
      applicationFee: { ...applicationFee, ...additional.applicationFee },
      ageLimit: { ...ageLimit, ...additional.ageLimit },
      totalVacancies,
      vacancyDetails,
      importantLinks: mergedLinks.slice(0, 30),
      scrapedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error scraping detail for ${url}:`, error.message);
    return null;
  }
}

/**
 * Puppeteer-based scraper fallback for JavaScript-heavy or dynamic pages
 */
async function scrapeWithPuppeteer(url) {
  let browser = null;
  try {
    const puppeteerModule = await import('puppeteer');
    const puppeteer = puppeteerModule.default || puppeteerModule;
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent(DEFAULT_HEADERS['User-Agent']);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const data = await page.evaluate(() => {
      const pageTitle = document.title;
      const h1Text = document.querySelector('h1')?.innerText?.trim() || '';
      const links = Array.from(document.querySelectorAll('a'))
        .filter(a => a.href && a.innerText.trim().length > 3)
        .slice(0, 20)
        .map(a => ({
          title: a.innerText.trim(),
          url: a.href
        }));

      return { pageTitle, h1Text, links };
    });

    return data;
  } catch (error) {
    console.error('Puppeteer scraping error:', error.message);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = {
  scrapeHomepage,
  scrapeCategoryArchive,
  scrapePostingDetails,
  scrapeWithPuppeteer,
  cleanText,
  generateId,
  toAbsoluteUrl
};
