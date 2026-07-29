const config = window.PHOTO_SITE_CONFIG;
const configured = Boolean(config && config.supabaseUrl && config.supabaseAnonKey && !config.supabaseUrl.includes('YOUR-PROJECT') && !config.supabaseAnonKey.includes('YOUR-SUPABASE'));
const client = configured ? supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const loginPanel = document.querySelector('#login-panel');
const managerPanel = document.querySelector('#manager-panel');
const filesInput = document.querySelector('#photo-files');
const dropZone = document.querySelector('#drop-zone');
const loginMessage = document.querySelector('#login-message');
let albums = [];

const WEB_MAX_EDGE = 2200;
const WEB_QUALITY = 0.82;
const THUMB_MAX_EDGE = 700;
const THUMB_QUALITY = 0.76;

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function showMessage(element, message, error = false) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('error', error);
}
function setLoggedIn(ok) {
  loginPanel?.classList.toggle('hidden', ok);
  managerPanel?.classList.toggle('hidden', !ok);
  if (ok) refreshAlbums();
}
function bytesLabel(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function publicUrl(path) {
  return client.storage.from('photos').getPublicUrl(path).data.publicUrl;
}
function storagePathFromUrl(url = '') {
  try {
    const marker = '/storage/v1/object/public/photos/';
    const index = url.indexOf(marker);
    return index >= 0 ? decodeURIComponent(url.slice(index + marker.length).split('?')[0]) : '';
  } catch {
    return '';
  }
}

async function sourceFromBlob(blob) {
  if ('createImageBitmap' in window) return createImageBitmap(blob);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image could not be read.')); };
    image.src = url;
  });
}
async function resizeBlob(blob, maxEdge, quality) {
  const source = await sourceFromBlob(blob);
  const sourceWidth = source.width || source.naturalWidth;
  const sourceHeight = source.height || source.naturalHeight;
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  source.close?.();
  return new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Image optimisation failed.')), 'image/jpeg', quality));
}
async function makeWebCopies(blob) {
  const [web, thumb] = await Promise.all([
    resizeBlob(blob, WEB_MAX_EDGE, WEB_QUALITY),
    resizeBlob(blob, THUMB_MAX_EDGE, THUMB_QUALITY)
  ]);
  return { web, thumb };
}
async function uploadBlob(path, blob) {
  const { error } = await client.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (error) throw error;
}

if (!configured) {
  showMessage(loginMessage, 'Supabase is not configured yet.', true);
} else {
  client.auth.getSession().then(({ data, error }) => {
    if (error) showMessage(loginMessage, error.message, true);
    setLoggedIn(Boolean(data?.session));
  });
  client.auth.onAuthStateChange((_event, session) => setLoggedIn(Boolean(session)));
}

document.querySelector('#login-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  showMessage(loginMessage, 'Signing in…');
  const { data, error } = await client.auth.signInWithPassword({
    email: document.querySelector('#email').value.trim(),
    password: document.querySelector('#password').value
  });
  if (error) return showMessage(loginMessage, error.message, true);
  setLoggedIn(Boolean(data?.session));
});
document.querySelector('#logout-button')?.addEventListener('click', () => client.auth.signOut());

document.querySelector('#album-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const title = document.querySelector('#album-title').value.trim();
  const { error } = await client.from('albums').insert({
    title,
    slug: `${slugify(title)}-${Date.now().toString().slice(-6)}`,
    description: document.querySelector('#album-description').value.trim(),
    event_date: document.querySelector('#album-date').value || null,
    expires_at: document.querySelector('#album-expiry').value || null,
    is_public: document.querySelector('#album-public').checked,
    watermark_enabled: document.querySelector('#album-watermark').checked,
    watermark_type: document.querySelector('#album-watermark-type').value
  });
  if (error) return alert(error.message);
  event.target.reset();
  document.querySelector('#album-public').checked = true;
  refreshAlbums();
});

