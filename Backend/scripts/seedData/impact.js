// Mirrors ui_kits/vyoma-org/Impact.jsx. Source: vyoma.org/metrics, as on June
// 2026. Restructured for the Phase C admin CMS — text preserved exactly,
// only `active` (default true) is new. The KpiDashboard component on this
// page is intentionally NOT made editable here (it's a hardcoded,
// decorative visualization independent of these metric arrays — Phase C
// scope is "structure the current metrics/sections," not this derived
// display).
export const INPUT = [
  { value: '136', label: 'Dedicated Teachers & Scholars', active: true },
  { value: '79', label: 'Seva Workforce', active: true },
  { value: '176', label: 'Volunteers / Freelancers', active: true },
  { value: '49,642', label: 'Volunteering Hours', active: true },
  { value: '485,680', label: 'E-Learning Man-Hours', active: true },
  { value: '25', label: 'Release Functions', active: true },
  { value: '14', label: 'Sanskrit Camps', active: true },
  { value: '102', label: 'Talks & Lectures', active: true },
  { value: '24', label: 'Workshops', active: true },
];

export const OUTPUT = [
  { value: '3', label: 'Mobile Apps', active: true },
  { value: '433', label: 'Free Courses', active: true },
  { value: '35', label: 'Books Published', active: true },
  { value: '52,351', label: 'Video Recordings (hrs)', active: true },
  { value: '52', label: 'Paid Courses', active: true },
  { value: '60', label: 'Flipbooks', active: true },
  { value: '485', label: 'Courses', active: true },
  { value: '12,800', label: 'Lessons', active: true },
  { value: '5', label: 'Kindle', active: true },
  { value: '11', label: 'Papers Published', active: true },
  { value: '52', label: 'Multimedia Products', active: true },
];

export const IMPACT = [
  { value: '124,193', label: 'Transformed Individuals', active: true },
  { value: '18', label: 'Direct Benefited Organizations', active: true },
  { value: '17,841,742', label: 'Touch-Prints', active: true },
];

export const SEO = { title: null, description: null, canonical: '/impact', ogImage: null };
