import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: 'index.html'
    }),
    alias: {
      '@app': 'src/lib/app',
      '@pages': 'src/lib/pages',
      '@widgets': 'src/lib/widgets',
      '@features': 'src/lib/features',
      '@entities': 'src/lib/entities',
      '@shared': 'src/lib/shared'
    }
  }
};
