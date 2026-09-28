const TONES = {
  inverse: 'bg-white/12 text-white border-white/25',
  teal: 'bg-teal/10 text-teal border-teal/25',
  amber: 'bg-amber-gold text-charcoal border-amber-gold',
};

export function Badge({ children, tone = 'inverse' }) {
  return (
    <span
      className={`inline-flex items-center px-3.5 py-1.5 rounded-md text-sm font-semibold font-sans tracking-wide border ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
