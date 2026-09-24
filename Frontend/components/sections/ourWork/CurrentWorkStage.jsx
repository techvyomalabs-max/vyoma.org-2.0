'use client';

import { useState } from 'react';

function cwPositions(list, radiusPct) {
  return list.map((_, i) => {
    const a = ((-90 + (i * 360) / list.length) * Math.PI) / 180;
    return { left: 50 + radiusPct * Math.cos(a), top: 50 + radiusPct * Math.sin(a) };
  });
}

function SocialRow({ slugs }) {
  return (
    <div className="mt-3.5 flex justify-center gap-3">
      {slugs.map((slug) => (
        <a
          key={slug}
          href="#"
          title={slug}
          onClick={(e) => e.stopPropagation()}
          className="block h-[18px] w-[18px] bg-white"
          style={{
            WebkitMaskImage: `url(https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/${slug}.svg)`,
            maskImage: `url(https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/${slug}.svg)`,
            WebkitMaskSize: 'contain',
            maskSize: 'contain',
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
          }}
        />
      ))}
    </div>
  );
}

// Orbital diagram: precise trig-based node positioning and custom keyframe
// animations don't map cleanly to Tailwind utilities, so this section keeps
// scoped CSS (as the source did) rather than forcing it into arbitrary
// utility classes.
export function CurrentWorkStage({ platforms: allPlatforms, programmes: allProgrammes, headingLevel = 'h1' }) {
  const Heading = headingLevel;
  const [active, setActive] = useState(null);
  const platforms = allPlatforms.filter((p) => p.active !== false);
  const programmes = allProgrammes.filter((p) => p.active !== false);
  const platPos = cwPositions(platforms, 28);
  const progPos = cwPositions(programmes, 42);
  const openLink = (u) => {
    if (u && u !== '#') window.open(u, '_blank', 'noopener');
  };

  const Node = ({ it, kind, pos }) => (
    <button
      className={`cw-node ${kind}${active && active.it === it ? ' active' : ''}`}
      style={{ left: pos.left + '%', top: pos.top + '%' }}
      onMouseEnter={() => setActive({ it, kind })}
      onFocus={() => setActive({ it, kind })}
      onClick={() => openLink(it.u)}
    >
      <span className="cw-dot">{it.n}</span>
      <span className="cw-cap">{it.t}</span>
    </button>
  );

  return (
    <div className="font-sans">
      <style>{`
        @keyframes cwSpin{to{transform:translate(-50%,-50%) rotate(360deg)}}
        @keyframes cwFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
        .cw-stage{position:relative;width:min(760px,92vw);aspect-ratio:1;margin:8px auto 8px}
        .cw-ring{position:absolute;left:50%;top:50%;border-radius:50%;transform:translate(-50%,-50%);border:1.5px dashed rgba(15,98,179,.28)}
        .cw-ring.in{width:56%;height:56%;animation:cwSpin 70s linear infinite}
        .cw-ring.out{width:84%;height:84%;border-color:rgba(201,146,42,.32);animation:cwSpin 120s linear infinite reverse}
        .cw-hub{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:30%;height:30%;min-width:200px;min-height:200px;border-radius:50%;background:radial-gradient(circle at 50% 40%,var(--color-vyoma-blue) 0%,var(--color-vyoma-blue-deep) 100%);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:26px;box-shadow:0 18px 50px rgba(15,98,179,.35);z-index:5}
        .cw-hub .ey{font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;opacity:.75;margin-bottom:8px}
        .cw-hub h2{font-size:22px;font-weight:800;margin:0;line-height:1.2}
        .cw-hub .d{font-size:13.5px;line-height:1.5;margin:10px 0 0;opacity:.92}
        .cw-hub a{color:#fff;font-weight:800;font-size:13px;margin-top:12px;text-decoration:none;border-bottom:1px solid rgba(255,255,255,.6)}
        .cw-node{position:absolute;width:118px;margin-left:-59px;margin-top:-34px;text-align:center;cursor:pointer;z-index:6;background:none;border:none;padding:0}
        .cw-dot{width:60px;height:60px;border-radius:50%;margin:0 auto;background:#fff;border:2px solid var(--color-teal);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--color-teal);font-size:15px;font-family:var(--font-sans);box-shadow:0 6px 16px rgba(13,124,124,.18);transition:.2s;animation:cwFloat 6s ease-in-out infinite}
        .cw-node.prog .cw-dot{border-color:var(--color-amber-gold);color:var(--color-amber-gold);box-shadow:0 6px 16px rgba(201,146,42,.2)}
        .cw-cap{display:block;font-size:12.5px;font-weight:700;color:var(--color-vyoma-blue);margin-top:8px;line-height:1.25;font-family:var(--font-sans)}
        .cw-node:hover .cw-dot,.cw-node.active .cw-dot{transform:scale(1.18);background:var(--color-teal);color:#fff}
        .cw-node.prog:hover .cw-dot,.cw-node.prog.active .cw-dot{background:var(--color-amber-gold);color:#fff}
        .cw-fallback{display:none}
        @media(max-width:640px){.cw-stage{display:none}.cw-fallback{display:block}}
      `}</style>
      <section className="bg-gradient-to-b from-[#f4f8fc] to-sky-mist px-8 pb-10 pt-14">
        <div className="mx-auto max-w-[900px] text-center">
          <div className="mb-3 font-sans text-eyebrow font-bold uppercase tracking-eyebrow text-teal">Our Work</div>
          <Heading className="mx-auto max-w-[760px] font-sans text-h1 font-bold leading-tight text-vyoma-blue">Current Work</Heading>
          <p className="mx-auto mt-4 max-w-[680px] font-sans text-lg leading-normal text-charcoal">
            Everything Vyoma runs today, the platforms that make Sanskrit accessible to all, and the programmes
            that carry it into classrooms, homes, and communities.
          </p>
          <div className="mt-5 flex justify-center gap-5 text-[13px] font-bold">
            <span className="inline-flex items-center gap-2 uppercase tracking-[0.08em] text-charcoal">
              <i className="h-3 w-3 rounded-full bg-teal" />
              Platforms
            </span>
            <span className="inline-flex items-center gap-2 uppercase tracking-[0.08em] text-charcoal">
              <i className="h-3 w-3 rounded-full bg-amber-gold" />
              Programmes
            </span>
          </div>
        </div>
        <div className="cw-stage" onMouseLeave={() => setActive(null)}>
          <div className="cw-ring in" />
          <div className="cw-ring out" />
          <div className="cw-hub">
            {active ? (
              <>
                <div className="ey">{active.kind === 'prog' ? 'Programme' : 'Platform'}</div>
                <h2>{active.it.t}</h2>
                <div className="d">{active.it.d}</div>
                {active.it.u && (
                  <a href={active.it.u} target="_blank" rel="noopener noreferrer">
                    {active.it.ul} ↗
                  </a>
                )}
                {active.it.soc && <SocialRow slugs={active.it.soc} />}
              </>
            ) : (
              <>
                <div className="ey">Our Work Today</div>
                <h2>Vyoma</h2>
                <div className="d">Hover any node to see what we run.</div>
                <SocialRow slugs={['facebook', 'x', 'linkedin', 'whatsapp']} />
              </>
            )}
          </div>
          {platforms.map((it, i) => (
            <Node key={it.t} it={it} kind="plat" pos={platPos[i]} />
          ))}
          {programmes.map((it, i) => (
            <Node key={it.t} it={it} kind="prog" pos={progPos[i]} />
          ))}
        </div>
        <div className="cw-fallback mx-auto max-w-[640px]">
          {[
            ['Platforms', platforms, 'plat'],
            ['Programmes', programmes, 'prog'],
          ].map(([label, list, kind]) => (
            <div key={label} className="mt-7">
              <div
                className={`mb-3 font-sans text-[13px] font-extrabold uppercase tracking-[0.12em] ${
                  kind === 'prog' ? 'text-amber-gold' : 'text-teal'
                }`}
              >
                {label}
              </div>
              <div className="flex flex-col gap-3">
                {list.map((it) => (
                  <div
                    key={it.t}
                    className={`rounded-md border border-[var(--border-subtle)] bg-white px-[18px] py-4 ${
                      kind === 'prog' ? 'border-l-[3px] border-l-amber-gold' : 'border-l-[3px] border-l-teal'
                    }`}
                  >
                    <div className="font-sans text-[17px] font-bold text-vyoma-blue">{it.t}</div>
                    <div className="mt-1 font-sans text-sm leading-normal text-charcoal">{it.d}</div>
                    {it.u && (
                      <a
                        href={it.u}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block font-sans text-sm font-bold text-vyoma-blue"
                      >
                        {it.ul} ↗
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
