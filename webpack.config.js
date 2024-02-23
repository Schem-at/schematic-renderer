import path from 'path';

export default {
    entry: './src/index.ts',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: [
                    /node_modules/,
                    /test_website/
                ]
            },
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
        fallback: {
            "buffer": import.meta.resolve("buffer/"),
        }
    },
    devtool: 'inline-source-map',
    output: {
        filename: 'bundle.js',
        library: 'SchematicRenderer',
        path: path.resolve(process.cwd(), 'dist'),
        libraryTarget: 'umd',
    },

};
