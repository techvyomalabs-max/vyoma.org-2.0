import { Router } from 'express';
import { listPostsPublic, getPostBySlugPublic, listCategoriesPublic } from './blog.controller.js';

// Mounted at /api/v1/public in app.js, before the generic /public/* content
// wildcard. /categories must be registered before /:slug so "categories" is
// never swallowed as a post slug.
export const blogPublicRouter = Router();

blogPublicRouter.get('/blog/categories', listCategoriesPublic);
blogPublicRouter.get('/blog/:slug', getPostBySlugPublic);
blogPublicRouter.get('/blog', listPostsPublic);
