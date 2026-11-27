import mongoose from 'mongoose';

// QA Bug 7 Stage C: a dedicated, standalone collection for persistently-
// stored background-removal results -- exists specifically so a processed
// image can survive a Render redeploy/restart without requiring AWS S3 to
// be configured. localDev.storageAdapter.js's own history (Task 7T.3)
// already confirmed Render's filesystem is ephemeral and that adapter's
// URL is hardcoded to localhost, meaningless to any real visitor -- this
// collection has neither problem: MongoDB Atlas already survives restarts/
// redeploys (it's the system of record for every other feature in this
// app), and its documents are served back through this server's own real,
// externally-reachable URL (see processedImage.routes.js).
//
// Completely separate from every other model in this app -- nothing here
// is ever read or written by any other module, and nothing this model
// does ever touches PhotoProcessingJobModel, MediaModel, or ContentModel.
// `data` stores raw PNG bytes directly as a Buffer (BSON binary), never a
// base64 string -- base64 would inflate size by roughly a third against
// MongoDB's 16MB per-document limit for no benefit, since nothing here
// ever needs to embed this inside a JSON document; it is only ever read
// back as raw bytes (see processedImage.routes.js's getProcessedImagePublic).
const processedImageSchema = new mongoose.Schema(
  {
    data: { type: Buffer, required: true },
    mimeType: { type: String, required: true, default: 'image/png' },
    byteLength: { type: Number, required: true },
    // Which job produced this -- traceability only; never joined against
    // or exposed by the public read endpoint (see processedImage.routes.js's
    // own `.select('data mimeType')`).
    sourceJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'PhotoProcessingJob', required: true },
  },
  { timestamps: true }
);

export const ProcessedImageModel = mongoose.model('ProcessedImage', processedImageSchema);
