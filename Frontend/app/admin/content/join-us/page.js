'use client';

import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { ContentEditorShell } from '@/components/admin/cms/ContentEditorShell';
import { SeoForm } from '@/components/admin/cms/SeoForm';
import { SimpleRepeatableForm } from '@/components/admin/ui/SimpleRepeatableForm';
import { SimpleTextListForm } from '@/components/admin/ui/SimpleTextListForm';
import { RepeatableList } from '@/components/admin/ui/RepeatableList';

const TYPE = 'pages/join-us';
const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';

function TracksForm({ value, onChange }) {
  return (
    <SimpleRepeatableForm
      value={value}
      onChange={onChange}
      labelKey="title"
      newItemTemplate={{ title: '', href: '', body: '', active: true }}
      fields={[
        { key: 'title', type: 'text', label: 'Title' },
        { key: 'href', type: 'text', label: 'Path (e.g. /join-us/volunteer)' },
        { key: 'body', type: 'textarea', label: 'Description' },
      ]}
    />
  );
}

function VolunteerCategoriesForm({ value, onChange }) {
  return (
    <RepeatableList
      items={value}
      onChange={onChange}
      newItemTemplate={{ title: 'New category', items: [], active: true }}
      itemLabel={(item) => item.title || 'New category'}
      renderItem={(cat, onCatChange) => (
        <div className="space-y-2">
          <input
            type="text"
            value={cat.title}
            onChange={(e) => onCatChange({ ...cat, title: e.target.value })}
            placeholder="Category title"
            className={inputClass}
          />
          <SimpleTextListForm value={cat.items} onChange={(items) => onCatChange({ ...cat, items })} placeholder="Way to help" />
        </div>
      )}
    />
  );
}

function VolunteerFeaturedForm({ value, onChange }) {
  return (
    <SimpleRepeatableForm
      value={value}
      onChange={onChange}
      labelKey="name"
      newItemTemplate={{ name: '', note: '', image: null, active: true }}
      fields={[
        { key: 'name', type: 'text', label: 'Name' },
        { key: 'note', type: 'textarea', label: 'Note' },
        { key: 'image', type: 'image', label: 'Photo' },
      ]}
    />
  );
}

function InternshipReasonsForm({ value, onChange }) {
  return <SimpleTextListForm value={value} onChange={onChange} placeholder="Reason to intern at Vyoma" />;
}

// Role and Skill are both mandatory (see validateJoinUs below) -- marked as
// such via an explicit placeholder (SimpleRepeatableForm's own text-field
// rendering falls back to `label` only when no `placeholder` is given, so
// this is the existing UI convention available without touching that
// shared component) rather than relying on the browser's native HTML
// `required` attribute, which SimpleRepeatableForm's inputs don't set and
// which wouldn't apply per-opening-in-a-list the way validateJoinUs does.
function InternshipOpeningsForm({ value, onChange }) {
  return (
    <SimpleRepeatableForm
      value={value}
      onChange={onChange}
      labelKey="role"
      newItemTemplate={{ role: '', skill: '', active: true }}
      fields={[
        { key: 'role', type: 'text', label: 'Role', placeholder: 'Role (required)' },
        { key: 'skill', type: 'text', label: 'Skill required', placeholder: 'Skill (required)' },
      ]}
    />
  );
}

function CsrProjectsForm({ value, onChange }) {
  return (
    <SimpleRepeatableForm
      value={value}
      onChange={onChange}
      labelKey="name"
      newItemTemplate={{ name: '', category: '', cost: '', body: '', active: true }}
      fields={[
        { key: 'name', type: 'text', label: 'Project name' },
        { key: 'category', type: 'text', label: 'Category' },
        { key: 'cost', type: 'text', label: 'Cost' },
        { key: 'body', type: 'textarea', label: 'Description' },
      ]}
    />
  );
}

function CareerRolesForm({ value, onChange }) {
  return (
    <SimpleRepeatableForm
      value={value}
      onChange={onChange}
      labelKey="title"
      newItemTemplate={{ title: '', dept: '', type: 'Full-time', loc: 'Bengaluru', desc: null, applyUrl: null, active: true }}
      fields={[
        { key: 'title', type: 'text', label: 'Role title' },
        { key: 'dept', type: 'text', label: 'Department' },
        { key: 'type', type: 'text', label: 'Employment type' },
        { key: 'loc', type: 'text', label: 'Location' },
        { key: 'desc', type: 'textarea', label: 'Description (optional)' },
        { key: 'applyUrl', type: 'text', label: 'Apply URL (optional)', placeholder: 'https://… — leave blank to use the contact fallback' },
      ]}
    />
  );
}

// Batch 3: only enforced on save/publish, not per-keystroke — blank/null is
// always valid (no destination yet is the expected default), and a non-blank
// value must be a safe http(s) URL so CareersBoard.jsx can never be handed
// a javascript:/data: URL or similar.
const APPLY_URL_RE = /^https?:\/\/.+/i;

// A required text field is valid only if it's a genuine, non-blank string
// after trim() -- rejects missing/null/empty/whitespace-only values AND any
// non-string value (a number, boolean, object, array) that could only ever
// reach here via a direct API write or malformed import, never the admin
// UI's own text input.
function isBlankRequiredField(value) {
  return typeof value !== 'string' || value.trim().length === 0;
}

