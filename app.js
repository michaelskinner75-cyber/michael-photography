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
  grid.innerHTML = photos.map(photo => `<button class="photo-tile" data-full="${photo.image_url}"><img loading="lazy" src="${photo.thumbnail_url || photo.image_url}" alt="${escapeHtml(photo.caption || album.title)}"></button>`).join('');
  grid.querySelectorAll('.photo-tile').forEach(tile => tile.addEventListener('click', () => {
    document.querySelector('#lightbox-image').src = tile.dataset.full;
    lightbox.showModal();
  }));
  albumDialog.showModal();
}

loadAlbums();
