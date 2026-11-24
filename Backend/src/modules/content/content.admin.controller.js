import { ContentModel } from './content.model.js';
import { ContentRevisionModel } from './contentRevision.model.js';
import { sendSuccess, ApiError } from '../../utils/apiResponse.js';
import { recordAudit } from '../audit/audit.service.js';
import { sanitizeLegalBody } from './sanitizeLegalBody.js';

const MAX_REVISIONS_PER_TYPE = 20;

// Every other Content type's fields are plain text/arrays rendered as text,
// never as raw HTML — this generic draft-save path never needed a
// sanitization step. Batch 2 (Privacy/Terms) introduces `data.BODY` as
// trusted-HTML rendered via dangerouslySetInnerHTML (see the Frontend's
// blog-post-detail page for the existing precedent), so those two types
// specifically must be sanitized at the one point where client input ever
// reaches the database — matching how blog's own dedicated admin controller
// already sanitizes `body` at draft-save time, never re-sanitizing on
// publish/restore.
const LEGAL_BODY_TYPES = new Set(['pages/privacy', 'pages/terms']);

// Internship Role/Skill required validation -- narrowly scoped to
// 'pages/join-us', the only type this check applies to. Mirrors (but does
// not import/share code with) the Frontend's own validateJoinUs() in
// Frontend/app/admin/content/join-us/page.js -- this is the server-side
// enforcement that closes the gap where a direct API request could bypass
// that frontend-only check entirely (the generic PUT/publish handlers
// below previously performed no per-type/per-field validation at all).
const JOIN_US_TYPE = 'pages/join-us';

function isBlankRequiredField(value) {
  return typeof value !== 'string' || value.trim().length === 0;
}

// Validates exactly the one field this task is scoped to
// (`data.INTERNSHIP_OPENINGS`) within a pages/join-us content payload.
// Returns the first problem found, or null. Deliberately mirrors the
// frontend's own validateJoinUs() wording/position convention (one-based
// opening number, naming the missing field(s)) so an admin sees the same
// kind of message whether the rejection came from the browser or a direct
// API call.
//
// `undefined` (the key absent entirely) is accepted as "zero openings" --
// required for compatibility with content documents saved before this
// field, or this validation, existed. An explicitly present `null`, a
// string, a number, or a plain object is rejected outright, exactly like
// a malformed array entry -- none of those are things any current save
// path (frontend or otherwise) legitimately produces, so there is no
// compatibility concern in treating them as invalid rather than as "no
// openings". Every opening is validated regardless of its own `active`
// flag -- an inactive opening is not publicly visible today, but it can
// be flipped visible later without being re-edited, so invalid content
// must never be allowed to exist in the array at all, active or not.
function validateJoinUsContent(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;

  const openings = data.INTERNSHIP_OPENINGS;
  if (openings === undefined) return null;
  if (!Array.isArray(openings)) {
    return 'INTERNSHIP_OPENINGS must be an array of internship openings.';
  }

  for (let i = 0; i < openings.length; i += 1) {
    const opening = openings[i];
    if (opening === null || typeof opening !== 'object' || Array.isArray(opening)) {
      return `Internship opening ${i + 1} is malformed.`;
    }
    const roleMissing = isBlankRequiredField(opening.role);
    const skillMissing = isBlankRequiredField(opening.skill);
    if (roleMissing && skillMissing) return `Internship opening ${i + 1}: Role and Skill are required.`;
    if (roleMissing) return `Internship opening ${i + 1}: Role is required.`;
    if (skillMissing) return `Internship opening ${i + 1}: Skill is required.`;
  }

  return null;
}

function actorOf(req) {
  return { _id: req.user.id, email: req.user.email };
}

function requireType(req) {
  const type = req.query?.type || req.body?.type;
  if (!type || typeof type !== 'string' || !type.trim()) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'type is required.', { type: 'Required.' });
  }
  return type.trim();
}

// Keeps only the MAX_REVISIONS_PER_TYPE most recent revisions for a type —
// the bounded-retention half of the separate-revision-model design (see
// contentRevision.model.js). Runs right after a new revision is inserted.
// Task 7D.33 — exported (previously module-private) so
// scripts/wordpress/import/migrationRevision.mjs can reuse this exact same
// bounded-retention logic for migration-sourced revisions, instead of a
// second, independently-maintained copy.
export async function pruneOldRevisions(contentType) {
  const excessIds = await ContentRevisionModel.find({ contentType })
    .sort({ version: -1 })
    .skip(MAX_REVISIONS_PER_TYPE)
    .select('_id')
    .lean();
  if (excessIds.length) {
    await ContentRevisionModel.deleteMany({ _id: { $in: excessIds.map((d) => d._id) } });
  }
}

