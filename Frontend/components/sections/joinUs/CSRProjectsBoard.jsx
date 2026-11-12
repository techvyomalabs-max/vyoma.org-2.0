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

export function CSRProjectsBoard({ projects: projectsInput }) {
  const projects = projectsInput.filter((p) => p.active !== false);
  const [selected, setSelected] = useState('');
  const [fields, setFields] = useState({ name: '', email: '', organisation: '', mobile: '', comment: '' });
  const [status, setStatus] = useState('idle'); // 'idle' | 'submitting' | 'sent' | 'error'
  const [fieldErrors, setFieldErrors] = useState({});

  const pick = (name) => {
    setSelected(name);
    document.getElementById('csr-enquiry-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const setField = (key) => (e) => setFields((f) => ({ ...f, [key]: e.target.value }));

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
    if (!fields.mobile.trim()) errors.mobile = 'Mobile number is required.';
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
                  value={fields.mobile}
                  onChange={setField('mobile')}
                  aria-invalid={!!fieldErrors.mobile}
                  className="w-full rounded-sm border border-[var(--border-subtle)] px-3.5 py-3 font-sans text-[15px]"
                />
                {fieldErrors.mobile && <p className="mt-1 font-sans text-[13px] text-red-600">{fieldErrors.mobile}</p>}
              </div>
              <div>
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
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
