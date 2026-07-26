const albumForm = document.querySelector('#album-form');

albumForm.addEventListener('submit', async event => {
  event.preventDefault();
  event.stopImmediatePropagation();

  const title = document.querySelector('#album-title').value.trim();
  const expiry = document.querySelector('#album-expiry').value;
  const { error } = await client.from('albums').insert({
    title,
    slug: `${slugify(title)}-${Date.now().toString().slice(-6)}`,
    description: document.querySelector('#album-description').value.trim(),
    event_date: document.querySelector('#album-date').value || null,
    expires_at: expiry ? `${expiry}T23:59:59Z` : null,
    is_public: document.querySelector('#album-public').checked
  });

  if (error) return alert(error.message);
  albumForm.reset();
  document.querySelector('#album-public').checked = true;
  refreshAlbums();
}, true);

document.querySelector('#purge-expired').addEventListener('click', async () => {
  if (!confirm('Permanently delete every expired gallery and all its photos?')) return;

  const { data: expired, error } = await client
    .from('albums')
    .select('id,title')
    .lt('expires_at', new Date().toISOString());

  if (error) return alert(error.message);
  if (!expired?.length) return alert('There are no expired galleries to purge.');

  for (const album of expired) {
    const { data: photos } = await client.from('photos').select('storage_path').eq('album_id', album.id);
    if (photos?.length) {
      const { error: storageError } = await client.storage.from('photos').remove(photos.map(photo => photo.storage_path));
      if (storageError) return alert(`Could not remove photos from ${album.title}: ${storageError.message}`);
    }
    const { error: deleteError } = await client.from('albums').delete().eq('id', album.id);
    if (deleteError) return alert(`Could not delete ${album.title}: ${deleteError.message}`);
  }

  alert(`${expired.length} expired ${expired.length === 1 ? 'gallery' : 'galleries'} deleted.`);
  refreshAlbums();
});
