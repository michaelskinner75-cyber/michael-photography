const config = window.PHOTO_SITE_CONFIG;
const configured = config && !config.supabaseUrl.includes('YOUR-PROJECT') && !config.supabaseAnonKey.includes('YOUR-SUPABASE');
const client = configured ? supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const albumGrid = document.querySelector('#album-grid');
const albumDialog = document.querySelector('#album-dialog');
const lightbox = document.querySelector('#lightbox');

document.querySelector('#year').textContent = new Date().getFullYear();
document.querySelector('.nav-toggle')?.addEventListener('click', () => document.querySelector('nav').classList.toggle('open'));
document.querySelectorAll('.dialog-close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));

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
  const bar = progress.querySelector('.gallery-progress-bar');
  const percentageText = progress.querySelector('.gallery-progress-percentage');
  const countText = progress.querySelector('.gallery-progress-count');

  bar.style.width = `${percentage}%`;
  percentageText.textContent = `${percentage}%`;
  countText.textContent = total ? `${loaded} of ${total} photos loaded` : 'No photos in this album';

  if (loaded >= total) {
    progress.classList.add('complete');
    window.setTimeout(() => progress.remove(), 550);
  }
}

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
      <div class="gallery-progress-heading">
        <span>Loading photos</span>
        <strong class="gallery-progress-percentage">0%</strong>
      </div>
      <div class="gallery-progress-track"><div class="gallery-progress-bar"></div></div>
      <p class="gallery-progress-count">0 of ${photos.length} photos loaded</p>
    </div>
    ${photos.map(photo => `<button class="photo-tile" data-full="${photo.image_url}"><img loading="lazy" src="${photo.thumbnail_url || photo.image_url}" alt="${escapeHtml(photo.caption || album.title)}"></button>`).join('')}`;

  albumDialog.showModal();

  const images = [...grid.querySelectorAll('.photo-tile img')];
  let loaded = 0;
  const markLoaded = () => {
    loaded += 1;
    updatePhotoProgress(loaded, images.length);
  };

  if (!images.length) updatePhotoProgress(0, 0);

  images.forEach(image => {
    if (image.complete) {
      markLoaded();
    } else {
      image.addEventListener('load', markLoaded, { once: true });
      image.addEventListener('error', markLoaded, { once: true });
    }
  });

  grid.querySelectorAll('.photo-tile').forEach(tile => tile.addEventListener('click', () => {
    document.querySelector('#lightbox-image').src = tile.dataset.full;
    lightbox.showModal();
  }));
}

loadAlbums();