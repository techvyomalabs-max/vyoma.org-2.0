import { SiteSettingsModel, ALLOWED_TOP_LEVEL_KEYS } from './setting.model.js';
import { sendSuccess, ApiError } from '../../utils/apiResponse.js';
import { recordAudit } from '../audit/audit.service.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_SOCIAL_KEYS = ['linkedin', 'x', 'youtube', 'instagram', 'facebook'];
const ALLOWED_BANK_KEYS = ['indiaAccountName', 'indiaBankName', 'fcraAccountName', 'fcraBankName'];

function actorOf(req) {
  return { _id: req.user.id, email: req.user.email };
}

function assertAllowedKeys(obj, allowed, label) {
  const unknown = Object.keys(obj || {}).filter((k) => !allowed.includes(k));
  if (unknown.length) {
    throw new ApiError(422, 'UNKNOWN_SETTING', `Unknown ${label} key(s): ${unknown.join(', ')}.`, {
      [label]: `Allowed keys: ${allowed.join(', ')}.`,
    });
  }
}

// GET /api/v1/admin/settings — creates the (single) settings document with
// defaults on first read if it doesn't exist yet.
export async function getSettings(req, res, next) {
  try {
    const doc = await SiteSettingsModel.findOneAndUpdate({}, {}, { upsert: true, new: true, setDefaultsOnInsert: true });
    return sendSuccess(res, doc);
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/admin/settings — body may contain only the allowlisted keys
// (ALLOWED_TOP_LEVEL_KEYS), checked explicitly here in addition to the
// schema itself — see setting.model.js.
export async function updateSettings(req, res, next) {
  try {
    const body = req.body || {};
    assertAllowedKeys(body, ALLOWED_TOP_LEVEL_KEYS, 'setting');

    const update = {};
    if (body.contactInboxEmail !== undefined) {
      if (body.contactInboxEmail !== null && (typeof body.contactInboxEmail !== 'string' || !EMAIL_RE.test(body.contactInboxEmail.trim()))) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'contactInboxEmail must be a valid email or null.');
      }
      update.contactInboxEmail = body.contactInboxEmail;
    }
    if (body.socialLinks !== undefined) {
      assertAllowedKeys(body.socialLinks, ALLOWED_SOCIAL_KEYS, 'socialLinks');
      // Dot-path $set per sub-key — a partial update (e.g. just `linkedin`)
      // merges into the existing socialLinks object instead of replacing it
      // wholesale and wiping out sibling links that weren't part of this call.
      for (const [key, value] of Object.entries(body.socialLinks)) {
        update[`socialLinks.${key}`] = value;
      }
    }
    if (body.donationBankDetails !== undefined) {
      assertAllowedKeys(body.donationBankDetails, ALLOWED_BANK_KEYS, 'donationBankDetails');
      for (const [key, value] of Object.entries(body.donationBankDetails)) {
        update[`donationBankDetails.${key}`] = value;
      }
    }
    if (body.maintenanceMode !== undefined) {
      if (typeof body.maintenanceMode !== 'boolean') {
        throw new ApiError(422, 'VALIDATION_ERROR', 'maintenanceMode must be a boolean.');
      }
      update.maintenanceMode = body.maintenanceMode;
    }

    if (Object.keys(update).length === 0) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Provide at least one setting to update.');
    }

    const doc = await SiteSettingsModel.findOneAndUpdate({}, { $set: update }, { upsert: true, new: true, setDefaultsOnInsert: true });

    await recordAudit({ actor: actorOf(req), action: 'settings.updated', targetType: 'SiteSettings', details: { keys: Object.keys(update) }, req });
    return sendSuccess(res, doc);
  } catch (err) {
    next(err);
  }
}
