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


// GET /api/merch — scrape Bandcamp merch page and return items
app.get('/api/merch', async (req, res) => {
  try {
    const response = await fetch('https://mamore.bandcamp.com/merch', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; band-profile/1.0)' },
      redirect: 'follow'
    });
    const html = await response.text();

    // Bandcamp embeds all page data in a <script data-tralbum> or window.TralbumData,
    // but merch listings are in a JSON blob inside data-band on the pagedata script.
    // Extract the merch grid items from the HTML directly.
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
        const url = rawUrl.startsWith('http') ? rawUrl : `https://mamore.bandcamp.com${rawUrl}`;
        const img = imgMatch ? imgMatch[1].replace(/_\d+\./, '_16.') : null;
        items.push({
          title: titleMatch[1].replace(/<[^>]+>/g, '').trim(),
          price: priceMatch ? priceMatch[1].replace(/<[^>]+>/g, '').trim() : '',
          url,
          img
        });
      }
    }

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
