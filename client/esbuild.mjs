import esbuild from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url)));
const watch = process.argv.includes('--watch');

/** Single self-contained IIFE embedded as an EmbeddedResource in the plugin. */
const options = {
  entryPoints: ['src/index.js'],
  outfile: '../src/Jellyfin.Plugin.CommentTrack/Resources/comment-track.bundle.js',
  bundle: true,
  format: 'iife',
  target: ['es2019'],
  minify: !watch,
  sourcemap: false,
  legalComments: 'inline',
  banner: {
    js:
      `/* Jellyfin Comment Track overlay v${pkg.version}\n` +
      ` * Bundles danmaku (MIT, weizhenye). Player-hook logic adapted from\n` +
      ` * jellyfin-danmaku (MIT, Izumiko). */`,
  },
  define: { 'process.env.CT_VERSION': JSON.stringify(pkg.version) },
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('esbuild: watching…');
} else {
  await esbuild.build(options);
  console.log('esbuild: built', options.outfile);
}
