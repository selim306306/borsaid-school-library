const DASH = '—';

function formatCount(value) {
  if (value == null || value === '') return DASH;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number.toLocaleString('ar-EG') : DASH;
}

export function renderPublicPageViewStats(root, totals = null, errorMessage = '') {
  if (!root) return;
  const values = totals || {};
  root.querySelector('[data-public-stats-value="total"]').textContent = formatCount(values.total_views);
  root.querySelector('[data-public-stats-value="today"]').textContent = formatCount(values.today_views);
  root.querySelector('[data-public-stats-value="month"]').textContent = formatCount(values.month_views);
  const status = root.querySelector('[data-public-stats-status]');
  if (status) {
    status.textContent = errorMessage || '';
    status.hidden = !errorMessage;
  }
  root.dataset.loaded = totals && !errorMessage ? 'true' : 'false';
}

export async function loadPublicPageViewStats({ client, root, rpcName = 'get_public_page_view_totals' } = {}) {
  if (!root) return { data: null, error: new Error('analytics_unavailable') };
  try {
    if (!client) throw new Error('analytics_unavailable');
    const { data, error } = await client.rpc(rpcName);
    if (error) throw error;
    const totals = Array.isArray(data) ? data[0] : data;
    if (!totals || typeof totals !== 'object') throw new Error('empty_totals');
    renderPublicPageViewStats(root, totals);
    return { data: totals, error: null };
  } catch (error) {
    renderPublicPageViewStats(root, null, 'تعذّر تحميل الإحصاءات');
    return { data: null, error };
  }
}
