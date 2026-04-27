import { describe, expect, it } from 'vitest';
import { downloadFiles, dummyFileApiTestHooks, getFilterOptions, getProductFiles, listFiles } from './dummyFileApi';

describe('dummyFileApi', () => {
  it('filters files by date range', async () => {
    const result = await listFiles({
      page: 1,
      pageSize: 100,
      dateFrom: '2026-04-20',
      dateTo: '2026-04-21'
    });

    expect(result.total).toBeGreaterThan(0);
    expect(result.items.every((item) => item.time.slice(0, 10) >= '2026-04-20')).toBe(true);
    expect(result.items.every((item) => item.time.slice(0, 10) <= '2026-04-21')).toBe(true);
  });

  it('filters files by product id', async () => {
    const options = await getFilterOptions();
    const productId = options.productIds[1];
    const result = await listFiles({ page: 1, pageSize: 100, productId });

    expect(result.total).toBeGreaterThan(0);
    expect(result.items.every((item) => item.productId === productId)).toBe(true);
  });

  it('filters files by image division and inspection result', async () => {
    const options = await getFilterOptions();
    const div = options.divs[0];
    const result = await listFiles({ page: 1, pageSize: 100, div, result: 'OK' });

    expect(result.total).toBeGreaterThan(0);
    expect(result.items.every((item) => item.div === div && item.result === 'OK')).toBe(true);
  });

  it('returns one list row per product group', async () => {
    const result = await listFiles({ page: 1, pageSize: 100 });
    const productCount = dummyFileApiTestHooks.files.length / 4;

    expect(result.total).toBe(productCount);
    expect(new Set(result.items.map((item) => item.productId)).size).toBe(result.items.length);
    expect(result.items.every((item) => item.fileCount === 4)).toBe(true);
    expect(result.items.every((item) => item.divs?.join(',') === 'top,bot,top-inf,bot-inf')).toBe(true);
  });

  it('returns MongoDB-style page metadata', async () => {
    const result = await listFiles({ page: 2, pageSize: 15 });
    const productCount = dummyFileApiTestHooks.files.length / 4;

    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(15);
    expect(result.total).toBe(productCount);
    expect(result.totalPages).toBe(Math.ceil(productCount / 15));
    expect(result.items).toHaveLength(3);
    expect(result.items[0]?.id).toBe('file-0061');
  });

  it('returns all image divisions for the selected product', async () => {
    const result = await getProductFiles('file-0001');

    expect(result).toHaveLength(4);
    expect(new Set(result.map((item) => item.productId)).size).toBe(1);
    expect(result.map((item) => item.div)).toEqual(['top', 'bot', 'top-inf', 'bot-inf']);
  });

  it('returns a zip blob for selected file downloads', async () => {
    const result = await downloadFiles(['file-0001', 'file-0005']);
    const bytes = await result.blob.arrayBuffer();

    expect(result.fileName).toBe('cuchen-selected-2-products.zip');
    expect(result.blob.type).toBe('application/zip');
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});
