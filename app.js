const config = window.PHOTO_SITE_CONFIG;
const configured = Boolean(
  config &&
  config.supabaseUrl &&
  config.supabaseAnonKey &&
  !config.supabaseUrl.includes('YOUR-PROJECT') &&
  !config.supabaseAnonKey.includes('YOUR-SUPABASE')
);
const client = configured && window.supabase
  ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey)
  : null;

const albumGrid = document.querySelector('#album-grid');
const albumDialog = document.querySelector('#album-dialog');
const lightbox = document.querySelector('#lightbox');
const requestDialog = document.querySelector('#request-dialog');
let selectedPhotoUrl = '';
let selectedPhotoTitle = '';
let selectedAlbumWatermarked = false;
let selectedWatermarkType = 'proof';

const year = document.querySelector('#year');
if (year) year.textContent = new Date().getFullYear();

document.querySelector('.menu-toggle')?.addEventListener('click', () => {
  document.querySelector('.nav')?.classList.toggle('open');
});
window.addEventListener('scroll', () => {
  document.querySelector('.cinematic-header')?.classList.toggle('scrolled', window.scrollY > 40);
});
document.querySelectorAll('.dialog-close').forEach(button => {
  button.addEventListener('click', () => button.closest('dialog')?.close());
});
document.querySelector('#cancel-request')?.addEventListener('click', () => requestDialog?.close());
document.querySelector('.reaction-panel')?.remove();

const heroHeading = document.querySelector('.hero h1');
if (heroHeading) heroHeading.innerHTML = 'Photography<br><span>Cars, animals & everyday moments</span>';
const heroKicker = document.querySelector('.hero .kicker');
if (heroKicker) heroKicker.textContent = 'MS Photography · Fife';
const heroDescription = document.querySelector('.hero-copy > p:last-of-type');
if (heroDescription) heroDescription.textContent = 'Automotive photography, animals, people, local scenes and the moments that catch my eye — a personal collection by hobbyist photographer Michael Skinner.';
const heroButton = document.querySelector('.hero .outline-button');
if (heroButton) heroButton.textContent = 'View albums →';
const albumsHeading = document.querySelector('#albums .section-top h2');
if (albumsHeading) albumsHeading.textContent = 'Latest albums';
const albumsIntro = document.querySelector('#albums .section-top > p');
if (albumsIntro) albumsIntro.textContent = 'The newest public galleries, including complete event albums. Open any album to view the photographs, download where available, request an edit or enquire about purchasing an image.';

const loadingStyles = document.createElement('style');
loadingStyles.textContent = `
.gallery-progress{column-span:all;display:grid;place-items:center;gap:13px;padding:34px 20px;background:#0d0d0d;border:1px solid #ffffff20;text-align:center;transition:opacity .35s ease,transform .35s ease}
.gallery-progress.finishing{opacity:0;transform:translateY(-8px)}
.gallery-spinner{width:44px;height:44px;border:3px solid #ffffff25;border-top-color:var(--gold,#d0a54f);border-radius:50%;animation:gallerySpin .8s linear infinite}
.gallery-progress-heading{display:flex;gap:12px;align-items:center;justify-content:center}.gallery-progress-percentage{color:var(--gold,#d0a54f)}
.gallery-progress-track{width:min(440px,82vw);height:5px;overflow:hidden;border-radius:999px;background:#ffffff20}
.gallery-progress-bar{height:100%;width:0;background:var(--gold,#d0a54f);transition:width .25s ease}
.gallery-progress-count{margin:0;color:#aaa49a;font-size:12px;letter-spacing:.08em}
.photo-tile{opacity:0;transform:translateY(12px);transition:opacity .45s ease,transform .45s ease}
.photo-tile.loaded{opacity:1;transform:none}
@keyframes gallerySpin{to{transform:rotate(360deg)}}`;
document.head.appendChild(loadingStyles);

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}
function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  }).format(new Date(`${value}T12:00:00`));
}
function logoMarkup() {
  return `<svg viewBox="0 0 300 190" aria-hidden="true"><path d="M102 47h38l14-27h65l14 27h28c17 0 31 14 31 31v60c0 17-14 31-31 31H91c-17 0-31-14-31-31V78c0-17 14-31 31-31z" fill="none" stroke="white" stroke-width="10" stroke-linejoin="round"/><circle cx="214" cy="108" r="40" fill="none" stroke="white" stroke-width="10"/><text x="8" y="142" fill="white" font-family="Georgia,serif" font-size="112" font-weight="700">MS</text></svg>`;
}
function watermarkMarkup(type) {
  return `<span class="photo-watermark ${type === 'logo' ? 'logo' : 'proof'}">${type === 'logo' ? logoMarkup() : ''}</span>`;
}
function isWeddingAlbum(album) {
  return /(wedding|mr\s*&\s*mrs|innes|bride|groom)/i.test(`${album.title || ''} ${album.description || ''}`);
}
function isCarAlbum(album) {
  return /(car|cars|automotive|porsche|bmw|vehicle|motor)/i.test(`${album.title || ''} ${album.description || ''}`);
}

