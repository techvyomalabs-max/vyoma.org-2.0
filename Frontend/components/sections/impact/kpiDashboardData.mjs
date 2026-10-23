// Pure data-mapping helpers for KpiDashboard, kept free of JSX so this
// mapping logic can be unit-tested directly with the Node test runner (no
// JSX/React transform needed) -- see KpiDashboard.test.mjs.

export function findMetricValue(items, label) {
  return items?.find((item) => item.label === label)?.value ?? '0';
}

export function toNumber(raw) {
  return Number(String(raw ?? '0').replace(/,/g, '')) || 0;
}

// Resolves every value the Impact dashboard widget displays from the same
// INPUT/IMPACT arrays the page's own metric-card sections render, by CMS
// label -- so a value edited (and published) in the admin CMS updates this
// widget automatically, with no code change. A missing or renamed label
// falls back to '0'/0 rather than throwing, since this widget is a
// decorative summary, not the page's source of truth for any figure.
export function getDashboardMetrics(input, impact) {
  const bars = [
    { label: 'Teachers', v: toNumber(findMetricValue(input, 'Dedicated Teachers & Scholars')) },
    { label: 'Seva', v: toNumber(findMetricValue(input, 'Seva Workforce')) },
    { label: 'Volunteers', v: toNumber(findMetricValue(input, 'Volunteers / Freelancers')) },
    { label: 'Workshops', v: toNumber(findMetricValue(input, 'Workshops')) },
    { label: 'Camps', v: toNumber(findMetricValue(input, 'Sanskrit Camps')) },
  ];
  return {
    bars,
    transformedIndividuals: findMetricValue(impact, 'Transformed Individuals'),
    eLearningManHours: findMetricValue(input, 'E-Learning Man-Hours'),
    touchPrints: findMetricValue(impact, 'Touch-Prints'),
  };
}
