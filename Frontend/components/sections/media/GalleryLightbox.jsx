'use client';

import { useState } from 'react';
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';
import { SmartImage } from '@/components/common/SmartImage';

// The album grid on /media/gallery plus its click-to-open lightbox modal.
// Kept as a single client component (rather than splitting the grid out as
// a server component) since the open/closed state has to live somewhere
// that can see both pieces.
//
// Backward-compatible during the Gallery migration transition: an album
// with no real `images` array (today's live pre-migration data — just
// {title, count}) renders exactly as it always has — placeholder cover,
// placeholder photo boxes, "Caption to come." — so the public page keeps
// working unchanged until the migration actually commits. An album WITH a
// real `images` array (post-migration) renders real photos and genuine
// captions instead; the old placeholder/"Caption to come." treatment is
// never shown for migrated data, only for not-yet-migrated data.
function albumPhotoCount(album) {
  return Array.isArray(album.images) ? album.images.length : album.count;
}

// Extracts the 11-char YouTube video ID from either a youtu.be/ID or
// youtube.com/watch?v=ID URL — enough to build a thumbnail with no new
// dependency or embed player.
function extractYouTubeId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|v=)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function GalleryLightbox({ albums, videos = [] }) {
  const [openAlbum, setOpenAlbum] = useState(null);

  return (
    <>
      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))' }}>
        {albums.map((album) => {
          const images = Array.isArray(album.images) ? album.images : null;
          const count = albumPhotoCount(album);
          return (
            <button
              key={album.title}
              type="button"
              onClick={() => setOpenAlbum(album)}
              className="overflow-hidden rounded-md border border-[var(--border-subtle)] bg-white text-left"
            >
              <div className="aspect-[4/3] border-b-[3px] border-b-amber-gold">
                {images?.length ? (
                  <SmartImage src={images[0].url} alt={images[0].alt || album.title} />
                ) : (
                  <ImagePlaceholder shape="rect" caption="Cover" />
                )}
              </div>
              <div className="p-4">
                <div className="font-sans text-lg font-bold text-vyoma-blue">{album.title}</div>
                <div className="mt-1 font-sans text-sm font-bold text-teal">
                  {count ? `${count} photos` : 'View album'}
                </div>
              </div>
            </button>
          );
        })}

        {videos.map((video) => {
          const videoId = extractYouTubeId(video.url);
          const thumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
          return (
            <a
              key={video.title}
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="overflow-hidden rounded-md border border-[var(--border-subtle)] bg-white text-left"
            >
              <div className="relative aspect-[4/3] border-b-[3px] border-b-amber-gold">
                {thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbnail} alt={video.title} className="h-full w-full object-cover" />
                ) : (
                  <ImagePlaceholder shape="rect" caption="Video" />
                )}
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-4xl text-white drop-shadow">▶</span>
              </div>
              <div className="p-4">
                <div className="font-sans text-lg font-bold text-vyoma-blue">{video.title}</div>
                <div className="mt-1 font-sans text-sm font-bold text-teal">Watch video</div>
              </div>
            </a>
          );
        })}
      </div>

      {openAlbum && (
        <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[rgba(11,20,32,0.92)] p-8">
          <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between">
            <div>
              <div className="font-sans text-xl font-bold text-white">{openAlbum.title}</div>
              <div className="mt-1 font-sans text-sm text-[var(--text-inverse-muted)]">
                {albumPhotoCount(openAlbum) || 6} photos
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpenAlbum(null)}
              aria-label="Close"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[var(--border-inverse-strong)] text-2xl text-white"
            >
              ×
            </button>
          </div>

          <div
            className="mx-auto mt-8 grid w-full max-w-[1100px] gap-5"
            style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}
          >
            {Array.isArray(openAlbum.images) ? (
              openAlbum.images.map((img, i) => (
                <div key={img.attachmentId ?? i}>
                  <div className="aspect-[4/3]">
                    <SmartImage src={img.url} alt={img.alt || openAlbum.title} />
                  </div>
                  {img.caption && (
                    <div className="mt-1.5 font-sans text-xs text-[var(--text-inverse-muted)]">{img.caption}</div>
                  )}
                </div>
              ))
            ) : (
              Array.from({ length: openAlbum.count || 6 }).map((_, i) => (
                <div key={i}>
                  <div className="aspect-[4/3]">
                    <ImagePlaceholder shape="rect" caption="Photo" />
                  </div>
                  <div className="mt-1.5 font-sans text-xs text-[var(--text-inverse-muted)]">Caption to come.</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
