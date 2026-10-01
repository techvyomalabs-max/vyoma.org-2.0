'use client';

import { useState } from 'react';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/forms/Modal';
import { useModal } from '@/components/layout/ModalProvider';

function chipClass(active) {
  return `rounded-pill border px-[15px] py-1.5 font-sans text-sm font-semibold ${
    active ? 'border-vyoma-blue bg-vyoma-blue text-white' : 'border-vyoma-blue/30 bg-transparent text-vyoma-blue'
  }`;
}

// Batch 3: no native Careers-apply form exists yet (resume upload needs S3,
// still blocked), so a role with an approved `applyUrl` opens it directly;
// one without falls back to the same contact-modal flow "Send an open
// application" already uses, just with a role-specific subject instead of
// inventing a new form.
function ApplyButton({ role }) {
  const { openContact } = useModal();
  if (role.applyUrl) {
    return (
      <Button variant="solid" href={role.applyUrl} target="_blank" rel="noopener noreferrer">
        Apply
      </Button>
    );
  }
  return (
    <Button variant="solid" onClick={() => openContact(`Careers: ${role.title}`)}>
      Apply
    </Button>
  );
}

// Holds the department/type filter state and the "view role" modal, since both
// filter the same CAREER_ROLES list and share the resulting `roles` derivation.
export function CareersBoard({ roles: rolesInput }) {
  const allRoles = rolesInput.filter((r) => r.active !== false);
  const depts = ['All', ...Array.from(new Set(allRoles.map((r) => r.dept)))];
  const types = ['All', ...Array.from(new Set(allRoles.map((r) => r.type)))];
  const [dept, setDept] = useState('All');
  const [type, setType] = useState('All');
  const [viewRole, setViewRole] = useState(null);

  const roles = allRoles.filter((r) => (dept === 'All' || r.dept === dept) && (type === 'All' || r.type === type));

  return (
    <>
      <section className="bg-white px-8 py-14">
        <div className="mx-auto max-w-[1000px]">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <h2 className="m-0 font-sans text-h2 font-bold text-vyoma-blue">Open roles</h2>
            <div className="font-sans text-[15px] text-charcoal/70">
              {roles.length} role{roles.length === 1 ? '' : 's'}
            </div>
          </div>

          <div className="mb-6 flex flex-wrap gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-sans text-xs font-bold uppercase tracking-wide text-charcoal/60">Department</span>
              {depts.map((d) => (
                <button key={d} onClick={() => setDept(d)} className={chipClass(dept === d)}>
                  {d}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-sans text-xs font-bold uppercase tracking-wide text-charcoal/60">Type</span>
              {types.map((t) => (
                <button key={t} onClick={() => setType(t)} className={chipClass(type === t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {roles.length === 0 ? (
            <div className="rounded-md bg-sky-mist px-6 py-12 text-center font-sans text-charcoal">
              No open roles right now — check back soon, or send an open application.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {roles.map((r) => (
                <div
                  key={r.title}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-[var(--border-subtle)] border-l-[3px] border-l-amber-gold bg-white px-[22px] py-[18px]"
                >
                  <div>
                    <div className="font-sans text-[17px] font-bold text-vyoma-blue">{r.title}</div>
                    <div className="mt-1 font-sans text-sm text-charcoal/75">
                      {r.dept} · {r.loc} · {r.type}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 gap-2.5">
                    <Button variant="outline" onClick={() => setViewRole(r)}>
                      View
                    </Button>
                    <ApplyButton role={r} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <Modal open={!!viewRole} title={viewRole?.title} onClose={() => setViewRole(null)}>
        {viewRole && (
          <div>
            <div className="mb-4 font-sans text-sm text-charcoal/75">
              {viewRole.dept} · {viewRole.loc} · {viewRole.type}
            </div>
            {viewRole.desc && <p className="mb-6 font-sans text-[15px] leading-normal text-charcoal">{viewRole.desc}</p>}
            <ApplyButton role={viewRole} />
          </div>
        )}
      </Modal>
    </>
  );
}