async function refreshAlbums() {
  const { data, error } = await client.from('albums').select('id,title,event_date,expires_at,is_public,cover_url,created_at,watermark_enabled,watermark_type,photos(count)').order('created_at', { ascending: false });
  if (error) return showMessage(loginMessage, `Database error: ${error.message}`, true);
  albums = data || [];
  const options = '<option value="">Select an album</option>' + albums.map(album => `<option value="${album.id}">${escapeHtml(album.title)}</option>`).join('');
  document.querySelector('#album-select').innerHTML = options;
  document.querySelector('#optimise-album-select').innerHTML = options;
  const list = document.querySelector('#admin-album-list');
  list.innerHTML = albums.map(album => `<article class="admin-album-row"><div class="admin-thumb" style="background-image:url('${album.cover_url || ''}')"></div><div><strong>${escapeHtml(album.title)}</strong><small>${album.event_date || 'No date'} · ${album.photos?.[0]?.count || 0} photos · ${album.is_public ? 'Public' : 'Private'}${album.expires_at ? ` · expires ${album.expires_at}` : ''}</small></div><div class="watermark-settings"><select data-watermark-type="${album.id}" aria-label="Watermark style"><option value="proof" ${album.watermark_type === 'proof' ? 'selected' : ''}>PROOF</option><option value="logo" ${album.watermark_type === 'logo' ? 'selected' : ''}>MS logo</option></select><button class="watermark-toggle ${album.watermark_enabled ? 'active' : ''}" data-watermark-toggle="${album.id}" type="button">${album.watermark_enabled ? 'Watermark on' : 'Watermark off'}</button></div><button class="danger-text" data-delete="${album.id}">Delete</button></article>`).join('') || '<p>No albums yet.</p>';
  list.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => deleteAlbum(button.dataset.delete)));
  list.querySelectorAll('[data-watermark-toggle]').forEach(button => button.addEventListener('click', () => toggleWatermark(button.dataset.watermarkToggle)));
  list.querySelectorAll('[data-watermark-type]').forEach(select => select.addEventListener('change', () => setWatermarkType(select.dataset.watermarkType, select.value)));
}
async function toggleWatermark(id) {
  const album = albums.find(item => item.id === id);
  const { error } = await client.from('albums').update({ watermark_enabled: !album.watermark_enabled }).eq('id', id);
  if (error) alert(error.message); else refreshAlbums();
}
async function setWatermarkType(id, type) {
  const { error } = await client.from('albums').update({ watermark_type: type }).eq('id', id);
  if (error) alert(error.message); else refreshAlbums();
}
async function deleteAlbum(id) {
  if (!confirm('Delete this album and all of its photos?')) return;
  const { data: photos } = await client.from('photos').select('storage_path,thumbnail_url').eq('album_id', id);
  const paths = [...new Set((photos || []).flatMap(photo => [photo.storage_path, storagePathFromUrl(photo.thumbnail_url)]).filter(Boolean))];
  if (paths.length) await client.storage.from('photos').remove(paths);
  const { error } = await client.from('albums').delete().eq('id', id);
  if (error) alert(error.message); else refreshAlbums();
}

['dragenter', 'dragover'].forEach(name => dropZone?.addEventListener(name, event => { event.preventDefault(); dropZone.classList.add('dragging'); }));
['dragleave', 'drop'].forEach(name => dropZone?.addEventListener(name, event => { event.preventDefault(); dropZone.classList.remove('dragging'); }));
dropZone?.addEventListener('drop', event => { filesInput.files = event.dataTransfer.files; updateFileSummary(); });
filesInput?.addEventListener('change', updateFileSummary);
function updateFileSummary() {
  const count = filesInput.files.length;
  const size = [...filesInput.files].reduce((total, file) => total + file.size, 0);
  document.querySelector('#file-summary').textContent = count ? `${count} photos selected · ${bytesLabel(size)} before optimisation` : 'No photos selected';
}

document.querySelector('#upload-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const albumId = document.querySelector('#album-select').value;
  const files = [...filesInput.files];
  if (!albumId || !files.length) return alert('Choose an album and at least one photo.');
  const status = document.querySelector('#upload-status');
  const bar = document.querySelector('#progress-bar');
  const text = document.querySelector('#progress-text');
  const submit = event.submitter;
  status.classList.remove('hidden');
  submit.disabled = true;
  let completed = 0;
  let uploaded = 0;
  let failed = 0;
  let firstThumbUrl = null;
  let newBytes = 0;
  for (const file of files) {
    try {
      text.textContent = `Optimising ${completed + 1} of ${files.length}…`;
      const { web, thumb } = await makeWebCopies(file);
      const id = crypto.randomUUID();
      const webPath = `${albumId}/${id}-web.jpg`;
      const thumbPath = `${albumId}/${id}-thumb.jpg`;
      await uploadBlob(webPath, web);
      try {
        await uploadBlob(thumbPath, thumb);
      } catch (error) {
        await client.storage.from('photos').remove([webPath]);
        throw error;
      }
      const imageUrl = publicUrl(webPath);
      const thumbnailUrl = publicUrl(thumbPath);
      const { error: insertError } = await client.from('photos').insert({ album_id: albumId, storage_path: webPath, image_url: imageUrl, thumbnail_url: thumbnailUrl, sort_order: completed });
      if (insertError) {
        await client.storage.from('photos').remove([webPath, thumbPath]);
        throw insertError;
      }
      firstThumbUrl ||= thumbnailUrl;
      newBytes += web.size + thumb.size;
      uploaded++;
    } catch (error) {
      console.error('Photo upload failed:', error);
      failed++;
    }
    completed++;
    bar.style.width = `${Math.round(completed / files.length * 100)}%`;
    text.textContent = `Processed ${completed} of ${files.length} photos`;
  }
  const album = albums.find(item => item.id === albumId);
  if (firstThumbUrl && !album?.cover_url) await client.from('albums').update({ cover_url: firstThumbUrl }).eq('id', albumId);
  filesInput.value = '';
  updateFileSummary();
  text.textContent = `Complete — ${uploaded} uploaded${failed ? `, ${failed} failed` : ''}. Online copies total ${bytesLabel(newBytes)}.`;
  submit.disabled = false;
  refreshAlbums();
});

