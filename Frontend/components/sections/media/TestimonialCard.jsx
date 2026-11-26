import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';
import { SmartImage } from '@/components/common/SmartImage';
import { resolveVideoTestimonialMedia } from '@/lib/videoTestimonial';
import { isUsableImageUrl } from '@/lib/testimonialImage';

// QA Bug 19 Stage 5D — isUsableImageUrl moved out to lib/testimonialImage.js
// (a plain, JSX-free, directly-importable module — see its own header
// comment) so the new backend-mirroring CMS validation (testimonialCms.mjs)
// can reuse the exact same check instead of a second, independently-
// maintained copy. Behavior is completely unchanged; only its location
// moved. The validated return value (never the raw, unvalidated string) is
// what every caller below actually uses for both the <img src> and the
// clickable href.
// Manual-testing bug report (video testimonials not playing): this "video"
// branch previously rendered a placeholder image plus a bare, decorative
// play-button icon -- no <a>/<button> wrapper, no onClick, no reference to
// any video URL at all, so there was never anything for a click to do
// regardless of what data existed. Fixed to actually link out to the real
// video (item.url) -- the exact same link-out treatment (no embedded
// player) Gallery videos already use on /media/gallery, via the shared
// extractYouTubeId() helper -- rather than inventing a new, inconsistent
// video UX for this one section.
//
// When item.url is missing (true today for the only two seeded video
// testimonials, Ravi Menon and Lakshmi Narayanan -- confirmed directly in
// Backend/scripts/seedData/media.js: TESTIMONIALS_ALL's video entries carry
// only {type, name, role}, no url field at all), this intentionally renders
// the exact same static, non-clickable placeholder as before -- never a
// functional-looking play button with nothing behind it, and never an
// invented URL.
//
// QA Bug 19 follow-up: the play-icon overlay previously rendered
// unconditionally, so a testimonial with no video URL still showed a
// circular "play button" graphic even though nothing was clickable behind
// it -- a misleading affordance. The icon is now gated on hasPlayableVideo,
// same as the <a> wrapper, and the placeholder caption reads "Video
// unavailable" (rather than the generic "Video") specifically when there is
// no URL at all, so a non-interactive card reads as such at a glance.
export function TestimonialCard({ item, featured = false }) {
  if (item.type === 'video') {
    // QA Bug 19 follow-up: `url` here is the resolver's own validated,
    // trimmed value (or null) -- never item.url directly -- so a
    // whitespace-only, malformed, or unsafe-scheme value can never reach
    // the rendered href even if hasPlayableVideo were ever computed
    // separately in the future.
    const { hasPlayableVideo, thumbnail, url } = resolveVideoTestimonialMedia(item);
    // QA Bug 19 Stage 5C: an explicit, CMS-supplied videoThumbnail (e.g. the
    // real Cloudinary poster frame for a non-YouTube video, which has no
    // YouTube ID to auto-derive a thumbnail from) takes priority over the
    // resolver's own YouTube-derived thumbnail -- the resolver's
    // auto-derived one remains the fallback for a video that has no
    // explicit thumbnail set, and the generic placeholder remains the
    // final fallback when neither exists. Never required: the existing
    // {thumbnail ? ... : <ImagePlaceholder/>} contract is unchanged, only
    // which URL is considered "thumbnail" first.
    //
    // QA Bug 19 Stage 5C final correction — the explicit thumbnail is only
    // preferred when it actually passes isUsableImageUrl(): a missing OR
    // malformed/unsafe videoThumbnail.url now falls through to the
    // resolver's own YouTube thumbnail exactly the same way a missing one
    // always did, rather than rendering an unvalidated string as an <img
    // src>.
    const explicitVideoThumbnail = isUsableImageUrl(item.videoThumbnail?.url) ? item.videoThumbnail.url : null;
    const displayThumbnail = explicitVideoThumbnail || thumbnail;

    const media = (
      <div className="relative h-[200px] border-b-[3px] border-b-amber-gold">
        {displayThumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displayThumbnail} alt={(explicitVideoThumbnail && item.videoThumbnail?.alt) || item.name} className="h-full w-full object-cover" />
        ) : (
          <ImagePlaceholder shape="rect" caption={hasPlayableVideo ? 'Video' : 'Video unavailable'} />
        )}
        {hasPlayableVideo && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/80">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--color-vyoma-blue)">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </div>
        )}
      </div>
    );

    return (
      <div className="overflow-hidden rounded-md border border-[var(--border-subtle)] bg-white">
        {hasPlayableVideo ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="block" aria-label={`Watch ${item.name}'s video testimonial`}>
            {media}
          </a>
        ) : (
          media
        )}
        <div className="p-5">
          <div className="font-sans text-base font-bold text-vyoma-blue">{item.name}</div>
          <div className="mt-1 font-sans text-sm text-charcoal">{item.role}</div>
          {/* QA Bug 19 Stage 5C: an optional genuine written quote,
              only when the CMS actually has one for this video testimonial
              -- never fabricated, never required. */}
          {item.quote && <p className="mt-2 font-sans text-sm italic text-charcoal">{item.quote}</p>}
        </div>
      </div>
    );
  }

  if (item.type === 'image') {
    // QA Bug 19 Stage 5C -- public rendering for a genuine image-only
    // testimonial (the real Learner/Teacher/Volunteer scanned images
    // identified in the migration inventory). `SmartImage`'s default
    // `fit="contain"` is reused unchanged: it shows the complete photo at
    // its real aspect ratio, filling any leftover space with a blurred
    // backdrop of the same image rather than ever cropping the written
    // content inside the photo -- exactly the "do not crop, preserve
    // aspect ratio" requirement, with no new image component needed. Name/
    // role/quote are each rendered only when genuinely present -- nothing
    // here is fabricated for an image whose subject is unknown.
    // QA Bug 19 Stage 5C final correction — the image reference is only
    // treated as usable when it passes isUsableImageUrl() (the same
    // existing-CMS-convention check used for the video thumbnail above):
    // a missing OR malformed/unsafe testimonialImage.url now safely falls
    // back to the placeholder, never an unvalidated string handed to
    // SmartImage/rendered as a link.
    const usableImageUrl = isUsableImageUrl(item.testimonialImage?.url) ? item.testimonialImage.url : null;
    const hasInfo = Boolean(item.name || item.role || item.quote);
    const imageMedia = (
      <div className="relative aspect-[4/3] border-b-[3px] border-b-amber-gold bg-sky-mist">
        {usableImageUrl ? (
          <SmartImage src={usableImageUrl} alt={item.testimonialImage?.alt || item.name || 'Testimonial'} />
        ) : (
          <ImagePlaceholder shape="rect" caption="Image unavailable" />
        )}
      </div>
    );
    return (
      <div className="overflow-hidden rounded-md border border-[var(--border-subtle)] bg-white">
        {/* QA Bug 19 Stage 5C final correction — a minimal, safe "view
            full size" affordance, reusing the exact same external-link
            convention the video branch above already uses (target=_blank,
            rel=noopener noreferrer) rather than introducing any new
            lightbox/modal/dependency. Opens the original image directly in
            a new tab via the browser's own native image viewer. Only ever
            rendered for a URL that already passed isUsableImageUrl() --
            never a raw, unvalidated string. */}
        {usableImageUrl ? (
          <a href={usableImageUrl} target="_blank" rel="noopener noreferrer" className="block" aria-label={`View full-size image${item.name ? ` for ${item.name}'s testimonial` : ''}`}>
            {imageMedia}
          </a>
        ) : (
          imageMedia
        )}
        {hasInfo && (
          <div className="p-5">
            {item.name && <div className="font-sans text-base font-bold text-vyoma-blue">{item.name}</div>}
            {item.role && <div className="mt-1 font-sans text-sm text-charcoal">{item.role}</div>}
            {item.quote && <p className="mt-2 font-sans text-sm italic text-charcoal">{item.quote}</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-md border border-[var(--border-subtle)] border-t-[3px] border-t-amber-gold bg-white ${
        featured ? 'p-[32px_28px]' : 'p-6'
      }`}
    >
      {/* This branch previously never rendered a photo at all, regardless
          of data — only entries with a real, verified source image get
          one here (item.image?.url absent for anyone without one; no
          placeholder/invented image is ever shown instead). */}
      {item.image?.url && (
        <div className="mb-3.5 h-14 w-14 overflow-hidden rounded-full border border-[var(--border-subtle)]">
          <SmartImage src={item.image.url} alt={item.image.alt || item.name} />
        </div>
      )}
      <div className={`font-serif text-amber-gold ${featured ? 'text-[48px] leading-none' : 'text-[36px] leading-none'}`}>
        &ldquo;
      </div>
      <p className={`mt-2 font-sans italic text-charcoal ${featured ? 'text-lg' : 'text-[15px]'}`}>{item.quote}</p>
      <div className="mt-4 font-sans text-base font-bold text-vyoma-blue">{item.name}</div>
      <div className="mt-1 font-sans text-sm text-charcoal">{item.role}</div>
    </div>
  );
}
