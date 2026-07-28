const config=window.PHOTO_SITE_CONFIG;
const configured=config&&!config.supabaseUrl.includes('YOUR-PROJECT')&&!config.supabaseAnonKey.includes('YOUR-SUPABASE');
const client=configured?supabase.createClient(config.supabaseUrl,config.supabaseAnonKey):null;
const albumGrid=document.querySelector('#album-grid');
const albumDialog=document.querySelector('#album-dialog');
const lightbox=document.querySelector('#lightbox');
const requestDialog=document.querySelector('#request-dialog');
let selectedPhotoUrl='',selectedPhotoTitle='',selectedAlbumWatermarked=false,selectedWatermarkType='proof';

document.querySelector('#year').textContent=new Date().getFullYear();
document.querySelector('.menu-toggle')?.addEventListener('click',()=>document.querySelector('.nav').classList.toggle('open'));
window.addEventListener('scroll',()=>document.querySelector('.cinematic-header')?.classList.toggle('scrolled',scrollY>40));
document.querySelectorAll('.dialog-close').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
document.querySelector('#cancel-request')?.addEventListener('click',()=>requestDialog.close());
document.querySelector('.reaction-panel')?.remove();

const loadingStyles=document.createElement('style');
loadingStyles.textContent=`
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

const heroHeading=document.querySelector('.hero h1');
if(heroHeading)heroHeading.innerHTML='Photography<br><span>Cars, animals & everyday moments</span>';
const heroKicker=document.querySelector('.hero .kicker');
if(heroKicker)heroKicker.textContent='MS Photography · Fife';
const heroDescription=document.querySelector('.hero-copy>p:last-of-type');
if(heroDescription)heroDescription.textContent='Automotive photography, animals, people, local scenes and the moments that catch my eye — a personal collection by hobbyist photographer Michael Skinner.';
const albumsHeading=document.querySelector('#albums .section-top h2');
if(albumsHeading)albumsHeading.textContent='Latest albums';
const albumsIntro=document.querySelector('#albums .section-top>p');
if(albumsIntro)albumsIntro.textContent='The newest public galleries, including complete event albums. Open any album to view the photographs, download where available, request an edit or enquire about purchasing an image.';

function escapeHtml(v=''){return v.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function formatDate(v){return v?new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric'}).format(new Date(`${v}T12:00:00`)):''}
function logoMarkup(){return `<svg viewBox="0 0 300 190" aria-hidden="true"><path d="M102 47h38l14-27h65l14 27h28c17 0 31 14 31 31v60c0 17-14 31-31 31H91c-17 0-31-14-31-31V78c0-17 14-31 31-31z" fill="none" stroke="white" stroke-width="10" stroke-linejoin="round"/><circle cx="214" cy="108" r="40" fill="none" stroke="white" stroke-width="10"/><text x="8" y="142" fill="white" font-family="Georgia,serif" font-size="112" font-weight="700">MS</text></svg>`}
function watermarkMarkup(type){return `<span class="photo-watermark ${type==='logo'?'logo':'proof'}">${type==='logo'?logoMarkup():''}</span>`}
function isWeddingAlbum(album){return /(wedding|mr\s*&\s*mrs|innes|bride|groom)/i.test(`${album.title||''} ${album.description||''}`)}
function isCarAlbum(album){return /(car|cars|automotive|porsche|bmw|vehicle|motor)/i.test(`${album.title||''} ${album.description||''}`)}

async function loadAlbums(){
  if(!configured){albumGrid.innerHTML='<p>Supabase is not configured.</p>';return}
  const{data,error}=await client.from('albums').select('id,title,description,event_date,expires_at,cover_url,created_at,view_count,photos(count)').eq('is_public',true).order('created_at',{ascending:false});
  if(error){albumGrid.innerHTML='<p>Albums could not be loaded.</p>';return}
  const publicAlbums=data||[];
  if(!publicAlbums.length){albumGrid.innerHTML='<p>No public albums have been added yet.</p>';return}
  const automotiveCover=publicAlbums.find(album=>isCarAlbum(album)&&album.cover_url)?.cover_url;
  const nonWeddingCover=publicAlbums.find(album=>!isWeddingAlbum(album)&&album.cover_url)?.cover_url;
  const heroCover=automotiveCover||nonWeddingCover;
  if(heroCover){document.querySelector('.hero').style.backgroundImage=`url('${heroCover}')`;document.querySelector('#feature-image').style.backgroundImage=`url('${heroCover}')`}
  albumGrid.innerHTML=publicAlbums.map(a=>`<button class="album-banner" data-id="${a.id}" style="background-image:url('${a.cover_url||''}')"><div class="album-banner-content"><div><h3>${escapeHtml(a.title)}</h3><div class="album-details"><span>▣ ${a.photos?.[0]?.count||0} photos</span><span class="album-stats">◉ ${Number(a.view_count||0).toLocaleString('en-GB')} views</span>${a.event_date?`<span>${escapeHtml(formatDate(a.event_date))}</span>`:''}</div></div><span class="album-arrow">→</span></div></button>`).join('');
  albumGrid.querySelectorAll('.album-banner').forEach(c=>c.addEventListener('click',()=>openAlbum(c.dataset.id)));
}

function updatePhotoProgress(loaded,total){
  const p=document.querySelector('#photo-loading-progress');if(!p)return;
  const pc=total?Math.round(loaded/total*100):100;
  p.querySelector('.gallery-progress-bar').style.width=`${pc}%`;
  p.querySelector('.gallery-progress-percentage').textContent=`${pc}%`;
  p.querySelector('.gallery-progress-count').textContent=total?`${loaded} of ${total} photos loaded`:'No photos in this album';
  if(loaded>=total){p.classList.add('finishing');setTimeout(()=>p.remove(),400)}
}
function openPhotoRequest(type){const purchase=type==='purchase';document.querySelector('#request-type').value=type;document.querySelector('#request-photo-url').value=selectedPhotoUrl;document.querySelector('#request-photo-preview').src=selectedPhotoUrl;document.querySelector('#request-eyebrow').textContent=purchase?'Purchase enquiry':'Photo editing';document.querySelector('#request-title').textContent=purchase?'Purchase this photo':'Request an edit';document.querySelector('#request-details').placeholder=purchase?'Digital copy, print size or intended use':'Describe the edit or restoration you would like';requestDialog.showModal()}
async function downloadSelectedPhoto(){if(!selectedPhotoUrl||selectedAlbumWatermarked)return;const b=document.querySelector('#download-photo'),old=b.textContent;b.textContent='Preparing…';b.disabled=true;try{const r=await fetch(selectedPhotoUrl);const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${selectedPhotoTitle||'ms-photography'}.jpg`.replace(/[^a-z0-9._-]+/gi,'-');a.click();URL.revokeObjectURL(url)}catch{window.open(selectedPhotoUrl,'_blank','noopener')}finally{b.textContent=old;b.disabled=false}}
document.querySelector('#download-photo')?.addEventListener('click',downloadSelectedPhoto);
document.querySelector('#request-edit')?.addEventListener('click',()=>openPhotoRequest('edit'));
document.querySelector('#purchase-photo')?.addEventListener('click',()=>openPhotoRequest('purchase'));
document.querySelector('#request-form')?.addEventListener('submit',e=>{e.preventDefault();const type=document.querySelector('#request-type').value,name=document.querySelector('#request-name').value.trim(),email=document.querySelector('#request-email').value.trim(),details=document.querySelector('#request-details').value.trim(),photo=document.querySelector('#request-photo-url').value,subject=type==='purchase'?'Photo purchase enquiry':'Photo edit request',body=`Name: ${name}\nEmail: ${email}\nRequest: ${type}\nPhoto: ${photo}\n\nDetails:\n${details}`;location.href=`mailto:michaelskinner75@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;requestDialog.close()});

async function openAlbum(id){
  const[{data:album},{data:photos,error}]=await Promise.all([client.from('albums').select('*').eq('id',id).single(),client.from('photos').select('id,image_url,thumbnail_url,caption,sort_order').eq('album_id',id).order('sort_order')]);
  if(error||!album)return;
  const{data:newCount}=await client.rpc('increment_album_view',{p_album_id:id});
  const card=albumGrid.querySelector(`.album-banner[data-id="${id}"] .album-stats`);if(card)card.textContent=`◉ ${Number(newCount||0).toLocaleString('en-GB')} views`;
  selectedAlbumWatermarked=Boolean(album.watermark_enabled);selectedWatermarkType=album.watermark_type||'proof';
  document.querySelector('#dialog-title').textContent=album.title;document.querySelector('#dialog-date').textContent=formatDate(album.event_date);document.querySelector('#dialog-description').textContent=album.description||'';
  const grid=document.querySelector('#photo-grid');
  grid.innerHTML=`<div id="photo-loading-progress" class="gallery-progress"><div class="gallery-spinner" aria-hidden="true"></div><div class="gallery-progress-heading"><span>Loading photographs</span><strong class="gallery-progress-percentage">0%</strong></div><div class="gallery-progress-track"><div class="gallery-progress-bar"></div></div><p class="gallery-progress-count">0 of ${photos.length} photos loaded</p></div>${photos.map(p=>`<button class="photo-tile" data-full="${p.image_url}" data-title="${escapeHtml(p.caption||album.title)}"><img loading="lazy" src="${p.thumbnail_url||p.image_url}" alt="${escapeHtml(p.caption||album.title)}">${selectedAlbumWatermarked?watermarkMarkup(selectedWatermarkType):''}</button>`).join('')}`;
  albumDialog.showModal();
  const images=[...grid.querySelectorAll('img')];let loaded=0;
  const done=image=>{image.closest('.photo-tile')?.classList.add('loaded');updatePhotoProgress(++loaded,images.length)};
  if(!images.length)updatePhotoProgress(0,0);
  images.forEach(i=>i.complete?done(i):(i.addEventListener('load',()=>done(i),{once:true}),i.addEventListener('error',()=>done(i),{once:true})));
  grid.querySelectorAll('.photo-tile').forEach(t=>t.addEventListener('click',()=>{selectedPhotoUrl=t.dataset.full;selectedPhotoTitle=t.dataset.title||album.title;document.querySelector('#lightbox-image').src=selectedPhotoUrl;const wm=document.querySelector('#lightbox-watermark');wm.className=selectedAlbumWatermarked?`photo-watermark ${selectedWatermarkType==='logo'?'logo':'proof'}`:'';wm.innerHTML=selectedAlbumWatermarked&&selectedWatermarkType==='logo'?logoMarkup():'';const download=document.querySelector('#download-photo');download.disabled=selectedAlbumWatermarked;download.textContent=selectedAlbumWatermarked?'Download unavailable on proof':'Download photo';lightbox.showModal()}));
}
loadAlbums();