// GET /api/v1/admin/content/types — Week 4 Decision W4-1: the authoritative
// list of content types is whatever actually exists as a Content document
// (ContentModel.distinct), not a second hardcoded list maintained in
// parallel — a type only ever appears here because upsertDraftContent
// already created it. Returns type strings only, never any `data`/
// `draftData` — this is a discovery endpoint, not a content-read endpoint.
export async function listContentTypes(req, res, next) {
  try {
    const types = await ContentModel.distinct('type');
    types.sort();
    return sendSuccess(res, types);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/content?type=pages/home — full admin view (published +
// pending draft + status), so an editor UI can load both without guessing.
export async function getAdminContent(req, res, next) {
  try {
    const type = requireType(req);
    const doc = await ContentModel.findOne({ type }).lean();
    if (!doc) {
      return sendSuccess(res, { type, status: 'draft', data: null, draftData: null, exists: false });
    }
    return sendSuccess(res, { ...doc, exists: true });
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/admin/content — body { type, data }. Upserts the DRAFT only —
// never touches the live published `data`, so editing never affects what the
// public API serves until an explicit publish (CMS-002: draft must not leak).
export async function upsertDraftContent(req, res, next) {
  try {
    const type = requireType(req);
    let { data } = req.body || {};
    if (data === undefined || data === null || typeof data !== 'object') {
      throw new ApiError(422, 'VALIDATION_ERROR', 'data (an object) is required.', { data: 'Required.' });
    }
    if (LEGAL_BODY_TYPES.has(type) && typeof data.BODY === 'string') {
      data = { ...data, BODY: sanitizeLegalBody(data.BODY) };
    }
    if (type === JOIN_US_TYPE) {
      const validationError = validateJoinUsContent(data);
      if (validationError) throw new ApiError(422, 'VALIDATION_ERROR', validationError);
    }

    const doc = await ContentModel.findOneAndUpdate(
      { type },
      { $set: { draftData: data }, $setOnInsert: { type, status: 'draft', data: null } },
      { upsert: true, new: true }
    );

    await recordAudit({ actor: actorOf(req), action: 'content.draft_saved', targetType: 'Content', targetId: type, req });
    return sendSuccess(res, doc);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/content/preview?type=... — what publishing right now
// would make public: the pending draft if one exists, else the live data.
export async function previewContent(req, res, next) {
  try {
    const type = requireType(req);
    const doc = await ContentModel.findOne({ type }).lean();
    if (!doc) throw new ApiError(404, 'CONTENT_NOT_FOUND', `No content record for type "${type}".`);

    const hasDraft = doc.draftData != null;
    return sendSuccess(res, { type, previewing: hasDraft ? 'draft' : 'published', data: hasDraft ? doc.draftData : doc.data });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/admin/content/publish — body { type }. Moves draftData -> the
// live `data`, flips status to 'published', and snapshots a bounded revision
// row (separate collection, see contentRevision.model.js — not an array on
// this document).
export async function publishContent(req, res, next) {
  try {
    const type = requireType(req);
    const doc = await ContentModel.findOne({ type });
    if (!doc) throw new ApiError(404, 'CONTENT_NOT_FOUND', `No content record for type "${type}".`);
    if (doc.draftData == null && doc.data == null) {
      throw new ApiError(400, 'NOTHING_TO_PUBLISH', 'There is no draft or existing data to publish.');
    }

    const nextData = doc.draftData != null ? doc.draftData : doc.data;

    if (type === JOIN_US_TYPE) {
      // Validates whichever value is ACTUALLY about to go live -- the
      // pending draft if one exists, else the already-published data being
      // re-promoted with no new edits (the same fallback publishContent
      // itself already uses for `nextData`). This catches both a draft
      // saved before this validation existed and a currently-published
      // document that predates it, in addition to the ordinary case of a
      // draft that was already rejected at save time.
      const validationError = validateJoinUsContent(nextData);
      if (validationError) throw new ApiError(422, 'VALIDATION_ERROR', validationError);
    }

    const lastRevision = await ContentRevisionModel.findOne({ contentType: type }).sort({ version: -1 }).lean();
    const nextVersion = (lastRevision?.version || 0) + 1;

    doc.data = nextData;
    doc.draftData = null;
    doc.status = 'published';
    await doc.save();

    await ContentRevisionModel.create({
      contentType: type,
      version: nextVersion,
      data: nextData,
      action: 'publish',
      publishedBy: req.user.id,
      publishedByEmail: req.user.email,
    });
    await pruneOldRevisions(type);

    await recordAudit({ actor: actorOf(req), action: 'content.published', targetType: 'Content', targetId: type, details: { version: nextVersion }, req });
    return sendSuccess(res, doc);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/admin/content/unpublish — body { type }. Hides the type from
// the public API (status: 'draft') without discarding `data` — a later
// publish (with no new draft edits) simply re-shows the same data.
export async function unpublishContent(req, res, next) {
  try {
    const type = requireType(req);
    const doc = await ContentModel.findOne({ type });
    if (!doc) throw new ApiError(404, 'CONTENT_NOT_FOUND', `No content record for type "${type}".`);

    doc.status = 'draft';
    await doc.save();

    await recordAudit({ actor: actorOf(req), action: 'content.unpublished', targetType: 'Content', targetId: type, req });
    return sendSuccess(res, doc);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/content/revisions?type=... — bounded history (at most
// MAX_REVISIONS_PER_TYPE rows exist per type by construction).
export async function listRevisions(req, res, next) {
  try {
    const type = requireType(req);
    const revisions = await ContentRevisionModel.find({ contentType: type }).sort({ version: -1 }).lean();
    return sendSuccess(res, revisions);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/admin/content/revisions/restore — body { type, revisionId }.
// Re-publishes a past revision's snapshot as the new live data. This itself
// creates a NEW revision (action: 'restore') rather than rewriting history,
// so the revision log stays an honest append-only account of what went live
// and when.
export async function restoreRevision(req, res, next) {
  try {
    const type = requireType(req);
    const { revisionId } = req.body || {};
    if (!revisionId) throw new ApiError(422, 'VALIDATION_ERROR', 'revisionId is required.', { revisionId: 'Required.' });

    const revision = await ContentRevisionModel.findOne({ _id: revisionId, contentType: type }).lean();
    if (!revision) throw new ApiError(404, 'REVISION_NOT_FOUND', 'No matching revision for this type.');

    const doc = await ContentModel.findOne({ type });
    if (!doc) throw new ApiError(404, 'CONTENT_NOT_FOUND', `No content record for type "${type}".`);

    // Closes the one remaining path that could make pages/join-us content
    // public without going through the draft-save/publish validation above:
    // an OLD revision snapshot, taken before this validation existed, could
    // otherwise be restored (re-published) with no check at all. Validates
    // the exact revision.data that is about to become the new live `doc.data`
    // -- after the existence checks above, but before any mutation, save,
    // new revision row, or audit write, so a rejected restore leaves
    // everything (current doc, draft, status, revision history, audit log)
    // completely untouched. Never attempts to repair/modify the historical
    // revision record itself -- an invalid old revision simply cannot be
    // restored, exactly like an invalid draft cannot be published.
    if (type === JOIN_US_TYPE) {
      const validationError = validateJoinUsContent(revision.data);
      if (validationError) throw new ApiError(422, 'VALIDATION_ERROR', validationError);
    }

    const lastRevision = await ContentRevisionModel.findOne({ contentType: type }).sort({ version: -1 }).lean();
    const nextVersion = (lastRevision?.version || 0) + 1;

    doc.data = revision.data;
    doc.draftData = null;
    doc.status = 'published';
    await doc.save();

    await ContentRevisionModel.create({
      contentType: type,
      version: nextVersion,
      data: revision.data,
      action: 'restore',
      publishedBy: req.user.id,
      publishedByEmail: req.user.email,
      details: { restoredFromRevisionId: String(revision._id), restoredFromVersion: revision.version },
    });
    await pruneOldRevisions(type);

    await recordAudit({
      actor: actorOf(req),
      action: 'content.restored',
      targetType: 'Content',
      targetId: type,
      details: { restoredFromVersion: revision.version, newVersion: nextVersion },
      req,
    });
    return sendSuccess(res, doc);
  } catch (err) {
    next(err);
  }
}
