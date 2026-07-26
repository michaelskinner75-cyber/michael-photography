# Michael Skinner Photography

A mobile-friendly photography portfolio with public albums and a secure bulk uploader capable of handling hundreds of photos per album.

## Features

- Public album gallery and masonry photo view
- Secure email/password Album Manager
- Bulk selection and drag-and-drop upload
- Four parallel upload workers for large albums
- Public/private album visibility
- Automatic first-photo album cover
- Responsive design for phones, tablets and computers
- Supabase database, authentication and image storage

## Setup

1. Create a free Supabase project.
2. Open **SQL Editor**, paste `supabase-setup.sql`, and run it.
3. In **Authentication > Users**, add your administrator email and password.
4. In **Project Settings > API**, copy the Project URL and anonymous public key.
5. Paste both values into `config.js`.
6. Deploy using GitHub Pages, Netlify or Vercel.

## Large albums

The uploader accepts hundreds of files in one selection. It uploads four files concurrently to avoid overwhelming a phone or browser. Keep the browser tab open until the progress reaches 100%.

For best web performance, export JPEG images around 2500–3500 px on the long edge and quality 80–90 before uploading. Keep full-resolution originals safely elsewhere.

## Personalisation

Update the wording and contact link in `index.html`. Replace the gradient hero and About placeholders with your own selected images when ready.
