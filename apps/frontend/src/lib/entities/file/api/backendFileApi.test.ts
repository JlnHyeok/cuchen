import { afterEach, describe, expect, it, vi } from 'vitest';
import { listFiles } from './backendFileApi';

function catalogRecord(productIndex: number, div: string) {
  const productId = `PRD-${String(productIndex).padStart(4, '0')}`;
  return {
    imageId: `${productId}-${div}`,
    bucket: 'test-bucket',
    fileName: `${productId}-${div}`,
    fileExt: 'png',
    metadata: {
      product_id: productId,
      div,
      time: `2026-04-${String((productIndex % 20) + 1).padStart(2, '0')}T09:00:00.000Z`,
      result: 'OK',
      threshold: 0.8,
      prob: 0.95,
      size: 1024
    },
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: `2026-04-${String((productIndex % 20) + 1).padStart(2, '0')}T09:00:00.000Z`
  };
}

describe('backendFileApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests product-level pagination and renders rows by page size', async () => {
    const items = Array.from({ length: 20 }, (_, index) => index + 1).flatMap((productIndex) =>
      ['top', 'bot', 'top-inf', 'bot-inf'].map((div) => catalogRecord(productIndex, div))
    );
    let requestedUrl = '';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(
        JSON.stringify({
          success: true,
          message: 'ok',
          data: {
            items,
            total: 141,
            totalData: 564,
            page: 2,
            pageSize: 20
          },
          errorCode: null,
          errorMessage: null
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await listFiles({ page: 2, pageSize: 20 });
    const requestUrl = new URL(requestedUrl);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestUrl.pathname).toBe('/images/search');
    expect(requestUrl.searchParams.get('page')).toBe('2');
    expect(requestUrl.searchParams.get('pageSize')).toBe('20');
    expect(requestUrl.searchParams.get('productPage')).toBe('1');
    expect(result.items).toHaveLength(20);
    expect(new Set(result.items.map((item) => item.productId)).size).toBe(20);
    expect(result.total).toBe(141);
    expect(result.totalData).toBe(564);
  });

  it('does not render more rows than the requested page size', async () => {
    const items = Array.from({ length: 22 }, (_, index) => catalogRecord(index + 1, 'top'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            success: true,
            message: 'ok',
            data: {
              items,
              total: 22,
              totalData: 22,
              page: 1,
              pageSize: 20
            },
            errorCode: null,
            errorMessage: null
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      })
    );

    const result = await listFiles({ page: 1, pageSize: 20 });

    expect(result.items).toHaveLength(20);
  });

  it('fills product rows when the backend still returns image-level pages', async () => {
    const firstPageItems = Array.from({ length: 5 }, (_, index) => index + 1).flatMap((productIndex) =>
      ['top', 'bot', 'top-inf', 'bot-inf'].map((div) => catalogRecord(productIndex, div))
    );
    const fallbackItems = Array.from({ length: 20 }, (_, index) => index + 1).flatMap((productIndex) =>
      ['top', 'bot', 'top-inf', 'bot-inf'].map((div) => catalogRecord(productIndex, div))
    );
    const requestedUrls: string[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        requestedUrls.push(String(input));
        const items = requestedUrls.length === 1 ? firstPageItems : fallbackItems;

        return new Response(
          JSON.stringify({
            success: true,
            message: 'ok',
            data: {
              items,
              total: 800,
              page: 1,
              pageSize: requestedUrls.length === 1 ? 20 : 80
            },
            errorCode: null,
            errorMessage: null
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      })
    );

    const result = await listFiles({ page: 1, pageSize: 20 });
    const fallbackUrl = new URL(requestedUrls[1]);

    expect(requestedUrls).toHaveLength(2);
    expect(fallbackUrl.searchParams.get('pageSize')).toBe('80');
    expect(result.items).toHaveLength(20);
    expect(result.total).toBe(200);
    expect(result.totalData).toBe(800);
  });
});
