import { afterEach, describe, expect, it, vi } from 'vitest';
import { unzipSync } from 'fflate';
import { BackendConnectionError, downloadFile, isBackendConnectionError, listFiles } from './backendFileApi';

function catalogRecord(productIndex: number, div: string) {
  const productId = `PRD-${String(productIndex).padStart(4, '0')}`;
  return {
    imageId: `${productId}-${div}`,
    bucket: 'test-bucket',
    fileName: `${productId}-${div}`,
    fileExt: 'png',
    metadata: {
      productId,
      div,
      processId: '압력검사',
      version: 'v1',
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

    const result = await listFiles({ page: 2, pageSize: 20, process: '압력검사', version: 'v1' });
    const requestUrl = new URL(requestedUrl);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestUrl.pathname).toBe('/images/search');
    expect(requestUrl.searchParams.get('page')).toBe('2');
    expect(requestUrl.searchParams.get('pageSize')).toBe('20');
    expect(requestUrl.searchParams.get('productPage')).toBe('1');
    expect(requestUrl.searchParams.get('query')).toBe('압력검사');
    expect(requestUrl.searchParams.get('version')).toBe('v1');
    expect(result.items).toHaveLength(20);
    expect(new Set(result.items.map((item) => item.productId)).size).toBe(20);
    expect(result.items[0]?.process).toBe('압력검사');
    expect(result.total).toBe(141);
    expect(result.totalData).toBe(564);
  });

  it('keeps probability blank when backend metadata has no probability value', async () => {
    const item = catalogRecord(1, 'top');
    const { prob: _prob, ...metadataWithoutProb } = item.metadata;
    const itemWithoutProb = { ...item, metadata: metadataWithoutProb };

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            success: true,
            message: 'ok',
            data: {
              items: [itemWithoutProb],
              total: 1,
              totalData: 1,
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

    expect(Number.isNaN(result.items[0]?.prob)).toBe(true);
    expect(result.items[0]?.minProb).toBeUndefined();
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

  it('groups file-name fallback image divisions into one product row', async () => {
    const items = ['top', 'bot', 'top-inf', 'bot-inf'].map((div) => ({
      imageId: `bulk-0001-${div}`,
      bucket: 'test-bucket',
      fileName: `bulk-0001-${div}`,
      fileExt: 'jpg',
      metadata: {},
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z'
    }));

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            success: true,
            message: 'ok',
            data: {
              items,
              total: 1,
              totalData: 4,
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

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.productId).toBe('bulk-0001');
    expect(result.items[0]?.fileCount).toBe(4);
  });

  it('normalizes network failures as backend connection errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );

    try {
      await listFiles({ page: 1, pageSize: 20 });
      throw new Error('Expected listFiles to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(BackendConnectionError);
      expect(isBackendConnectionError(error)).toBe(true);
      expect((error as Error).message).toBe('백엔드 서버에 연결할 수 없습니다.');
    }
  });

  it('downloads product images with matching metadata json sidecars', async () => {
    const items = ['top', 'bot'].map((div) => catalogRecord(1, div));

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        const imageId = decodeURIComponent(url.pathname.split('/')[2] ?? '');
        const record = items.find((item) => item.imageId === imageId) ?? items[0];

        if (url.pathname.endsWith('/metadata')) {
          return new Response(
            JSON.stringify({
              success: true,
              message: 'ok',
              data: record,
              errorCode: null,
              errorMessage: null
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        if (url.pathname === '/images/search') {
          return new Response(
            JSON.stringify({
              success: true,
              message: 'ok',
              data: {
                items,
                total: 2,
                totalData: 2,
                page: 1,
                pageSize: 1000
              },
              errorCode: null,
              errorMessage: null
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }

        if (url.pathname.endsWith('/blob')) {
          return new Response(`image:${imageId}`, { status: 200, headers: { 'content-type': 'image/png' } });
        }

        return new Response('not found', { status: 404 });
      })
    );

    const result = await downloadFile('PRD-0001-top');
    const zipBytes = new Uint8Array(await result.blob.arrayBuffer());
    const entries = unzipSync(zipBytes);
    const metadata = JSON.parse(new TextDecoder().decode(entries['PRD-0001/PRD-0001-top.json'])) as Record<string, unknown>;

    expect(result.fileName).toBe('PRD-0001.zip');
    expect(Object.keys(entries).sort()).toEqual([
      'PRD-0001/PRD-0001-bot.json',
      'PRD-0001/PRD-0001-bot.png',
      'PRD-0001/PRD-0001-top.json',
      'PRD-0001/PRD-0001-top.png'
    ]);
    expect(new TextDecoder().decode(entries['PRD-0001/PRD-0001-top.png'])).toBe('image:PRD-0001-top');
    expect(metadata.productId).toBe('PRD-0001');
    expect(metadata.product_id).toBeUndefined();
    expect(metadata.processCode).toBeUndefined();
    expect(metadata.source).toBeUndefined();
    expect(metadata.div).toBe('top');
  });
});
