const webpack = require('webpack');

module.exports = function override(config, env) {
    // 1. Polyfill Node.js modules
    config.resolve.fallback = {
        ...config.resolve.fallback,
        "fs": false,
        "path": false,
        "crypto": require.resolve("crypto-browserify"),
        "stream": require.resolve("stream-browserify"),
        "buffer": require.resolve("buffer"),
        "process": require.resolve("process/browser"),
    };

    // 2. Inject Global Variables
    config.plugins = [
        ...config.plugins,
        new webpack.ProvidePlugin({
            process: 'process/browser',
            Buffer: ['buffer', 'Buffer']
        })
    ];

    // 3. Handle WASM Files
    const wasmExtensionRegExp = /\.wasm$/;
    config.module.rules.forEach(rule => {
        (rule.oneOf || []).forEach(oneOf => {
            if (oneOf.loader && oneOf.loader.indexOf('file-loader') >= 0) {
                oneOf.exclude.push(wasmExtensionRegExp);
            }
        });
    });
    config.module.rules.push({
        test: wasmExtensionRegExp,
        include: /node_modules/,
        type: 'javascript/auto',
        use: [{ loader: 'file-loader' }]
    });

    return config;
};
