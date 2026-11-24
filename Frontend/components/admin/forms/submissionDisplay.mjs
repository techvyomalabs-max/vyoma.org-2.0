// Pure, framework-free display logic for Admin Forms list rows --
// extracted so it's genuinely testable with node:test, no rendering
// needed. Same extraction pattern as resourcesTableLogic.mjs/
// navActiveLogic.mjs/internshipApplyLogic.mjs.
export function subjectLabel(submission) {
  const subject = submission?.values?.subject;
  if (typeof subject !== 'string' || !subject.trim()) return 'No subject';
  return subject;
}
