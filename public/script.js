// ═══════════════════════════════════════════════════════
//  Mamore Band Profile — Frontend Script
// ═══════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  // Load band config and render all sections
  try {
    const config = await fetch('/api/config').then(r => r.json());

    renderBandHeader(config.band);
    renderStatusBar(config.band);
    renderBandDetails(config.band);
    renderBio(config.band);
    renderMembers(config.members);
    renderFriends(config.friends);
    renderTourDates(config.tourDates);
    renderGallery(config.gallery);
  } catch (err) {
    console.error('Failed to load band config:', err);
  }

  // Load merch from Bandcamp
  loadMerch();

  // Load and render comments
  await loadComments();

  // Setup interactive features
  setupCommentForm();
  setupLightbox();
});

// ─── BAND HEADER ────────────────────────────────────────

function renderBandHeader(band) {
  document.title = `${band.name} - Official Profile`;
  const photo = document.getElementById('band-main-photo');
  if (photo && band.profilePhoto) photo.src = band.profilePhoto;

  // Random "last active X minutes ago"
  const minutes = Math.floor(Math.random() * 58) + 1;
  const lastActiveEl = document.getElementById('last-active-minutes');
  if (lastActiveEl) lastActiveEl.textContent = `${minutes} minutes ago`;

  // Status (mood field)
  const statusEl = document.getElementById('band-status-text');
  if (statusEl) statusEl.textContent = band.mood || '';
}

// renderStatusBar no longer needed (removed status bar element)
function renderStatusBar() {}

// ─── BAND DETAILS TABLE ──────────────────────────────────

function renderBandDetails(band) {
  const table = document.getElementById('details-table');
  if (!table) return;

  const rows = [
    ['Genre', band.genre],
    ['Members', band.memberCount],
    ['Location', band.location],
    ['Formed', band.formed],
    ['Sounds Like', band.soundsLike],
  ];

  table.innerHTML = rows.map(([label, value]) => `
    <tr>
      <td>${label}:</td>
      <td>${value || '—'}</td>
    </tr>
  `).join('');
}

// ─── BIO & INFLUENCES ────────────────────────────────────

function renderBio(band) {
  const bio = document.getElementById('bio-text');
  if (bio) bio.textContent = band.bio || '';

  const influences = document.getElementById('influences-text');
  if (influences) influences.textContent = band.influences || '';
}

// ─── MEMBERS ────────────────────────────────────────────

function renderMembers(members) {
  const container = document.getElementById('members-list');
  if (!container || !members) return;

  container.innerHTML = members.map(m => `
    <div class="member-card">
      <img src="${m.photo}" alt="${m.name}" onerror="this.style.display='none'">
      <span class="member-name">${m.name}</span>
      <span class="member-role">${m.role}</span>
    </div>
  `).join('');
}

// ─── MERCH (Bandcamp) ────────────────────────────────────

async function loadMerch() {
  const grid = document.getElementById('merch-grid');
  if (!grid) return;
  try {
    const all = await fetch('/api/merch').then(r => r.json());
    const items = Array.isArray(all) ? all.filter(i => i.price) : [];
    if (items.length === 0) {
      grid.innerHTML = '<a class="merch-fallback" href="https://mamore.bandcamp.com/merch" target="_blank" rel="noopener">♥ Visit our Bandcamp</a>';
      return;
    }
    grid.innerHTML = items.map(item => `
      <a class="merch-item" href="${item.url}" target="_blank" rel="noopener">
        ${item.img ? `<img src="${item.img}" alt="${item.title}">` : ''}
        <span class="merch-title">${item.title}</span>
        ${item.price ? `<span class="merch-price">${item.price}</span>` : ''}
      </a>
    `).join('');
  } catch {
    grid.innerHTML = '<a class="merch-fallback" href="https://mamore.bandcamp.com/merch" target="_blank" rel="noopener">♥ Visit our Bandcamp</a>';
  }
}

// ─── SHOP LINKS ──────────────────────────────────────────

function renderShopLinks(shop) {
  const list = document.getElementById('shop-links-list');
  if (!list || !shop) return;

  list.innerHTML = shop.map(item => `
    <li>
      <a class="shop-label" href="${item.url}" target="_blank" rel="noopener">${item.label} &#8599;</a>
      <span class="shop-desc">${item.description}</span>
    </li>
  `).join('');
}

// ─── FRIENDS ────────────────────────────────────────────

function renderFriends(friends) {
  const grid = document.getElementById('friends-grid');
  const countEl = document.getElementById('friends-count-num');
  if (!grid || !friends) return;

  if (countEl) countEl.textContent = friends.length;

  grid.innerHTML = friends.map(f => `
    <div class="friend-card">
      <a href="${f.profileUrl}" target="_blank" rel="noopener">
        <img src="${f.photo}" alt="${f.name}" onerror="this.style.background='#7a0048'">
        <span class="friend-name">${f.name}</span>
      </a>
    </div>
  `).join('');
}

// ─── TOUR DATES ──────────────────────────────────────────

