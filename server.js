const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const COMMENTS_FILE = path.join(__dirname, 'data', 'comments.json');
const CONFIG_FILE = path.join(__dirname, 'data', 'band-config.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'images')));

// Utility: strip HTML tags to prevent XSS stored in comments
function stripHTML(str) {
  return String(str).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Utility: read JSON file safely
function readJSON(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

// Utility: write JSON file safely
function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}


const BANDCAMP_BASE = 'https://mamore.bandcamp.com';

// Utility: decode the HTML entities Bandcamp uses to inline JSON into attributes.
// &amp; is decoded last so "&amp;quot;" does not turn into a real quote.
function decodeEntities(str) {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Utility: turn a scraped HTML fragment into plain single-line text.
// Bandcamp pads grid titles with newlines and leaves entities encoded.
function cleanText(str) {
  return String(str)
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// Utility: format a Bandcamp package price the way the merch grid renders it
function formatPrice(price, currency) {
  if (typeof price !== 'number') return '';
  const amount = Number.isInteger(price) ? String(price) : price.toFixed(2);
  const symbol = { EUR: '€', USD: '$', GBP: '£' }[currency];
  return symbol ? `${symbol}${amount} ${currency}` : `${amount} ${currency}`;
}

// Parse the merch grid rendered when the band has more than one merch item.
function parseMerchGrid(html) {
  const items = [];
  const itemRegex = /<li[^>]*class="[^"]*merch-grid-item[^"]*"[^>]*>([\s\S]*?)<\/li>/g;
  let match;
  while ((match = itemRegex.exec(html)) !== null) {
    const block = match[1];
    const urlMatch = block.match(/href="([^"]+)"/);
    const imgMatch = block.match(/<img[^>]+src="([^"]+)"/);
    const titleMatch = block.match(/<p[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    const priceMatch = block.match(/<span[^>]*class="[^"]*price[^"]*"[^>]*>([\s\S]*?)<\/span>/);

    if (urlMatch && titleMatch) {
      const rawUrl = urlMatch[1];
      items.push({
        title: cleanText(titleMatch[1]),
        price: priceMatch ? cleanText(priceMatch[1]) : '',
        url: rawUrl.startsWith('http') ? rawUrl : `${BANDCAMP_BASE}${rawUrl}`,
        img: imgMatch ? imgMatch[1].replace(/_\d+\./, '_16.') : null
      });
    }
  }
  return items;
}

// When the band has exactly one merch item, /merch redirects straight to that
// item's release page, which has no merch grid. The packages live in the
// data-tralbum JSON blob instead, so read them from there.
function parseTralbumPackages(html) {
  const blobMatch = html.match(/data-tralbum="([^"]*)"/);
  if (!blobMatch) return [];

  let tralbum;
  try {
    tralbum = JSON.parse(decodeEntities(blobMatch[1]));
  } catch {
    return [];
  }

  return (tralbum.packages || []).map(pkg => {
    // Merch art ids are zero-padded to 10 digits; fall back to the album cover.
    const artId = pkg.arts && pkg.arts.length ? pkg.arts[0].image_id : null;
    const img = artId
      ? `https://f4.bcbits.com/img/${String(artId).padStart(10, '0')}_16.jpg`
      : pkg.album_art_id
        ? `https://f4.bcbits.com/img/a${String(pkg.album_art_id).padStart(10, '0')}_16.jpg`
        : null;

    return {
      title: cleanText(pkg.title),
      price: formatPrice(pkg.price, pkg.currency),
      url: pkg.url || tralbum.url || `${BANDCAMP_BASE}/merch`,
      img
    };
  });
}

// GET /api/merch — scrape Bandcamp merch page and return items
app.get('/api/merch', async (req, res) => {
  try {
    const response = await fetch(`${BANDCAMP_BASE}/merch`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; band-profile/1.0)' },
      redirect: 'follow'
    });
    const html = await response.text();

    let items = parseMerchGrid(html);
    if (items.length === 0) items = parseTralbumPackages(html);

    res.json(items);
  } catch (err) {
    console.error('Merch fetch error:', err.message);
    res.status(502).json({ error: 'Could not fetch merch.' });
  }
});

// GET /api/config — band configuration
app.get('/api/config', (req, res) => {
  const config = readJSON(CONFIG_FILE, {});
  res.json(config);
});

// GET /api/comments — all comments, newest first
app.get('/api/comments', (req, res) => {
  const comments = readJSON(COMMENTS_FILE, []);
  const sorted = [...comments].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(sorted);
});

// POST /api/comments — submit a new comment
app.post('/api/comments', (req, res) => {
  const { name, text } = req.body;

  // Validate
  if (!name || !text) {
    return res.status(400).json({ error: 'Name and text are required.' });
  }
  console.log('Received comment submission:', { name, text });
  const cleanName = stripHTML(name.trim());
  const cleanText = stripHTML(text.trim());

  if (cleanName.length === 0 || cleanName.length > 50) {
    return res.status(400).json({ error: 'Name must be between 1 and 50 characters.' });
  }
  if (cleanText.length === 0 || cleanText.length > 1000) {
    return res.status(400).json({ error: 'Comment must be between 1 and 1000 characters.' });
  }

  const comments = readJSON(COMMENTS_FILE, []);

  const newComment = {
    id: crypto.randomUUID(),
    name: cleanName,
    text: cleanText,
    timestamp: new Date().toISOString()
  };

  comments.push(newComment);
  writeJSON(COMMENTS_FILE, comments);

  res.status(201).json(newComment);
});

app.listen(PORT, () => {
  console.log(`Mamore band profile running at http://localhost:${PORT}`);
});
