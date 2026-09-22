import { UserModel } from './user.model.js';
import { RoleModel } from './role.model.js';
import { hashPassword } from './auth.service.js';
import { sendSuccess, ApiError } from '../../utils/apiResponse.js';
import { recordAudit } from '../audit/audit.service.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toSafeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    roleKey: user.roleKey,
    status: user.status,
    mfaEnabled: user.mfaEnabled,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

// GET /api/v1/admin/users — Super Admin only.
export async function listUsers(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

    const [items, total] = await Promise.all([
      UserModel.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      UserModel.countDocuments(),
    ]);

    return sendSuccess(res, items.map(toSafeUser), { meta: { page, limit, total } });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/admin/users — Super Admin only. roleKey is validated against
// the Role collection (data-driven per Phase 2 Decision D8), not a hardcoded
// enum — a future role only needs a new Role document, not a code change
// here.
export async function createUser(req, res, next) {
  try {
    const { name, email, password, roleKey } = req.body || {};
    const fieldErrors = {};

    if (!name || typeof name !== 'string' || !name.trim()) fieldErrors.name = 'Name is required.';
    if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) fieldErrors.email = 'A valid email is required.';
    if (!password || typeof password !== 'string' || password.length < 10) {
      fieldErrors.password = 'Password must be at least 10 characters.';
    }
    if (!roleKey || typeof roleKey !== 'string') fieldErrors.roleKey = 'roleKey is required.';

    if (Object.keys(fieldErrors).length) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Please check the highlighted fields.', fieldErrors);
    }

    const role = await RoleModel.findOne({ key: roleKey.toLowerCase().trim() });
    if (!role) {
      throw new ApiError(422, 'VALIDATION_ERROR', `Unknown role "${roleKey}".`, { roleKey: 'Unknown role.' });
    }

    let user;
    try {
      user = await UserModel.create({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        passwordHash: await hashPassword(password),
        roleKey: role.key,
        status: 'active',
      });
    } catch (err) {
      if (err.code === 11000) {
        throw new ApiError(409, 'EMAIL_IN_USE', 'A user with this email already exists.');
      }
      throw err;
    }

    await recordAudit({
      actor: { _id: req.user.id, email: req.user.email },
      action: 'users.created',
      targetType: 'User',
      targetId: user._id,
      details: { email: user.email, roleKey: user.roleKey },
      req,
    });
    return sendSuccess(res, toSafeUser(user), { status: 201 });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/users/:id/disable — Super Admin only. Soft-disable:
// flips status and immediately invalidates any outstanding refresh token, so
// a disabled account can't keep using an already-issued session.
export async function disableUser(req, res, next) {
  try {
    const { id } = req.params;
    if (String(id) === String(req.user.id)) {
      throw new ApiError(400, 'CANNOT_DISABLE_SELF', 'You cannot disable your own account.');
    }

    const user = await UserModel.findById(id);
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'User not found.');

    user.status = 'disabled';
    user.refreshTokenVersion += 1;
    await user.save();

    await recordAudit({
      actor: { _id: req.user.id, email: req.user.email },
      action: 'users.disabled',
      targetType: 'User',
      targetId: user._id,
      req,
    });
    return sendSuccess(res, toSafeUser(user));
  } catch (err) {
    next(err);
  }
}
