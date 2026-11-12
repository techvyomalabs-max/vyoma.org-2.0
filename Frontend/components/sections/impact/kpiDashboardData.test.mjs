// Regression tests for the Impact dashboard's CMS data mapping -- the exact
// lookups KpiDashboard.jsx relies on to stay in sync with the admin CMS
// without any hardcoded numbers. See kpiDashboardData.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMetricValue, toNumber, getDashboardMetrics } from './kpiDashboardData.mjs';

const INPUT = [
  { value: '136', label: 'Dedicated Teachers & Scholars', active: true },
  { value: '78', label: 'Seva Workforce', active: true },
  { value: '195', label: 'Volunteers / Freelancers', active: true },
  { value: '50,768', label: 'Volunteering Hours', active: true },
  { value: '524,560', label: 'E-Learning Man-Hours', active: true },
  { value: '25', label: 'Release Functions', active: true },
  { value: '14', label: 'Sanskrit Camps', active: true },
  { value: '102', label: 'Talks & Lectures', active: true },
  { value: '26', label: 'Workshops', active: true },
];

const IMPACT = [
  { value: '132,291', label: 'Transformed Individuals', active: true },
  { value: '22', label: 'Direct Benefited Organizations', active: true },
  { value: '20,280,585', label: 'Touch-Prints', active: true },
];

test('findMetricValue returns the raw, still-comma-formatted string for a known label', () => {
  assert.equal(findMetricValue(INPUT, 'Seva Workforce'), '78');
  assert.equal(findMetricValue(INPUT, 'E-Learning Man-Hours'), '524,560');
  assert.equal(findMetricValue(IMPACT, 'Touch-Prints'), '20,280,585');
});

test('findMetricValue falls back to "0" for a label that does not exist (renamed/removed in the CMS)', () => {
  assert.equal(findMetricValue(INPUT, 'Seva Team'), '0'); // renamed
  assert.equal(findMetricValue(INPUT, 'Nonexistent Metric'), '0'); // removed
});

test('findMetricValue tolerates a missing/null items array entirely, instead of throwing', () => {
  assert.equal(findMetricValue(undefined, 'Seva Workforce'), '0');
  assert.equal(findMetricValue(null, 'Seva Workforce'), '0');
  assert.equal(findMetricValue([], 'Seva Workforce'), '0');
});

test('toNumber strips thousands separators and parses the remaining digits', () => {
  assert.equal(toNumber('20,280,585'), 20280585);
  assert.equal(toNumber('136'), 136);
  assert.equal(toNumber('0'), 0);
});

test('toNumber falls back to 0 for missing, empty, or non-numeric input', () => {
  assert.equal(toNumber(undefined), 0);
  assert.equal(toNumber(null), 0);
  assert.equal(toNumber(''), 0);
  assert.equal(toNumber('not a number'), 0);
});

test('getDashboardMetrics maps all 4 bar values + gauge + both stats from INPUT/IMPACT by label', () => {
  const metrics = getDashboardMetrics(INPUT, IMPACT);
  assert.deepEqual(metrics.bars, [
    { label: 'Teachers', v: 136 },
    { label: 'Seva', v: 78 },
    { label: 'Volunteers', v: 195 },
    { label: 'Workshops', v: 26 },
    { label: 'Camps', v: 14 },
  ]);
  assert.equal(metrics.transformedIndividuals, '132,291');
  assert.equal(metrics.eLearningManHours, '524,560');
  assert.equal(metrics.touchPrints, '20,280,585');
});

test('getDashboardMetrics degrades to 0/"0" per-field when a label is renamed, instead of throwing or dropping other fields', () => {
  const renamed = INPUT.map((item) => (item.label === 'Workshops' ? { ...item, label: 'Workshops & Seminars' } : item));
  const metrics = getDashboardMetrics(renamed, IMPACT);
  assert.deepEqual(
    metrics.bars.find((b) => b.label === 'Workshops'),
    { label: 'Workshops', v: 0 }
  );
  // Every other field is unaffected by the one renamed label.
  assert.equal(metrics.bars.find((b) => b.label === 'Teachers').v, 136);
  assert.equal(metrics.bars.find((b) => b.label === 'Camps').v, 14);
  assert.equal(metrics.transformedIndividuals, '132,291');
});

test('getDashboardMetrics degrades gracefully when a label is missing entirely (e.g. removed from the CMS array)', () => {
  const withoutCamps = INPUT.filter((item) => item.label !== 'Sanskrit Camps');
  const metrics = getDashboardMetrics(withoutCamps, IMPACT);
  assert.deepEqual(
    metrics.bars.find((b) => b.label === 'Camps'),
    { label: 'Camps', v: 0 }
  );
});

test('getDashboardMetrics tolerates missing input/impact arrays entirely (e.g. a CMS fetch failure upstream)', () => {
  const metrics = getDashboardMetrics(undefined, undefined);
  assert.deepEqual(metrics.bars, [
    { label: 'Teachers', v: 0 },
    { label: 'Seva', v: 0 },
    { label: 'Volunteers', v: 0 },
    { label: 'Workshops', v: 0 },
    { label: 'Camps', v: 0 },
  ]);
  assert.equal(metrics.transformedIndividuals, '0');
  assert.equal(metrics.eLearningManHours, '0');
  assert.equal(metrics.touchPrints, '0');
});
