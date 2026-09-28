import mongoose from 'mongoose';

// Metadata only — the actual bytes live in S3 (see s3.adapter.js). `storageKey`
// is the S3 object key; `url` is filled in once a real upload succeeds (null
// until AWS credentials exist, since there is nothing to point to yet).
const mediaSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    kind: { type: String, enum: ['image', 'pdf', 'document', 'other'], required: true },
    storageKey: { type: String, required: true, unique: true },
    url: { type: String, default: null },
    altText: { type: String, default: '' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedByEmail: { type: String, required: true },
  },
  { timestamps: true }
);

export const MediaModel = mongoose.model('Media', mediaSchema);
