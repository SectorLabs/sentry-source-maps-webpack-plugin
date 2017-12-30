const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const FormData = require('form-data');

/**
 * Thin wrapper over the Sentry.io API.
 */
class Sentry {
    constructor(options) {
        this.options = options;
    }

    /**
     * Makes a POST request at the specified path.
     */
    request(path, body, contentType = 'application/json') {
        let url = `https://sentry.io/api/0/projects/${this.options.org}/${
            this.options.project
        }`;
        url += path;

        const init = {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.options.authToken}`,
                'Content-Type': contentType,
            },
            body: body,
        };

        return fetch(url, init).then(response => response.json());
    }

    /**
     * Creates a new release with the specified version number.
     */
    createRelease(version) {
        return this.request('/releases/', JSON.stringify({ version: version }));
    }

    /**
     * Uploads a source map.
     */
    uploadSourceMap(version, filePath, name) {
        const form = new FormData();
        form.append('file', fs.createReadStream(filePath));
        form.append('name', name);

        const contentType = form.getHeaders()['content-type'];
        return this.request(`/releases/${version}/files/`, form, contentType);
    }
}

/**
 * Simple Webpack plugin that uploads emitted source maps
 * to Sentry.io.
 */
function SentrySourceMapPlugin(options) {
    this.options = options;
    this.sentry = new Sentry(options);
}

/**
 * Discovers all emitted source maps and uploads them to Sentry.io.
 */
SentrySourceMapPlugin.prototype.apply = function(compiler) {
    compiler.plugin('after-emit', (compilation, callback) => {
        // iterate over all chunks and find all source maps that
        // were emitted during the build
        const sourceMaps = {};
        compilation.chunks.forEach(chunk => {
            chunk.files
                .filter(fileName => fileName.endsWith('.map'))
                .forEach(fileName => {
                    sourceMaps[fileName] = compilation.assets[fileName];
                });
        });

        this.sentry
            // create a new release
            .createRelease(this.options.version)

            // upload all the source maps we found
            .then(() =>
                Promise.all(
                    Object.keys(sourceMaps).map(fileName =>
                        this.sentry.uploadSourceMap(
                            this.options.version,
                            sourceMaps[fileName].existsAt,
                            fileNae, // TODO: maybe combine this with publicPath
                        ),
                    ),
                ),
            )

            // signal that we uploaded all the source maps
            .then(() => callback())

            // catch any error that occurred
            .catch(error => {
                compilation.errors.push(
                    `\nFailed to upload source maps: \n\n${error.stack.toString()}`,
                );
                return callback();
            });

        // const publicPath = compilation.options.output.publicPath
    });
};

module.exports = SentrySourceMapPlugin;
