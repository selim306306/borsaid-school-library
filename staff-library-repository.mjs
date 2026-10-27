const READS = Object.freeze({
  catalog: {
    table: 'catalog_titles',
    columns: 'id,general_number,title,author,classification,isbn,series_name,is_published',
    order: 'title',
    error: 'تعذّر تحميل العناوين.',
  },
  holdings: {
    table: 'holdings',
    columns: 'id,title_id,branch_id,inventory_tag,cabinet_code,shelf_code,public_shelf_label,status,created_at',
    order: 'created_at',
    error: 'تعذّر تحميل النسخ.',
  },
  branches: {
    table: 'branches',
    columns: 'id,name,governorate,city,public_address,public_phone,public_email,is_published',
    order: 'name',
    error: 'تعذّر تحميل الفروع.',
  },
});

export function createStaffLibraryRepository({ getSupabase, getLibraryId, fetchAllPages }) {
  if (typeof getSupabase !== 'function' || typeof getLibraryId !== 'function' || typeof fetchAllPages !== 'function') {
    throw new TypeError('getSupabase, getLibraryId, and fetchAllPages are required');
  }

  async function list(key) {
    const read = READS[key];
    const libraryId = getLibraryId();
    if (typeof libraryId !== 'string' || !libraryId.trim()) {
      throw new Error('تعذّر تحديد المكتبة المختارة.');
    }
    const client = getSupabase();
    if (!client || typeof client.from !== 'function') {
      throw new Error('جلسة الموظفين غير متاحة لقراءة المكتبة.');
    }
    try {
      const rows = await fetchAllPages(() => client.from(read.table)
        .select(read.columns)
        .eq('library_id', libraryId)
        .order(read.order));
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      throw new Error(read.error, { cause: error });
    }
  }

  return Object.freeze({
    listCatalogTitles: () => list('catalog'),
    listHoldings: () => list('holdings'),
    listBranches: () => list('branches'),
  });
}
