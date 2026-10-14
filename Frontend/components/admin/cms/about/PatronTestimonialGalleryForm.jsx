'use client';
import { SimpleRepeatableForm } from '@/components/admin/ui/SimpleRepeatableForm';

const FIELDS = [{ key: 'image', type: 'image', label: 'Photo' }];

// Replaces the old PATRON_TESTIMONIALS (fabricated name/location/quote
// placeholders) — the real "What our Patrons have to say" section on the
// live site is a photo gallery of real donor testimonials, not text
// quotes (see Batch 5). Each item is just one photo.
export function PatronTestimonialGalleryForm({ value, onChange }) {
  return (
    <SimpleRepeatableForm
      value={value}
      onChange={onChange}
      fields={FIELDS}
      newItemTemplate={{ image: null, active: true }}
    />
  );
}
