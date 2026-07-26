const config = window.PHOTO_SITE_CONFIG;
const configured = config && !config.supabaseUrl.includes('YOUR-PROJECT') && !config.supabaseAnonKey.includes('YOUR-SUPABASE');
const client = configured ? supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
const loginPanel = document.querySelector('#login-panel');
const managerPanel = document.querySelector('#manager-panel');
const filesInput = document.querySelector('#photo-files');
const dropZone = document.querySelector('#drop-zone');
let albums = [];

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function showMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle('error', isError);
}
function setLoggedIn(loggedIn) {
  loginPanel.classList.toggle('hidden', loggedIn);
  managerPanel.classList.toggle('hidden', !loggedIn);
  if (loggedIn) refreshAlbums();
}

if (!configured) {
  showMessage(document.querySelector('#login-message'), 'Add your Supabase URL and publishable key to config.js first.', true);
  document.querySelectorAll('#login-panel button').forEach(button => button.disabled = true);
} else {
  client.auth.getSession().then(({ data }) => setLoggedIn(Boolean(data.session)));
  client.auth.onAuthStateChange((_event, session) => setLoggedIn(Boolean(session)));
}

document.querySelector('#magic-link-form').addEventListener('submit', async event => {
  event.preventDefault();
  const message = document.querySelector('#login-message');
  const email = document.querySelector('#magic-email').value.trim();
  showMessage(message, 'Sending your secure sign-in link…');
  const redirectTo = new URL('admin.html', window.location.href).href;
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo }
  });
  showMessage(message, error ? error.message : 'Email sent. Open the newest link on this device; it will return you to the Album Manager.', Boolean(error));
});

document.querySelector('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const message = document.querySelector('#login-message');
  const email = document.querySelector('#email').value.trim();
  const password = document.querySelector('#password').value;
  if (!email || !password) return showMessage(message, 'Enter both email and password.', true);
  showMessage(message, 'Signing in…');
  const { error } = await client.auth.signInWithPassword({ email, password });
  showMessage(message, error ? error.message : '', Boolean(error));
});

document.querySelector('#logout-button').addEventListener('click', () => client.auth.signOut());

document.querySelector('#album-form').addEventListener('submit', async event => {
  event.preventDefault();
  const title = document.querySelector('#album-title').value.trim();
  const { error } = await client.from('albums').insert({
    title,
    slug: `${slugify(title)}-${Date.now().toString().slice(-6)}`,
    description: document.querySelector('#album-description').value.trim(),
    event_date: document.querySelector('#album-date').value || null,
    expires_at: document.querySelector('#album-expiry').value || null,
    is_public: document.querySelector('#album-public').checked
  });
  if (error) return alert(error.message);
  event.target.reset();
  document.querySelector('#album-public').checked = true;
  refreshAlbums();
});

async function refreshAlbums() {
  const { data, error } = await client.from('albums').select('id,title,event_date,expires_at,is_public,cover_url,created_at,photos(count)').order('created_at', { ascending: false });
  if (error) return console.error(error);
  albums = data || [];
  const select = document.querySelector('#album-select');
  select.innerHTML = '<option value="">Select an album</option>' + albums.map(album => `<option value="${album.id}">${album.title}</option>`).join('');
  const list = document.querySelector('#admin-album-list');
  list.innerHTML = albums.map(album => `
    <article class="admin-album-row">
      <div class="admin-thumb" style="background-image:url('${album.cover_url || ''}')"></div>
      <div><strong>${album.title}</strong><small>${album.event_date || 'No date'} · ${album.photos?.[0]?.count || 0} photos · ${album.is_public ? 'Public' : 'Private'}${album.expires_at ? ` · expires ${album.expires_at}` : ''}</small></div>
      <button class="danger-text" data-delete="${album.id}">Delete</button>
    </article>`).join('') || '<p>No albums yet.</p>';
  list.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => deleteAlbum(button.dataset.delete)));
}

async function deleteAlbum(id) {
  if (!confirm('Delete this album and all of its photos?')) return;
  const { data: photos } = await client.from('photos').select('storage_path').eq('album_id', id);
  if (photos?.length) await client.storage.from('photos').remove(photos.map(photo => photo.storage_path));
  const { error } = await client.from('albums').delete().eq('id', id);
  if (error) alert(error.message); else refreshAlbums();
}

['dragenter','dragover'].forEach(name => dropZone.addEventListener(name, event => { event.preventDefault(); dropZone.classList.add('dragging'); }));
['dragleave','drop'].forEach(name => dropZone.addEventListener(name, event => { event.preventDefault(); dropZone.classList.remove('dragging'); }));
dropZone.addEventListener('drop', event => { filesInput.files = event.dataTransfer.files; updateFileSummary(); });
filesInput.addEventListener('change', updateFileSummary);
function updateFileSummary() {
  const count = filesInput.files.length;
  const size = [...filesInput.files].reduce((total, file) => total + file.size, 0);
  document.querySelector('#file-summary').textContent = count ? `${count} photos selected · ${(size / 1024 / 1024).toFixed(1)} MB` : 'No photos selected';
}

document.querySelector('#upload-form').addEventListener('submit', async event => {
  event.preventDefault();
  const albumId = document.querySelector('#album-select').value;
  const files = [...filesInput.files];
  if (!albumId || !files.length) return alert('Choose an album and at least one photo.');
  const status = document.querySelector('#upload-status');
  const bar = document.querySelector('#progress-bar');
  const text = document.querySelector('#progress-text');
  status.classList.remove('hidden');
  let completed = 0;
  let firstUrl = null;
  const queue = [...files];
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const file = queue.shift();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const path = `${albumId}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await client.storage.from('photos').upload(path, file, { cacheControl: '31536000', upsert: false });
      if (!uploadError) {
        const { data: publicData } = client.storage.from('photos').getPublicUrl(path);
        const url = publicData.publicUrl;
        firstUrl ||= url;
        await client.from('photos').insert({ album_id: albumId, storage_path: path, image_url: url, thumbnail_url: `${url}?width=900&quality=80`, sort_order: completed });
      }
      completed += 1;
      const percent = Math.round((completed / files.length) * 100);
      bar.style.width = `${percent}%`;
      text.textContent = `Uploaded ${completed} of ${files.length} photos`;
    }
  });
  await Promise.all(workers);
  const album = albums.find(item => item.id === albumId);
  if (firstUrl && !album?.cover_url) await client.from('albums').update({ cover_url: firstUrl }).eq('id', albumId);
  filesInput.value = '';
  updateFileSummary();
  text.textContent = `Complete — ${files.length} photos uploaded.`;
  refreshAlbums();
});