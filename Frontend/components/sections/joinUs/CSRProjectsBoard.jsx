'use client';

import { useState } from 'react';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';
import { submitForm } from '@/services/formService';

const FLAGSHIP_NAME = 'SSS Experience Center – Vyoma HQ';

function CSRProjectCard({ p, onPick }) {
  return (
    <div className="rounded-md border border-[var(--border-subtle)] border-t-[3px] border-t-amber-gold bg-white px-5 py-[22px] transition-all duration-[var(--duration-normal)] ease-[var(--ease-standard)] hover:-translate-y-1 hover:shadow-md">
      <Badge tone="teal">{p.category}</Badge>
      <h4 className="my-3 font-sans text-lg font-bold text-vyoma-blue">{p.name}</h4>
      <div className="mb-2.5 font-sans text-[15px] font-bold text-charcoal">{p.cost}</div>
      <p className="mb-4 font-sans text-[15px] leading-normal text-charcoal">{p.body}</p>
      <Button variant="outline" size="sm" onClick={() => onPick(p.name)}>
        Partner on this
      </Button>
    </div>
  );
}

// Holds the shared `selected` state for the flagship banner, the CSR_PROJECTS
// grid, and the enquiry form below, since picking any "Partner on this" button
// (flagship or grid card) must update the form's select and scroll it into view.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Unicode letters (any language/script) plus spaces, apostrophes (straight
// or curly), and hyphens — must start with a letter. Deliberately excludes
// digits and other punctuation.
const NAME_RE = /^\p{L}[\p{L}\s'’-]*$/u;
const COMMENT_MAX_LENGTH = 2000;

// QA Bug 18 — Mobile Number. Mirrors the backend's identical check
// (forms.controller.js's isValidMobileNumber) so the two never drift.
//
// MOBILE_INPUT_ALLOWED_RE gates what can ever be typed or pasted into the
// field at all, AND doubles as isValidMobileNumber's own first-stage
// shape check below (one definition, so the two can never disagree on
// this part): an optional SINGLE leading +, then only digits, spaces,
// hyphens and parentheses -- nothing else, so letters/emoji/control
// characters can never enter the value, and a second or interior + is
// rejected at the moment it would be typed or pasted, not only at submit
// time. It is still deliberately looser than full structural correctness
// (it does not check parenthesis balance/content, leading/trailing
// hyphens, or digit count) -- those remain submit-time-only, enforced by
// isValidMobileNumber, both so an incomplete in-progress number (e.g.
// "+91", "(", "(5") can still be typed naturally, and so the submit-time
// validator still independently re-checks the whole value even if the
// live input gate were ever bypassed.
const MOBILE_INPUT_ALLOWED_RE = /^\+?[0-9()\- ]*$/;

// Full structural check, used only at submit time (validate()). Accepts
// digits with common international formatting and nothing else: an
// optional SINGLE leading + immediately followed by a digit, no + or
// hyphen leading/trailing the value, balanced non-nested parentheses that
// each contain at least one digit (never empty or separator-only), and
// (after stripping all formatting) between 7 and 15 digits -- an
// application-specific basic format rule, not an official universal
// E.164 minimum, chosen because Vyoma serves international
// donors/partners and must not assume one country's fixed length. This is
// a format check only; it does not claim the number is assigned,
// reachable, or valid under any specific national numbering plan.
function isValidMobileNumber(raw) {
  if (typeof raw !== 'string') return false;
  // Strips only surrounding ORDINARY spaces (ASCII U+0020) -- a tab,
  // newline, or any other whitespace character is never stripped, even
  // at the very start/end, so it still fails the character-class check
  // below like any other unsupported character. (The separate "is this
  // empty/whitespace-only" required-field check in validate() uses a
  // normal .trim() and runs before this function is ever called, so an
  // all-whitespace value never reaches here in the first place.)
  const value = raw.replace(/^ +| +$/g, '');
  if (!value) return false;
  if (value.startsWith('-') || value.endsWith('-')) return false;
  if (!MOBILE_INPUT_ALLOWED_RE.test(value)) return false;
  if (value[0] === '+' && !/[0-9]/.test(value[1] || '')) return false;

  let depth = 0;
  let parenHasDigit = false;
  for (const ch of value) {
    if (ch === '(') {
      depth += 1;
      if (depth > 1) return false;
      parenHasDigit = false;
    } else if (ch === ')') {
      if (depth === 0) return false;
      if (!parenHasDigit) return false;
      depth -= 1;
    } else if (depth === 1 && /[0-9]/.test(ch)) {
      parenHasDigit = true;
    }
  }
  if (depth !== 0) return false;

  const digitCount = (value.match(/[0-9]/g) || []).length;
  return digitCount >= 7 && digitCount <= 15;
}

export function CSRProjectsBoard({ projects: projectsInput }) {
  const projects = projectsInput.filter((p) => p.active !== false);
  const [selected, setSelected] = useState('');
  const [fields, setFields] = useState({ name: '', email: '', organisation: '', mobile: '', comment: '' });
  const [status, setStatus] = useState('idle'); // 'idle' | 'submitting' | 'sent' | 'error'
  const [fieldErrors, setFieldErrors] = useState({});
  // QA Bug 18: true from the moment an invalid mobile change (typed or
  // pasted) is rejected, until the user either fully corrects it (a
  // value that itself passes isValidMobileNumber) or clears the field
  // back to empty. While true, validate() refuses to submit even though
  // the RETAINED mobile value (the last accepted one, from before the
  // rejection) may itself still be a perfectly valid number -- an
  // unresolved rejected input must never be silently waved through just
  // because the field's current contents happen to format-check.
  const [mobileRejected, setMobileRejected] = useState(false);

  // QA Bug 4 fix: validation errors were only ever set in handleSubmit and
  // never cleared when the CSR option changed -- every error from a prior
  // submit attempt (not just the "project of interest" one) stayed visible
  // after switching, even though the form hadn't been resubmitted yet. Only
  // clear on an actual change (not a re-pick of the same option already
  // selected), and never touch `fields`, so user-entered values survive.
  const pick = (name) => {
    if (name !== selected) setFieldErrors({});
    setSelected(name);
    document.getElementById('csr-enquiry-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const setField = (key) => (e) => setFields((f) => ({ ...f, [key]: e.target.value }));

  // Mobile Number needs stricter live-input handling than the generic
  // setField -- letters/emoji/unsupported punctuation must never be
  // accepted into the value at all, whether typed one key at a time or
  // pasted/dropped/autofilled in bulk (this runs on every change to the
  // controlled input, so it covers all of those the same way -- no
  // separate onPaste/onKeyDown handler is needed). A rejected change is
  // never partially applied: on any disallowed character, the whole
  // change is discarded (the field snaps back to its last accepted
  // value, via a fresh object reference so React actually re-renders and
  // the DOM reflects it) rather than silently stripping out the bad
  // characters -- e.g. a pasted "98765abc43210" must not quietly become
  // the shorter, valid-looking "9876543210".
  //
  // A rejection also sets mobileRejected, which validate() checks first
  // and independently of the retained value's own format -- this is what
  // actually blocks a Submit click immediately after a rejected paste,
  // not just the inline message (QA Bug 18 follow-up). It is resolved
  // (cleared) only when a later change is either the field cleared back
  // to empty, or a value that is itself fully valid per
  // isValidMobileNumber -- an allowed-but-still-incomplete in-progress
  // value (e.g. "123", which passes the loose character gate but is too
  // short) deliberately does NOT resolve it, so an incomplete correction
  // can never quietly re-open the door to submission either.
  const setMobile = (e) => {
    const next = e.target.value;
    if (!MOBILE_INPUT_ALLOWED_RE.test(next)) {
      setFieldErrors((prev) => ({ ...prev, mobile: 'Enter a valid mobile number.' }));
      setMobileRejected(true);
      setFields((f) => ({ ...f }));
      return;
    }
    setFields((f) => ({ ...f, mobile: next }));
    if (next === '' || isValidMobileNumber(next)) {
      setMobileRejected(false);
      setFieldErrors((prev) => {
        const { mobile, ...rest } = prev;
        return rest;
      });
    }
  };

  // Validates every field at once (not one-at-a-time, which is all the
  // browser's native `required` popups show) and returns all the errors
  // found, so they can all be displayed together after a single submit.
  const validate = () => {
    const errors = {};
    const name = fields.name.trim();
    if (!name) errors.name = 'Name is required.';
    else if (!NAME_RE.test(name)) errors.name = 'Please enter a valid name without numbers or special characters.';
    if (!fields.email.trim()) errors.email = 'Email is required.';
    else if (!EMAIL_RE.test(fields.email.trim())) errors.email = 'Enter a valid email address.';
    if (!fields.organisation.trim()) errors.organisation = 'Organisation name is required.';
    // mobileRejected (an unresolved rejected paste/type) is checked FIRST
    // and unconditionally -- it must block submission even if the
    // retained fields.mobile value itself already passes
    // isValidMobileNumber, so a rejected invalid attempt can never be
    // silently waved through just because the field still holds an
    // earlier, still-valid number (QA Bug 18 follow-up).
    if (mobileRejected) errors.mobile = 'Enter a valid mobile number.';
    else if (!fields.mobile.trim()) errors.mobile = 'Mobile number is required.';
    else if (!isValidMobileNumber(fields.mobile)) errors.mobile = 'Enter a valid mobile number.';
    if (!selected) errors.selected = 'Please choose a project of interest.';
    if (!fields.comment.trim()) errors.comment = 'Please add a comment or message.';
    else if (fields.comment.length > COMMENT_MAX_LENGTH) errors.comment = `Comment must be ${COMMENT_MAX_LENGTH} characters or fewer.`;
    return errors;
  };

  // Reuses the existing generic forms backend (Backend/src/modules/forms —
  // any formKey is accepted, no new module) with a dedicated key rather than
  // folding this into the generic 'contact' form, since it captures fields
  // (organisation, mobile, project of interest) that form doesn't.
  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setStatus('submitting');
    try {
      // The generic forms backend validates every submission against a
      // shared {name, email, message} requirement (forms.controller.js) —
      // this form's "Comment / Message" field maps to `message` so it
      // satisfies that check; `comment` alone would 422.
      await submitForm('csr-enquiry', {
        values: { ...fields, name: fields.name.trim(), message: fields.comment, projectOfInterest: selected },
        sourceUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      });
      setStatus('sent');
      setFields({ name: '', email: '', organisation: '', mobile: '', comment: '' });
      setSelected('');
      setMobileRejected(false);
    } catch {
      setStatus('error');
    }
  };

  return (
    <>
      <section className="bg-white px-8 pt-8">
        <div className="mx-auto grid max-w-[1100px] items-center gap-6 rounded-md bg-sky-mist px-7 py-8 sm:grid-cols-2">
          <div>
            <Badge tone="teal">Building Infrastructure / CAPEX</Badge>
            <h3 className="mt-3.5 mb-1.5 font-sans text-2xl font-bold text-vyoma-blue">{FLAGSHIP_NAME}</h3>
            <div className="mb-3 font-sans text-xl font-bold text-charcoal">₹15 Crores (excluding land)</div>
            <p className="mb-[18px] font-sans text-base leading-normal text-charcoal">
              A unique Sanskrit hub with classrooms, e-learning spaces, library, recording studio, auditorium, meeting rooms, and a research centre.
            </p>
            <Button variant="solid" onClick={() => pick(FLAGSHIP_NAME)}>
              Partner on this
            </Button>
          </div>
          <div className="h-[220px] w-full">
            <ImagePlaceholder shape="rounded" caption="Experience Center render" />
          </div>
        </div>
      </section>

      <section className="bg-white px-8 py-14">
        <div className="mx-auto grid max-w-[1100px] gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
          {projects.map((p) => (
            <CSRProjectCard key={p.name} p={p} onPick={pick} />
          ))}
        </div>
      </section>

      <section id="csr-enquiry-form" className="bg-sky-mist px-8 py-14">
        <div className="mx-auto max-w-[640px]">
          <h3 className="mb-6 text-center font-sans text-[26px] font-bold text-vyoma-blue">Partner Enquiry</h3>
          {status === 'sent' ? (
            <div className="rounded-md bg-white px-6 py-7 text-center font-sans text-[15px] text-charcoal">
              Thank you — we&apos;ve received your enquiry and will be in touch.
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3.5 rounded-md bg-white px-6 py-7">
              <div>
                <input
                  placeholder="Name"
                  aria-label="Name"
                  value={fields.name}
                  onChange={setField('name')}
                  aria-invalid={!!fieldErrors.name}
                  className="w-full rounded-sm border border-[var(--border-subtle)] px-3.5 py-3 font-sans text-[15px]"
                />
                {fieldErrors.name && <p className="mt-1 font-sans text-[13px] text-red-600">{fieldErrors.name}</p>}
              </div>
              <div>
                <input
                  placeholder="Email"
                  aria-label="Email"
                  type="email"
                  value={fields.email}
                  onChange={setField('email')}
                  aria-invalid={!!fieldErrors.email}
                  className="w-full rounded-sm border border-[var(--border-subtle)] px-3.5 py-3 font-sans text-[15px]"
                />
                {fieldErrors.email && <p className="mt-1 font-sans text-[13px] text-red-600">{fieldErrors.email}</p>}
              </div>
              <div>
                <input
                  placeholder="Organisation Name"
                  aria-label="Organisation Name"
                  value={fields.organisation}
                  onChange={setField('organisation')}
                  aria-invalid={!!fieldErrors.organisation}
                  className="w-full rounded-sm border border-[var(--border-subtle)] px-3.5 py-3 font-sans text-[15px]"
                />
                {fieldErrors.organisation && <p className="mt-1 font-sans text-[13px] text-red-600">{fieldErrors.organisation}</p>}
              </div>
              <div>
                <input
                  placeholder="Mobile Number"
                  aria-label="Mobile Number"
                  type="tel"
                  inputMode="tel"
                  value={fields.mobile}
                  onChange={setMobile}
                  aria-invalid={!!fieldErrors.mobile}
                  className="w-full rounded-sm border border-[var(--border-subtle)] px-3.5 py-3 font-sans text-[15px]"
                />
                {fieldErrors.mobile && <p className="mt-1 font-sans text-[13px] text-red-600">{fieldErrors.mobile}</p>}
              </div>
              <div>
                <select
                  value={selected}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value !== selected) setFieldErrors({});
                    setSelected(value);
                  }}
                  aria-label="Project of interest"
                  aria-invalid={!!fieldErrors.selected}
                  className="w-full rounded-sm border border-[var(--border-subtle)] px-3.5 py-3 font-sans text-[15px] text-charcoal"
                >
                  <option value="">Project of interest</option>
                  <option>{FLAGSHIP_NAME}</option>
                  {projects.map((p) => (
                    <option key={p.name}>{p.name}</option>
                  ))}
                </select>
                {fieldErrors.selected && <p className="mt-1 font-sans text-[13px] text-red-600">{fieldErrors.selected}</p>}
              </div>
              <div>
                <textarea
                  placeholder="Comment / Message"
                  aria-label="Comment / Message"
                  rows={4}
                  maxLength={COMMENT_MAX_LENGTH}
                  value={fields.comment}
                  onChange={setField('comment')}
                  aria-invalid={!!fieldErrors.comment}
                  className="w-full resize-y rounded-sm border border-[var(--border-subtle)] px-3.5 py-3 font-sans text-[15px]"
                />
                <p className="mt-1 font-sans text-xs text-charcoal/60">
                  {fields.comment.length} / {COMMENT_MAX_LENGTH} characters
                </p>
                {fieldErrors.comment && <p className="mt-1 font-sans text-[13px] text-red-600">{fieldErrors.comment}</p>}
              </div>
              {status === 'error' && (
                <p className="font-sans text-sm text-red-600">Something went wrong — please try again.</p>
              )}
              <Button variant="solid" type="submit" disabled={status === 'submitting'}>
                {status === 'submitting' ? 'Sending…' : 'Submit'}
              </Button>
            </form>
          )}
        </div>
      </section>
    </>
  );
}
