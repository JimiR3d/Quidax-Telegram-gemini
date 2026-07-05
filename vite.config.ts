import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {loadEnv} from 'vite';
import {configDefaults, defineConfig} from 'vitest/config';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
    },
    test: {
      // Agent worktrees are checked out INSIDE the repo under .claude/worktrees/,
      // so without this exclude vitest also discovers their copied test files and
      // every count doubles (794/52 instead of the real 397/26).
      exclude: [...configDefaults.exclude, '**/.claude/**'],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
