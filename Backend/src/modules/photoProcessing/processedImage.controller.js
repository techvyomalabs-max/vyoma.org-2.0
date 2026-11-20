import mongoose from 'mongoose';
import { ProcessedImageModel } from './processedImage.model.js';

// GET /api/v1/public/processed-images/:id -- QA Bug 7 Stage C. Public,
// unauthenticated (Public Core Team/Leadership images must load without
// admin credentials) read-only access to one stored processed image's raw
// bytes. Only ever serves a document that exists in this one, dedicated
// collection -- see processedImage.model.js's own header comment: a
// ProcessedImage document is only ever created once background removal has
// *already fully succeeded* (backgroundRemoval.service.js's Mongo storage
// branch calls Model.create() only after validating the buffer), so there
// is no "draft"/"unapproved" state this collection can ever hold -- every
// id that resolves here is, by construction, already a finalized result.
// This function never reads or exposes anything from any other collection.
export async function getProcessedImagePublic(req, res) {
  const { id } = req.params;

  // Validates the id shape before ever touching the database -- the exact
  // same guard this module's own admin controller already uses
  // (photoProcessing.admin.controller.js's getPhotoProcessingStatus) for
  // the identical reason: an invalid id is a 404, never a 500, and never
  // echoed back into the response.
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(404).end();
    return;
  }

  let doc;
  try {
    // Explicit allowlist projection -- `sourceJobId`/timestamps/every other
    // field on this document are never read here at all, so they can never
    // be exposed by this route even by accident; only the two fields this
    // response actually needs ever leave the database.
    //
    // Deliberately NOT `.lean()`: a lean query bypasses Mongoose's own
    // Buffer SchemaType getter and can hand back the MongoDB driver's raw
    // BSON Binary wrapper instead of a plain Node Buffer for `data`
    // (confirmed directly -- `res.send()` on that wrapper produced a
    // corrupted, non-matching byte stream in this module's own tests).
    // The hydrated document's own getter always returns a real Buffer.
    doc = await ProcessedImageModel.findById(id).select('data mimeType');
  } catch {
    // Never surfaces the underlying error (a malformed query, a transient
    // DB hiccup, etc.) -- a public image endpoint has no internal detail
    // worth revealing, and doing so would violate "do not expose internal
    // error details." Collapses to the same safe 404 as genuinely missing.
    res.status(404).end();
    return;
  }

  if (!doc) {
    res.status(404).end();
    return;
  }

  res.setHeader('Content-Type', doc.mimeType || 'image/png');
  // Same CORP relaxation already applied to the dev-only local-media
  // static route (app.js) -- Helmet's default same-origin policy would
  // otherwise make the Frontend (a different origin) silently fail to
  // render this in an <img> tag, a 200 response that still shows as a
  // broken image.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  // Safe to cache aggressively and immutably: every document gets a brand
  // new _id and is never updated in place (confirmed by this model having
  // no update path anywhere in this codebase), so the same id can never
  // later resolve to different bytes.
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(doc.data);
}
