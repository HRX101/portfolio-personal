import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2022',
    /*
     * No automatic `modulepreload`.
     *
     * Vite's default is to emit `modulepreload` for every chunk reachable from
     * the entry — including async ones. That default would fetch three.js and
     * R3F on every load, including 2D-mode loads that will never render a frame
     * of 3D. Disabling it means the browser fetches exactly what the running
     * code imports: the entry chunk, then either the 2D or the 3D chunk, and
     * the 3D chunk's own dependencies only when 3D actually mounts.
     *
     * The cost is one extra round-trip when 3D does mount (the chunk's deps are
     * discovered at import time rather than preloaded). That is the correct
     * trade: a slightly slower 3D start in exchange for never taxing the
     * readers the fallback exists for.
     */
    modulePreload: false,
    /*
     * Module manifest: maps every output chunk to its source modules. Used by
     * scripts/bundle-guard.mjs to prove the 2D chunks contain no renderer
     * code — by construction, not by marker grepping, which minification
     * defeats. Costs one small JSON file in dist/.
     */
    manifest: true,
    rolldownOptions: {
      output: {
        /*
         * Manual chunks. Each group exists for a loading reason, not just
         * cacheability — and every group is load-bearing for 2D isolation:
         *
         * - `react`: the framework MUST have its own chunk. Without this rule
         *   the bundler parks react inside the r3f chunk (it is r3f's biggest
         *   dependency), and then the entry — which needs react — statically
         *   imports the r3f chunk, which imports three. That single placement
         *   decision silently re-downloaded the entire renderer in 2D mode,
         *   past every source-level check we had. The bundle guard asserts on
         *   the manifest, not on markers, for exactly this reason.
         * - `three`: ~85% of the bytes, cacheable across deploys.
         * - `r3f`: fiber + drei + postprocessing bindings, 3D-only.
         */
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            { name: 'r3f', test: /node_modules[\\/]@react-three[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    host: true,
  },
});
