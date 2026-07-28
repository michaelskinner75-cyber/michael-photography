const config = window.PHOTO_SITE_CONFIG;
const configured = config && !config.supabaseUrl.includes('YOUR-PROJECT') && !config.supabaseAnonKey.includes('YOUR-SUPABASE');
const client = configured ? supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const albumGrid = document.querySelector('#album-grid');
const albumDialog = document.querySelector('#album-dialog');
const lightbox = document.querySelector('#lightbox');
const requestDialog = document.querySelector('#request-dialog');
let selectedPhotoUrl = '';
let selectedPhotoTitle = '';

document.querySelector('#year').textContent = new Date().getFullYear();
document.querySelector('.nav-toggle')?.addEventListener('click', () => document.querySelector('nav').classList.toggle('open'));
document.querySelectorAll('.dialog-close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelector('#cancel-request')?.addEventListener('click', () => requestDialog.close());

function escapeHtml(value = '') {
  return value.replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', {day:'numeric', month:'long', year:'numeric'}).format(new Date(`${value}T12:00:00`));
}

async function loadAlbums() {
  if (!configured) {
    albumGrid.innerHTML = `<article class="setup-card"><h3>Your album site is ready</h3><p>Connect Supabase using <code>config.js</code> to publish real albums and bulk-upload photos.</p></article>`;
    return;
  }

  const now = new Date().toISOString();
  const { data: albums, error } = await client
    .from('albums')
    .select('id,title,description,event_date,expires_at,cover_url,created_at')
    .eq('is_public', true)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('event_date', { ascending: false, nullsFirst: false });

  if (error) {
    albumGrid.innerHTML = `<p>Albums could not be loaded.</p>`;
    console.error(error);
    return;
  }
  if (!albums.length) {
    albumGrid.innerHTML = `<p>No public albums have been added yet.</p>`;
    return;
  }

  albumGrid.innerHTML = albums.map(album => `
    <button class="album-card" data-id="${album.id}">
      <div class="album-cover" style="background-image:url('${album.cover_url || ''}')"><span>${album.cover_url ? '' : 'MS'}</span></div>
      <div class="album-meta"><small>${escapeHtml(formatDate(album.event_date))}</small><h3>${escapeHtml(album.title)}</h3><span>View album →</span></div>
    </button>`).join('');
  albumGrid.querySelectorAll('.album-card').forEach(card => card.addEventListener('click', () => openAlbum(card.dataset.id)));
}

function updatePhotoProgress(loaded, total) {
  const progress = document.querySelector('#photo-loading-progress');
  if (!progress) return;
  const percentage = total ? Math.round((loaded / total) * 100) : 100;
  progress.querySelector('.gallery-progress-bar').style.width = `${percentage}%`;
  progress.querySelector('.gallery-progress-percentage').textContent = `${percentage}%`;
  progress.querySelector('.gallery-progress-count').textContent = total ? `${loaded} of ${total} photos loaded` : 'No photos in this album';
  if (loaded >= total) {
    progress.classList.add('complete');
    window.setTimeout(() => progress.remove(), 550);
  }
}

function openPhotoRequest(type) {
  const isPurchase = type === 'purchase';
  document.querySelector('#request-type').value = type;
  document.querySelector('#request-photo-url').value = selectedPhotoUrl;
  document.querySelector('#request-photo-preview').src = selectedPhotoUrl;
  document.querySelector('#request-eyebrow').textContent = isPurchase ? 'Purchase enquiry' : 'Photo editing';
  document.querySelector('#request-title').textContent = isPurchase ? 'Purchase this photo' : 'Request an edit';
  document.querySelector('#request-details-label').firstChild.textContent = isPurchase ? 'Tell me what you need' : 'What would you like changed?';
  document.querySelector('#request-details').placeholder = isPurchase
    ? 'For example: digital copy, print size, intended use or any questions'
    : 'Describe the rework, restoration or AI-assisted edit you would like';
  requestDialog.showModal();
}

async function downloadSelectedPhoto() {
  if (!selectedPhotoUrl) return;
  const button = document.querySelector('#download-photo');
  const originalText = button.textContent;
  button.textContent = 'Preparing…';
  button.disabled = true;
  try {
    const response = await fetch(selectedPhotoUrl);
    if (!response.ok) throw new Error('Download failed');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${selectedPhotoTitle || 'ms-photography'}.jpg`.replace(/[^a-z0-9._-]+/gi, '-');
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    window.open(selectedPhotoUrl, '_blank', 'noopener');
  } finally {
    button.textContent = originalText;
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
  const photoUrl = document.querySelector('#request-photo-url').value;
  const subject = type === 'purchase' ? 'Photo purchase enquiry' : 'Photo edit request';
  const body = [
    `Name: ${name}`,
    `Email: ${email}`,
    `Request type: ${type === 'purchase' ? 'Purchase photo' : 'Edit / restoration'}`,
    `Photo: ${photoUrl}`,
    '',
    'Details:',
    details
  ].join('\n');
  window.location.href = `mailto:michaelskinner75@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  requestDialog.close();
});

async function openAlbum(id) {
  const [{ data: album }, { data: photos, error }] = await Promise.all([
    client.from('albums').select('*').eq('id', id).single(),
    client.from('photos').select('id,image_url,thumbnail_url,caption,sort_order').eq('album_id', id).order('sort_order')
  ]);
  if (error || !album) return;
  if (album.expires_at && new Date(album.expires_at) <= new Date()) return loadAlbums();

  document.querySelector('#dialog-title').textContent = album.title;
  document.querySelector('#dialog-date').textContent = formatDate(album.event_date);
  document.querySelector('#dialog-description').textContent = album.description || '';
  const grid = document.querySelector('#photo-grid');

  grid.innerHTML = `
    <div id="photo-loading-progress" class="gallery-progress" role="status" aria-live="polite">
      <div class="gallery-progress-heading"><span>Loading photos</span><strong class="gallery-progress-percentage">0%</strong></div>
      <div class="gallery-progress-track"><div class="gallery-progress-bar"></div></div>
      <p class="gallery-progress-count">0 of ${photos.length} photos loaded</p>
    </div>
    ${photos.map(photo => `<button class="photo-tile" data-full="${photo.image_url}" data-title="${escapeHtml(photo.caption || album.title)}"><img loading="lazy" src="${photo.thumbnail_url || photo.image_url}" alt="${escapeHtml(photo.caption || album.title)}"></button>`).join('')}`;

  albumDialog.showModal();
  const images = [...grid.querySelectorAll('.photo-tile img')];
  let loaded = 0;
  const markLoaded = () => { loaded += 1; updatePhotoProgress(loaded, images.length); };
  if (!images.length) updatePhotoProgress(0, 0);
  images.forEach(image => {
    if (image.complete) markLoaded();
    else {
      image.addEventListener('load', markLoaded, { once: true });
      image.addEventListener('error', markLoaded, { once: true });
    }
  });

  grid.querySelectorAll('.photo-tile').forEach(tile => tile.addEventListener('click', () => {
    selectedPhotoUrl = tile.dataset.full;
    selectedPhotoTitle = tile.dataset.title || album.title;
    document.querySelector('#lightbox-image').src = selectedPhotoUrl;
    lightbox.showModal();
  }));
}

loadAlbums();