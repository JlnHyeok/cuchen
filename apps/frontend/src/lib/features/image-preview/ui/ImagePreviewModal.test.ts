import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const componentSource = readFileSync(resolve(__dirname, 'ImagePreviewModal.svelte'), 'utf8');
const stylesSource = readFileSync(resolve(__dirname, '../../../app/styles.css'), 'utf8');

function cssBlock(selector: string): string {
  const match = stylesSource.match(new RegExp(`${selector.replaceAll('.', '\\.')}\\s*\\{(?<body>[^}]*)\\}`));
  return match?.groups?.body ?? '';
}

describe('ImagePreviewModal layout contract', () => {
  it('opens loading state with the full four-column detail width before items arrive', () => {
    expect(componentSource).toContain('loading ? 4');
    expect(componentSource).toContain('--detail-columns: ${detailColumnCount}');
  });

  it('renders a fixed metadata skeleton before the loading image grid', () => {
    const metadataIndex = componentSource.indexOf('common-metadata detail-loading-metadata');
    const imageGridIndex = componentSource.indexOf('detail-loading-grid');
    const skeletonLine = cssBlock('.detail-skeleton-line');

    expect(metadataIndex).toBeGreaterThan(-1);
    expect(imageGridIndex).toBeGreaterThan(-1);
    expect(metadataIndex).toBeLessThan(imageGridIndex);
    expect(componentSource).toContain('common-field product-field detail-loading-field');
    expect(componentSource).toContain('common-field captured-field detail-loading-field');
    expect(componentSource).toContain('common-field process-field detail-loading-field');
    expect(componentSource).toContain('common-field version-field detail-loading-field');
    expect(componentSource).toContain('common-field quality-field detail-loading-field');
    expect(componentSource).toContain('common-field probability-field detail-loading-field');
    expect(componentSource).toContain('common-field threshold-field detail-loading-field');
    expect(skeletonLine).toContain('height: 14px');
  });

  it('keeps detail image slots at a fixed height regardless of image dimensions', () => {
    const detailImageShell = cssBlock('.detail-image-shell');
    const detailImagePlaceholder = cssBlock('.detail-image-placeholder');
    const detailImageButton = cssBlock('.detail-image-button');

    expect(detailImageShell).toContain('height: 420px');
    expect(detailImageShell).toContain('min-height: 420px');
    expect(detailImageShell).toContain('max-height: 420px');
    expect(detailImageShell).toContain('flex: 0 0 420px');
    expect(detailImageShell).toContain('grid-template: 1fr / 1fr');
    expect(detailImageButton).toContain('grid-area: 1 / 1');
    expect(detailImagePlaceholder).toContain('grid-area: 1 / 1');
    expect(detailImagePlaceholder).toContain('width: 100%');
    expect(detailImagePlaceholder).toContain('height: 100%');
    expect(detailImageShell).not.toContain('flex: 1 1 auto');
  });
});
