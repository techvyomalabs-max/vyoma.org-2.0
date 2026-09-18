'use client';

import { useState } from 'react';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';

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
export function CSRProjectsBoard({ projects }) {
  const [selected, setSelected] = useState('');

  const pick = (name) => {
    setSelected(name);
    document.getElementById('csr-enquiry-form')?.scrollIntoView({ behavior: 'smooth' });
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
          <form
            onSubmit={(e) => e.preventDefault()}
            className="flex flex-col gap-3.5 rounded-md bg-white px-6 py-7"
          >
            <input
              placeholder="Name"
              className="rounded-sm border border-[var(--border-subtle)] px-3.5 py-3 font-sans text-[15px]"
            />
            <input
              placeholder="Email"
              type="email"
              className="rounded-sm border border-[var(--border-subtle)] px-3.5 py-3 font-sans text-[15px]"
            />
            <input
              placeholder="Organisation Name"
              className="rounded-sm border border-[var(--border-subtle)] px-3.5 py-3 font-sans text-[15px]"
            />
            <input
              placeholder="Mobile Number"
              className="rounded-sm border border-[var(--border-subtle)] px-3.5 py-3 font-sans text-[15px]"
            />
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="rounded-sm border border-[var(--border-subtle)] px-3.5 py-3 font-sans text-[15px] text-charcoal"
            >
              <option value="">Project of interest</option>
              <option>{FLAGSHIP_NAME}</option>
              {projects.map((p) => (
                <option key={p.name}>{p.name}</option>
              ))}
            </select>
            <textarea
              placeholder="Comment / Message"
              rows={4}
              className="resize-y rounded-sm border border-[var(--border-subtle)] px-3.5 py-3 font-sans text-[15px]"
            />
            <Button variant="solid" type="submit">
              Submit
            </Button>
          </form>
        </div>
      </section>
    </>
  );
}