function validateJoinUs(data) {
  const roles = data?.CAREER_ROLES || [];
  for (const r of roles) {
    const url = (r.applyUrl || '').trim();
    if (url && !APPLY_URL_RE.test(url)) {
      return `Apply URL for "${r.title || 'a role'}" must start with http:// or https:// (or be left blank).`;
    }
  }
  const volunteerUrl = (data?.VOLUNTEER_APPLY_URL || '').trim();
  if (volunteerUrl && !APPLY_URL_RE.test(volunteerUrl)) {
    return 'Volunteer Apply URL must start with http:// or https:// (or be left blank).';
  }

  // Internship Role/Skill required validation -- deliberately mirrors
  // Backend/src/modules/content/content.admin.controller.js's own
  // validateJoinUsContent() exactly (same acceptance/rejection rules, same
  // wording) so a direct API request can never accept something the admin
  // UI would have rejected, or vice versa. `undefined` (the key entirely
  // absent from `data`) is the only tolerated non-array shape -- required
  // for compatibility with content saved before this field, or this
  // validation, existed. Anything else that isn't a real array (explicit
  // null, a string, a number, a boolean, a plain object) is an outright
  // rejection, not silently treated as "no openings" -- invalid data must
  // never be ignored, removed or normalized away. Likewise, a malformed
  // individual entry (null, a string, a number, a boolean, or an array,
  // rather than a plain opening object) is rejected by its own one-based
  // position, not quietly coerced into "both fields missing". Every
  // opening is checked regardless of its own `active` ("Visible") flag --
  // an inactive opening isn't shown on the public page today, but it can
  // be flipped visible later with no further edit, so invalid content must
  // never be allowed into the array at all. Returns the FIRST invalid
  // opening only (same convention as the CAREER_ROLES check above).
  const openingsRaw = data?.INTERNSHIP_OPENINGS;
  if (openingsRaw !== undefined) {
    if (!Array.isArray(openingsRaw)) {
      return 'INTERNSHIP_OPENINGS must be an array of internship openings.';
    }
    for (let i = 0; i < openingsRaw.length; i += 1) {
      const opening = openingsRaw[i];
      if (opening === null || typeof opening !== 'object' || Array.isArray(opening)) {
        return `Internship opening ${i + 1} is malformed.`;
      }
      const roleMissing = isBlankRequiredField(opening.role);
      const skillMissing = isBlankRequiredField(opening.skill);
      if (roleMissing && skillMissing) return `Internship opening ${i + 1}: Role and Skill are required.`;
      if (roleMissing) return `Internship opening ${i + 1}: Role is required.`;
      if (skillMissing) return `Internship opening ${i + 1}: Skill is required.`;
    }
  }

  return null;
}

// Singleton field, not a repeatable list — see VOLUNTEER_APPLY_URL's own
// comment in seedData/joinUs.js for why this isn't per-category.
function VolunteerApplyUrlForm({ value, onChange }) {
  return (
    <div>
      <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Volunteer Apply URL (optional)</label>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https:// — leave blank to use the contact fallback"
        className={inputClass}
      />
    </div>
  );
}

function CareerStepsForm({ value, onChange }) {
  return (
    <SimpleRepeatableForm
      value={value}
      onChange={onChange}
      labelKey="t"
      newItemTemplate={{ n: '', t: '', d: '', active: true }}
      fields={[
        { key: 'n', type: 'text', label: 'Step number' },
        { key: 't', type: 'text', label: 'Step title' },
        { key: 'd', type: 'textarea', label: 'Description' },
      ]}
    />
  );
}

const SECTIONS = [
  { key: 'TRACKS', label: 'Tracks', description: 'The 5 cards on the Join Us landing page.', publicPath: '/join-us', Form: TracksForm },
  { key: 'VOLUNTEER_CATEGORIES', label: 'Volunteer: Categories', description: '"Where you can help" categories.', publicPath: '/join-us/volunteer', Form: VolunteerCategoriesForm },
  { key: 'VOLUNTEER_FEATURED', label: 'Volunteer: Featured', description: 'Featured volunteer profiles.', publicPath: '/join-us/volunteer', Form: VolunteerFeaturedForm },
  { key: 'VOLUNTEER_APPLY_URL', label: 'Volunteer: Apply URL', description: 'External application form link for the "Become a Volunteer" button. Leave blank to use the contact form fallback.', publicPath: '/join-us/volunteer', Form: VolunteerApplyUrlForm },
  { key: 'INTERNSHIP_REASONS', label: 'Internship: Reasons', description: '"Why intern at Vyoma?" list.', publicPath: '/join-us/internship', Form: InternshipReasonsForm },
  { key: 'INTERNSHIP_OPENINGS', label: 'Internship: Openings', description: 'Current internship openings (empty by default).', publicPath: '/join-us/internship', Form: InternshipOpeningsForm },
  { key: 'CSR_PROJECTS', label: 'CSR: Projects', description: 'The CSR project cards.', publicPath: '/join-us/csr-projects', Form: CsrProjectsForm },
  { key: 'CAREER_ROLES', label: 'Careers: Roles', description: 'Open roles.', publicPath: '/join-us/careers', Form: CareerRolesForm },
  { key: 'CAREER_STEPS', label: 'Careers: Hiring steps', description: '"How we hire" steps.', publicPath: '/join-us/careers', Form: CareerStepsForm },
  { key: 'SEO', label: 'SEO', description: 'Title, meta description, canonical, social image.', publicPath: '/join-us', Form: SeoForm },
];

function JoinUsCmsContent() {
  return <ContentEditorShell pageLabel="Join Us" type={TYPE} sections={SECTIONS} validate={validateJoinUs} />;
}

export default function JoinUsCmsPage() {
  return (
    <RequireAdminAuth>
      <JoinUsCmsContent />
    </RequireAdminAuth>
  );
}
