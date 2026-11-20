import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// The App is served from GitHub Pages at https://<user>.github.io/spooky-break-reminder/,
// so every asset URL must start with this base path (Requirement 26.2).
export default defineConfig({
  base: '/spooky-break-reminder/',
  plugins: [preact()],
  test: {
    // Node is the default. Component tests opt into happy-dom per file with
    // a `// @vitest-environment happy-dom` comment at the top of the file.
    environment: 'node',
  },
});
