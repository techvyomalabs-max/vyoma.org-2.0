import { Card } from '@/components/common/Card';

export function SchoolsGrid({ schools }) {
  const active = schools.filter((s) => s.active !== false);
  return (
    <section className="bg-white px-8 py-16">
      <div className="mx-auto grid max-w-[1100px] gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
        {active.map((s, i) => (
          <Card key={s.name} index={`${String(i + 1).padStart(2, '0')} — ${s.tag}`} title={s.name}>
            {s.body}
          </Card>
        ))}
      </div>
    </section>
  );
}
