import mongoose from 'mongoose';

// LLD Section 6/7: contentItems, generalized here as one flexible
// per-`type` document (HLD's own rationale for choosing MongoDB: "flexible
// content... data model"). `data` mirrors whatever shape the corresponding
// Frontend/lib/mockData/*.js module used to export, so the frontend needs no
// per-page changes when it switches from mock data to this API.
const contentSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, unique: true, index: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

export const ContentModel = mongoose.model('Content', contentSchema);
