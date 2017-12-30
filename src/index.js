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
    request(path, body, headers = {}) {
        let url = `https://sentry.io/api/0/projects/${this.options.org}/${
            this.options.project
        }`;
        url += path;

        const requestHeaders = {
            Authorization: `Bearer ${this.options.authToken}`,
            'content-type': 'application/json',
        };

        const requestOptions = {
            method: 'POST',
            headers: Object.assign({}, requestHeaders, headers || {}),
            body: body,
        };

        return fetch(url, requestOptions).then(response => response.json());
    }

    /**
     * Creates a new release with the specified version number.
     */
    createRelease(version) {
        return this.request('/releases/', JSON.stringify({ version: version }));
    }

    /**
     * Uploads a file as part of a release.
     */
    uploadFile(version, filePath, name) {
        const form = new FormData();
        form.append('file', fs.createReadStream(filePath));
        form.append('name', name);

        // create a link to the source map if this is not a source map itself
        if (!name.endsWith('.map')) {
            form.append('header', `Sourcemap:${name}.map`);
        }

        return this.request(
            `/releases/${version}/files/`,
            form,
            form.getHeaders(),
        );
    }

    /**
     * Finalizes a release with the specified version number.
     */
    finalizeRelease(version) {
        return this.request(`/releases/${version}/deploy`, JSON.stringify({}));
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
        // iterate over all chunks and find all JS files that
        // were emitted during the build
        const files = {};
        compilation.chunks.forEach(chunk => {
            chunk.files
                .filter(
                    fileName =>
                        fileName.endsWith('.js') || fileName.endsWith('.map'),
                )
                .forEach(fileName => {
                    files[fileName] = compilation.assets[fileName];
                });
        });

        const publicPath = compilation.options.output.publicPath;

        this.sentry
            // create a new release
            .createRelease(this.options.version)

            // upload all the files we found
            .then(() =>
                Promise.all(
                    Object.keys(files).map(fileName =>
                        this.sentry.uploadFile(
                            this.options.version,
                            files[fileName].existsAt,
                            `~${path.join(publicPath, fileName)}`,
                        ),
                    ),
                ),
            )

            // finalize the release
            .then(() => this.sentry.finalizeRelease(this.options.version))

            // signal that we uploaded all the source maps
            .then(() => callback())

            // catch any error that occurred
            .catch(error => {
                compilation.errors.push(
                    `\nFailed to upload source maps: \n\n${error.stack.toString()}`,
                );
                return callback();
            });
    });
};

module.exports = SentrySourceMapPlugin;