async function loadAlbums() {
  if (!albumGrid) return;
  if (!client) {
    albumGrid.innerHTML = '<p>Albums could not connect. Please refresh the page.</p>';
    return;
  }
  try {
    const { data, error } = await client
      .from('albums')
      .select('id,title,description,event_date,expires_at,cover_url,created_at,view_count,photos(count)')
      .eq('is_public', true)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const albums = data || [];
    if (!albums.length) {
      albumGrid.innerHTML = '<p>No public albums have been added yet.</p>';
      return;
    }
    const automotiveCover = albums.find(album => isCarAlbum(album) && album.cover_url)?.cover_url;
    const nonWeddingCover = albums.find(album => !isWeddingAlbum(album) && album.cover_url)?.cover_url;
    const heroCover = automotiveCover || nonWeddingCover;
    if (heroCover) {
      const hero = document.querySelector('.hero');
      if (hero) hero.style.backgroundImage = `url('${heroCover}')`;
      const feature = document.querySelector('#feature-image');
      if (feature) feature.style.backgroundImage = `url('${heroCover}')`;
    }
    albumGrid.innerHTML = albums.map(album => `
      <button class="album-banner" data-id="${album.id}" style="background-image:url('${album.cover_url || ''}')">
        <div class="album-banner-content">
          <div>
            <h3>${escapeHtml(album.title)}</h3>
            <div class="album-details">
              <span>▣ ${album.photos?.[0]?.count || 0} photos</span>
              <span class="album-stats">◉ ${Number(album.view_count || 0).toLocaleString('en-GB')} views</span>
              ${album.event_date ? `<span>${escapeHtml(formatDate(album.event_date))}</span>` : ''}
            </div>
          </div>
          <span class="album-arrow">→</span>
        </div>
      </button>`).join('');
    albumGrid.querySelectorAll('.album-banner').forEach(card => {
      card.addEventListener('click', () => openAlbum(card.dataset.id));
    });
  } catch (error) {
    console.error('Album loading failed:', error);
    albumGrid.innerHTML = '<p>Albums could not be loaded. Please refresh and try again.</p>';
  }
}

function updatePhotoProgress(loaded, total) {
  const progress = document.querySelector('#photo-loading-progress');
  if (!progress) return;
  const percentage = total ? Math.round((loaded / total) * 100) : 100;
  progress.querySelector('.gallery-progress-bar').style.width = `${percentage}%`;
  progress.querySelector('.gallery-progress-percentage').textContent = `${percentage}%`;
  progress.querySelector('.gallery-progress-count').textContent = total
    ? `${loaded} of ${total} photos loaded`
    : 'No photos in this album';
  if (loaded >= total) {
    progress.classList.add('finishing');
    setTimeout(() => progress.remove(), 400);
  }
}

function openPhotoRequest(type) {
  const purchase = type === 'purchase';
  document.querySelector('#request-type').value = type;
  document.querySelector('#request-photo-url').value = selectedPhotoUrl;
  document.querySelector('#request-photo-preview').src = selectedPhotoUrl;
  document.querySelector('#request-eyebrow').textContent = purchase ? 'Purchase enquiry' : 'Photo editing';
  document.querySelector('#request-title').textContent = purchase ? 'Purchase this photo' : 'Request an edit';
  document.querySelector('#request-details').placeholder = purchase
    ? 'Digital copy, print size or intended use'
    : 'Describe the edit or restoration you would like';
  requestDialog?.showModal();
}

async function downloadSelectedPhoto() {
  if (!selectedPhotoUrl || selectedAlbumWatermarked) return;
  const button = document.querySelector('#download-photo');
  const previous = button.textContent;
  button.textContent = 'Preparing…';
  button.disabled = true;
  try {
    const response = await fetch(selectedPhotoUrl);
    const blob = await response.blob();
    const temporaryUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = temporaryUrl;
    link.download = `${selectedPhotoTitle || 'ms-photography'}.jpg`.replace(/[^a-z0-9._-]+/gi, '-');
    link.click();
    URL.revokeObjectURL(temporaryUrl);
  } catch {
    window.open(selectedPhotoUrl, '_blank', 'noopener');
  } finally {
    button.textContent = previous;
    button.disabled = false;
  }
}