document.querySelector('#optimise-form')?.addEventListener('submit', async event => {
  event.preventDefault();
  const albumId = document.querySelector('#optimise-album-select').value;
  const album = albums.find(item => item.id === albumId);
  if (!albumId || !album) return alert('Choose an album first.');
  if (!confirm(`Optimise all existing photos in “${album.title}”? Keep this page open until it finishes.`)) return;
  const status = document.querySelector('#optimise-status');
  const bar = document.querySelector('#optimise-progress-bar');
  const text = document.querySelector('#optimise-progress-text');
  const result = document.querySelector('#optimise-result');
  const button = document.querySelector('#optimise-button');
  status.classList.remove('hidden');
  result.textContent = '';
  button.disabled = true;
  const { data: photos, error: photoError } = await client.from('photos').select('id,image_url,thumbnail_url,storage_path,sort_order').eq('album_id', albumId).order('sort_order');
  if (photoError) {
    button.disabled = false;
    return alert(photoError.message);
  }
  if (!photos?.length) {
    text.textContent = 'This album has no photos.';
    button.disabled = false;
    return;
  }
  let completed = 0;
  let succeeded = 0;
  let failed = 0;
  let oldBytes = 0;
  let newBytes = 0;
  let firstThumbUrl = null;
  for (const photo of photos) {
    try {
      text.textContent = `Downloading and optimising ${completed + 1} of ${photos.length}…`;
      const response = await fetch(photo.image_url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Image download failed (${response.status})`);
      const originalBlob = await response.blob();
      const { web, thumb } = await makeWebCopies(originalBlob);
      const id = crypto.randomUUID();
      const webPath = `${albumId}/${id}-web.jpg`;
      const thumbPath = `${albumId}/${id}-thumb.jpg`;
      await uploadBlob(webPath, web);
      try {
        await uploadBlob(thumbPath, thumb);
      } catch (error) {
        await client.storage.from('photos').remove([webPath]);
        throw error;
      }
      const imageUrl = publicUrl(webPath);
      const thumbnailUrl = publicUrl(thumbPath);
      const { error: updateError } = await client.from('photos').update({ storage_path: webPath, image_url: imageUrl, thumbnail_url: thumbnailUrl }).eq('id', photo.id);
      if (updateError) {
        await client.storage.from('photos').remove([webPath, thumbPath]);
        throw updateError;
      }
      const oldPaths = [...new Set([photo.storage_path, storagePathFromUrl(photo.thumbnail_url)].filter(path => path && path !== webPath && path !== thumbPath))];
      if (oldPaths.length) await client.storage.from('photos').remove(oldPaths);
      oldBytes += originalBlob.size;
      newBytes += web.size + thumb.size;
      firstThumbUrl ||= thumbnailUrl;
      succeeded++;
    } catch (error) {
      console.error('Existing photo optimisation failed:', error);
      failed++;
    }
    completed++;
    bar.style.width = `${Math.round(completed / photos.length * 100)}%`;
    text.textContent = `Processed ${completed} of ${photos.length} photos`;
  }
  if (firstThumbUrl) await client.from('albums').update({ cover_url: firstThumbUrl }).eq('id', albumId);
  const saved = Math.max(0, oldBytes - newBytes);
  const percentage = oldBytes ? Math.round(saved / oldBytes * 100) : 0;
  result.textContent = `Finished: ${succeeded} optimised${failed ? `, ${failed} failed` : ''}. Reduced processed files from ${bytesLabel(oldBytes)} to ${bytesLabel(newBytes)} — about ${percentage}% smaller.`;
  button.disabled = false;
  refreshAlbums();
});