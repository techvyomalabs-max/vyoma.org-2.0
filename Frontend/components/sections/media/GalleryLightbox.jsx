'use client';

import { useState } from 'react';
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';

// The album grid on /media/gallery plus its click-to-open lightbox modal.
// Kept as a single client component (rather than splitting the grid out as
// a server component) since the open/closed state has to live somewhere
// that can see both pieces.
export function GalleryLightbox({ albums }) {
  const [openAlbum, setOpenAlbum] = useState(null);

  return (
    <>
      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))' }}>
        {albums.map((album) => (
          <button
            key={album.title}
            type="button"
            onClick={() => setOpenAlbum(album)}
            className="overflow-hidden rounded-md border border-[var(--border-subtle)] bg-white text-left"
          >
            <div className="aspect-[4/3] border-b-[3px] border-b-amber-gold">
              <ImagePlaceholder shape="rect" caption="Cover" />
            </div>
            <div className="p-4">
              <div className="font-sans text-lg font-bold text-vyoma-blue">{album.title}</div>
              <div className="mt-1 font-sans text-sm font-bold text-teal">
                {album.count ? `${album.count} photos` : 'View album'}
              </div>
            </div>
          </button>
        ))}
      </div>

      {openAlbum && (
        <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[rgba(11,20,32,0.92)] p-8">
          <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between">
            <div>
              <div className="font-sans text-xl font-bold text-white">{openAlbum.title}</div>
              <div className="mt-1 font-sans text-sm text-[var(--text-inverse-muted)]">
                {openAlbum.count || 6} photos
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
            {Array.from({ length: openAlbum.count || 6 }).map((_, i) => (
              <div key={i}>
                <div className="aspect-[4/3]">
                  <ImagePlaceholder shape="rect" caption="Photo" />
                </div>
                <div className="mt-1.5 font-sans text-xs text-[var(--text-inverse-muted)]">Caption to come.</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
