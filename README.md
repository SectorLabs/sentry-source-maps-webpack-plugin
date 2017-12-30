# Sentry Source Maps Webpack Plugin

[![MIT](https://img.shields.io/:license-mit-blue.svg)](http://doge.mit-license.org)
[![npm version](https://badge.fury.io/js/sentry-source-maps-webpack-plugin.svg)](https://badge.fury.io/js/sentry-source-maps-webpack-plugin)

This Webpack plugin automatically uploads source maps generated during the build to Sentry.io.

## Why not use the official plugin?
The [sentry-webpack-plugin](https://github.com/getsentry/sentry-webpack-plugin) doesn't allow configuration through the Webpack plugin itself or environment variables. 

There are a couple of other reasons to use this plugin over the official one:

* Use the `publicPath` from your Webpack configuration rather than assuming `/`.
* Override the `publicPath` per file (useful for Node.JS code).

## Installation

1. Install the package from NPM:

        λ yarn add sentry-source-maps-webpack-plugin

2. Follow the instructions for the official plugin regarding getting a authentication token:

    * [Official docs](https://docs.sentry.io/clients/javascript/sourcemaps/#using-sentry-webpack-plugin)

2. Add the plugin to your Webpack configuration:

        const SentrySourceMapsPlugin = require('sentry-source-maps-webpack-plugin');

        const config = {
            plugins: [
                new SentrySourceMapsPlugin({
                    org: 'my-org',
                    project: 'my-project',
                    authToken: 'sentry auth token',
                    version: '1.0',

                    // not required
                    publicPaths: {
                        'server.js': '/',
                        'server.js.map': '/',
                    },
                }),
            ]
        };

3. Make sure to specify the exact same version when configuring Raven:

    * [Official docs](https://docs.sentry.io/clients/javascript/sourcemaps/#verify-you-have-specified-the-release-in-your-client-config)
