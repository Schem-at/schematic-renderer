import path from 'path';
import webpack from 'webpack';
import { Buffer } from 'buffer';

/** @typedef {import('webpack').Configuration} WebpackConfig **/

export default {
    entry: './src/index.ts',
    mode: 'development',
    plugins: [
        new webpack.ProvidePlugin({
            Buffer: ['buffer', 'Buffer'], // for nbt-ts
        }),
        new webpack.HotModuleReplacementPlugin(),
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

    },
    devtool: 'nosources-source-map',
    output: {
        filename: 'bundle.js',
        library: 'SchematicRenderer',
        path: path.resolve(process.cwd(), 'dist'),
        libraryTarget: 'umd',
        devtoolModuleFilenameTemplate: '../[resource-path]'
    },
    devServer: {
        static: {
            directory: path.join(process.cwd(), 'dist'),
        },
        hot: true,
        port: 3000,
        // ... other devServer options ...
    },


};