function renderTourDates(dates) {
  const tbody = document.getElementById('tour-tbody');
  const emptyMsg = document.getElementById('tour-empty');
  const table = document.getElementById('tour-table');
  if (!tbody || !dates) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sorted = [...dates].sort((a, b) => new Date(a.date) - new Date(b.date));

  if (sorted.length === 0) {
    if (emptyMsg) emptyMsg.style.display = 'block';
    if (table) table.style.display = 'none';
    return;
  }

  tbody.innerHTML = sorted.map(show => {
    const showDate = new Date(show.date + 'T00:00:00');
    const isPast = showDate < today;

    const formattedDate = showDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });

    let ticketsCell;
    if (isPast) {
      ticketsCell = `<span class="badge-past">PAST</span>`;
    } else if (show.isSoldOut) {
      ticketsCell = `<span class="badge-soldout">SOLD OUT</span>`;
    } else if (show.ticketsUrl) {
      ticketsCell = `<a href="${show.ticketsUrl}" target="_blank" rel="noopener">Tickets &#x2197;&#xFE0E;</a>`;
    } else {
      ticketsCell = `<span style="color: var(--color-text-dim)">TBA</span>`;
    }

    return `
      <tr class="${isPast ? 'past-show' : ''}">
        <td class="tour-date-col">${formattedDate}</td>
        <td>${show.city} – ${show.venue}</td>
        <td>${ticketsCell}</td>
      </tr>
    `;
  }).join('');
}

// ─── PHOTO GALLERY ───────────────────────────────────────

function renderGallery(gallery) {
  const grid = document.getElementById('photo-grid');
  if (!grid || !gallery) return;

  grid.innerHTML = gallery.map((photo, i) => `
    <img
      class="gallery-thumb"
      src="${photo.src}"
      alt="${photo.caption}"
      data-index="${i}"
      loading="lazy"
    >
  `).join('');

  grid.querySelectorAll('.gallery-thumb').forEach(img => {
    img.addEventListener('click', () => {
      openLightbox(gallery, parseInt(img.dataset.index));
    });
  });
}

// ─── LIGHTBOX ────────────────────────────────────────────

let currentGallery = [];
let currentIndex = 0;

function openLightbox(gallery, index) {
  currentGallery = gallery;
  currentIndex = index;

  const lb = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  const caption = document.getElementById('lightbox-caption');

  img.src = gallery[index].src;
  img.alt = gallery[index].caption;
  caption.textContent = gallery[index].caption;
  lb.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('lightbox').classList.add('hidden');
  document.body.style.overflow = '';
}

function setupLightbox() {
  const backdrop = document.getElementById('lightbox-backdrop');
  const closeBtn = document.getElementById('lightbox-close');

  if (backdrop) backdrop.addEventListener('click', closeLightbox);
  if (closeBtn) closeBtn.addEventListener('click', closeLightbox);

  document.addEventListener('keydown', e => {
    const lb = document.getElementById('lightbox');
    if (lb.classList.contains('hidden')) return;

    if (e.key === 'Escape') {
      closeLightbox();
    } else if (e.key === 'ArrowRight') {
      openLightbox(currentGallery, (currentIndex + 1) % currentGallery.length);
    } else if (e.key === 'ArrowLeft') {
      openLightbox(currentGallery, (currentIndex - 1 + currentGallery.length) % currentGallery.length);
    }
  });
}

// ─── COMMENTS ────────────────────────────────────────────

async function loadComments() {
  try {
    const comments = await fetch('/api/comments').then(r => r.json());
    renderComments(comments);
  } catch (err) {
    console.error('Failed to load comments:', err);
  }
}

function renderComments(comments) {
  const list = document.getElementById('comments-list');
  if (!list) return;

  if (!comments || comments.length === 0) {
    list.innerHTML = '<p class="comment-empty">No comments yet — be the first to leave one!</p>';
    return;
  }

  list.innerHTML = comments.map(c => `
    <div class="comment-card">
      <div class="comment-header">
        <span class="comment-name">${c.name}</span>
        <span class="comment-time">${formatRelativeTime(c.timestamp)}</span>
      </div>
      <div class="comment-body">${c.text}</div>
    </div>
  `).join('');
}

function prependComment(comment) {
  const list = document.getElementById('comments-list');
  if (!list) return;

  const empty = list.querySelector('.comment-empty');
  if (empty) empty.remove();

  const card = document.createElement('div');
  card.className = 'comment-card';
  card.innerHTML = `
    <div class="comment-header">
      <span class="comment-name">${comment.name}</span>
      <span class="comment-time">just now</span>
    </div>
    <div class="comment-body">${comment.text}</div>
  `;
  list.prepend(card);
}

function setupCommentForm() {
  const form = document.getElementById('comment-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nameInput = document.getElementById('comment-name');
    const textInput = document.getElementById('comment-text');
    const statusEl = document.getElementById('comment-status');
    const submitBtn = form.querySelector('button[type="submit"]');

    const name = nameInput.value.trim();
    const text = textInput.value.trim();
    if (!name || !text) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Posting...';
    statusEl.textContent = '';
    statusEl.className = '';

    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, text })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to post comment.');
      }

      const newComment = await res.json();
      prependComment(newComment);
      nameInput.value = '';
      textInput.value = '';
      statusEl.textContent = 'Comment posted!';

    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className = 'error';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Post Comment';
    }
  });
}

// ─── UTILITIES ───────────────────────────────────────────

function formatRelativeTime(isoString) {
  const then = new Date(isoString);
  const now = new Date();
  const diffSec = Math.floor((now - then) / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`;
  if (diffDay < 30) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;

  return then.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
