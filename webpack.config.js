import path from 'path';
import webpack from 'webpack';

/** @typedef {import('webpack').Configuration} WebpackConfig **/

export default {
    entry: './src/index.ts',
    mode: 'development',
    plugins: [
        new webpack.ProvidePlugin({
            Buffer: ['buffer', 'Buffer'], // for nbt-ts
        }),
    ],
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
    devtool: 'nosources-source-map',
    output: {
        filename: 'bundle.js',
        library: 'SchematicRenderer',
        path: path.resolve(process.cwd(), 'dist'),
        libraryTarget: 'umd',
        devtoolModuleFilenameTemplate: '../[resource-path]'
    },

};
