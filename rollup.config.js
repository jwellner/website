import { uglify } from 'rollup-plugin-uglify';

export default {
	input: 'src/js/main.js',
	output: {
		file: 'src/copy/assets/js/main.bundle.js',
		format: 'umd',
        name: 'main'
	},
    plugins: [
        uglify({
            mangle: true,
        })
    ]
};