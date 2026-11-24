// Pure, framework-free subject-string construction for per-vacancy
// Internship Apply buttons -- extracted so it's genuinely, directly
// testable with node:test (no JSX, no hooks, no rendering needed), same
// extraction pattern as resourcesTableLogic.mjs/navActiveLogic.mjs. Never
// hardcodes a specific role name: works identically for any CMS-entered
// role string, present or future (QA Bug — Internship Apply button fix).
export function buildInternshipApplySubject(role) {
  return `Internships - ${role}`;
}
