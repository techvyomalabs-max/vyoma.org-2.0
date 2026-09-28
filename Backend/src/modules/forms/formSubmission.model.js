import mongoose from 'mongoose';

// LLD Section 6: formSubmissions collection.
const formSubmissionSchema = new mongoose.Schema(
  {
    formKey: { type: String, required: true, index: true },
    values: { type: mongoose.Schema.Types.Mixed, required: true },
    status: { type: String, enum: ['new', 'handled'], default: 'new' },
    sourceUrl: { type: String },
    consent: { type: mongoose.Schema.Types.Mixed },
    submittedAt: { type: Date, default: Date.now },
    handledBy: { type: String, default: null },
    notes: { type: String, default: null },
    notificationSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

formSubmissionSchema.index({ formKey: 1, submittedAt: -1 });

export const FormSubmissionModel = mongoose.model('FormSubmission', formSubmissionSchema);
