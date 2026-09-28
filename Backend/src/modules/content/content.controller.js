import { ContentModel } from './content.model.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/apiResponse.js';
import { env } from '../../config/env.js';

// GET /api/v1/public/:type — LLD 7.2. `:type` can contain a slash (e.g.
// "pages/home"), so the route is registered on a wildcard and the full
// remainder is reassembled here.
//
// `?previewSecret=` (Phase B): the ONLY way this route ever returns
// draftData instead of the published data — gated on a server-only shared
// secret (Backend PREVIEW_SECRET / Frontend DRAFT_MODE_SECRET, same value),
// not on any admin session, since the caller is the Frontend's own Next.js
// server rendering a page in Draft Mode, not the browser directly. A wrong
// or missing secret is treated exactly like a normal public request.
export async function getPublicContentByType(req, res, next) {
  try {
    const type = req.params[0];
    const previewing = !!env.previewSecret && req.query.previewSecret === env.previewSecret;

    // status: { $ne: 'draft' } — every Phase 1 document predates the status
    // field entirely and must stay publicly visible (see content.model.js);
    // only a document explicitly in 'draft' status is hidden here. Preview
    // mode skips this filter entirely — it exists to show a draft.
    const doc = previewing
      ? await ContentModel.findOne({ type }).lean()
      : await ContentModel.findOne({ type, status: { $ne: 'draft' } }).lean();

    const data = previewing ? doc?.draftData ?? doc?.data : doc?.data;
    if (!doc || data == null) {
      throw new ApiError(404, 'CONTENT_NOT_FOUND', `No published content for type "${type}"`);
    }
    return sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}
