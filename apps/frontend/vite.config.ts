import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    watch: {
      usePolling: true,
      interval: 300
    }
  },
  test: {
    environment: 'node',
    include: ['src/lib/**/*.test.ts']
  }
});
