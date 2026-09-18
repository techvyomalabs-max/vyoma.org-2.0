import Link from 'next/link';

const BASE =
  'inline-flex items-center justify-center gap-2 font-sans font-semibold rounded-md cursor-pointer border border-transparent transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)]';

const SIZES = {
  md: 'px-[18px] py-2 text-sm',
  lg: 'px-[22px] py-[11px] text-base',
  sm: 'px-4 py-1.5 text-xs',
};

const VARIANTS = {
  'outline-inverse':
    'bg-transparent border-white text-white hover:bg-white hover:text-vyoma-blue',
  solid: 'bg-vyoma-blue border-vyoma-blue text-white hover:bg-vyoma-blue-deep',
  outline: 'bg-transparent border-vyoma-blue text-vyoma-blue hover:bg-vyoma-blue hover:text-white',
};

export function Button({
  variant = 'outline-inverse',
  size = 'md',
  children,
  onClick,
  href,
  type = 'button',
  disabled = false,
  className = '',
}) {
  const classes = `${BASE} ${SIZES[size]} ${VARIANTS[variant]} disabled:opacity-60 disabled:cursor-not-allowed ${className}`;

  // href renders a real <a> (via next/link) styled identically — never nest
  // a Link inside a <button>, which is invalid HTML and silently drops the
  // link's content in some browsers.
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={classes}>
      {children}
    </button>
  );
}
