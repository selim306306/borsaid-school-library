export const METRIC_KEYS = Object.freeze(['titles', 'missing_author', 'missing_classification', 'missing_isbn', 'whitespace_candidates']);
export function aggregateMetrics(value) {
  return Object.fromEntries(METRIC_KEYS.map(key => {
    const number = Number(value?.[key]);
    return [key, Number.isSafeInteger(number) && number >= 0 ? number : 0];
  }));
}
export function validGoal(goal) { return ['review', 'normalize_catalog', 'design_review'].includes(goal); }
export function planAction(goal) {
  if (!['review', 'normalize_catalog'].includes(goal)) throw new Error('invalid_goal');
  return goal === 'normalize_catalog' ? 'normalize_catalog' : 'review';
}
