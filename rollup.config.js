import svelte from 'rollup-plugin-svelte';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import alias from 'rollup-plugin-alias';
// import { terser } from 'rollup-plugin-terser';

// const production = !process.env.ROLLUP_WATCH;

export default {
	input: 'layer-cake-example/layercake-Line/src/main.js',
	output: {
		sourcemap: true,
		format: 'iife',
		name: 'app',
		file: 'layer-cake-example/bundle.js'
	},
	plugins: [
    alias({
      layercake: '/app/node_modules/layercake/src/layercake'
    }),
		svelte({
			// opt in to v3 behaviour today
			// skipIntroByDefault: true,
			// nestedTransitions: true,

			// enable run-time checks when not in production
			// dev: !production,
			// we'll extract any component CSS out into
			// a separate file  better for performance
			// css: css => {
				// css.write('/app/layer-cake-example/bundle.css');
			// }
		}),

		// If you have external dependencies installed from
		// npm, you'll most likely need these plugins. In
		// some cases you'll need additional configuration 
		// consult the documentation for details:
		// https://github.com/rollup/rollup-plugin-commonjs
		resolve(),
		commonjs(),

		// If we're building for production (npm run build
		// instead of npm run dev), minify
		// production && terser()
	]
};