document.querySelector('#download-photo')?.addEventListener('click', downloadSelectedPhoto);
document.querySelector('#request-edit')?.addEventListener('click', () => openPhotoRequest('edit'));
document.querySelector('#purchase-photo')?.addEventListener('click', () => openPhotoRequest('purchase'));
document.querySelector('#request-form')?.addEventListener('submit', event => {
  event.preventDefault();
  const type = document.querySelector('#request-type').value;
  const name = document.querySelector('#request-name').value.trim();
  const email = document.querySelector('#request-email').value.trim();
  const details = document.querySelector('#request-details').value.trim();
  const photo = document.querySelector('#request-photo-url').value;
  const subject = type === 'purchase' ? 'Photo purchase enquiry' : 'Photo edit request';
  const body = `Name: ${name}\nEmail: ${email}\nRequest: ${type}\nPhoto: ${photo}\n\nDetails:\n${details}`;
  window.location.href = `mailto:michaelskinner75@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  requestDialog?.close();
});

async function openAlbum(id) {
  if (!client) return;
  try {
    const [albumResult, photoResult] = await Promise.all([
      client.from('albums').select('*').eq('id', id).single(),
      client.from('photos').select('id,image_url,thumbnail_url,caption,sort_order').eq('album_id', id).order('sort_order')
    ]);
    const album = albumResult.data;
    const photos = photoResult.data || [];
    if (albumResult.error || photoResult.error || !album) throw albumResult.error || photoResult.error;

    const { data: newCount } = await client.rpc('increment_album_view', { p_album_id: id });
    const counter = albumGrid.querySelector(`.album-banner[data-id="${id}"] .album-stats`);
    if (counter) counter.textContent = `◉ ${Number(newCount || 0).toLocaleString('en-GB')} views`;

    selectedAlbumWatermarked = Boolean(album.watermark_enabled);
    selectedWatermarkType = album.watermark_type || 'proof';
    document.querySelector('#dialog-title').textContent = album.title;
    document.querySelector('#dialog-date').textContent = formatDate(album.event_date);
    document.querySelector('#dialog-description').textContent = album.description || '';

    const grid = document.querySelector('#photo-grid');
    grid.innerHTML = `
      <div id="photo-loading-progress" class="gallery-progress">
        <div class="gallery-spinner" aria-hidden="true"></div>
        <div class="gallery-progress-heading"><span>Loading photographs</span><strong class="gallery-progress-percentage">0%</strong></div>
        <div class="gallery-progress-track"><div class="gallery-progress-bar"></div></div>
        <p class="gallery-progress-count">0 of ${photos.length} photos loaded</p>
      </div>
      ${photos.map(photo => `
        <button class="photo-tile" data-full="${photo.image_url}" data-title="${escapeHtml(photo.caption || album.title)}">
          <img loading="lazy" src="${photo.thumbnail_url || photo.image_url}" alt="${escapeHtml(photo.caption || album.title)}">
          ${selectedAlbumWatermarked ? watermarkMarkup(selectedWatermarkType) : ''}
        </button>`).join('')}`;

    albumDialog?.showModal();
    const images = [...grid.querySelectorAll('img')];
    let loaded = 0;
    const done = image => {
      image.closest('.photo-tile')?.classList.add('loaded');
      updatePhotoProgress(++loaded, images.length);
    };
    if (!images.length) updatePhotoProgress(0, 0);
    images.forEach(image => {
      if (image.complete) done(image);
      else {
        image.addEventListener('load', () => done(image), { once: true });
        image.addEventListener('error', () => done(image), { once: true });
      }
    });

    grid.querySelectorAll('.photo-tile').forEach(tile => {
      tile.addEventListener('click', () => {
        selectedPhotoUrl = tile.dataset.full;
        selectedPhotoTitle = tile.dataset.title || album.title;
        document.querySelector('#lightbox-image').src = selectedPhotoUrl;
        const watermark = document.querySelector('#lightbox-watermark');
        watermark.className = selectedAlbumWatermarked
          ? `photo-watermark ${selectedWatermarkType === 'logo' ? 'logo' : 'proof'}`
          : '';
        watermark.innerHTML = selectedAlbumWatermarked && selectedWatermarkType === 'logo' ? logoMarkup() : '';
        const download = document.querySelector('#download-photo');
        download.disabled = selectedAlbumWatermarked;
        download.textContent = selectedAlbumWatermarked ? 'Download unavailable on proof' : 'Download photo';
        lightbox?.showModal();
      });
    });
  } catch (error) {
    console.error('Album opening failed:', error);
  }
}

loadAlbums();