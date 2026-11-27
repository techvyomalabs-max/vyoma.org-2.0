import mongoose from 'mongoose';

// One row per "Remove Background" click. Decoupled from any specific
// Content field on purpose -- a job just knows "process this source image,
// produce a candidate result." Accepting/applying that result to a
// person's `image` field is the Frontend's job (literally the same
// onChange path as picking any other photo in ImageField), never something
// this model or its controller does on its own. Nothing here ever writes
// to ContentModel -- that's what keeps "never auto-publish" trivially true.
const photoProcessingJobSchema = new mongoose.Schema(
  {
    sourceUrl: { type: String, required: true },
    status: { type: String, enum: ['queued', 'processing', 'done', 'failed'], default: 'queued', required: true },
    resultUrl: { type: String, default: null },
    errorMessage: { type: String, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdByEmail: { type: String, required: true },
  },
  { timestamps: true }
);

export const PhotoProcessingJobModel = mongoose.model('PhotoProcessingJob', photoProcessingJobSchema);
