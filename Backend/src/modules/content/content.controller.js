import { ContentModel } from './content.model.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/apiResponse.js';

// GET /api/v1/public/:type — LLD 7.2. `:type` can contain a slash (e.g.
// "pages/home"), so the route is registered on a wildcard and the full
// remainder is reassembled here.
export async function getPublicContentByType(req, res, next) {
  try {
    const type = req.params[0];
    const doc = await ContentModel.findOne({ type }).lean();
    if (!doc) {
      throw new ApiError(404, 'CONTENT_NOT_FOUND', `No published content for type "${type}"`);
    }
    return sendSuccess(res, doc.data);
  } catch (err) {
    next(err);
  }
}
