const fs = require('fs');
const path = require('path');
const fetch = require('fetch-retry');
const FormData = require('form-data');
const _ = require('lodash');

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
    request(method, path, body, headers = {}) {
        let url = `https://sentry.io/api/0/projects/${this.options.org}/${
            this.options.project
        }`;
        url += path;

        const requestHeaders = {
            Authorization: `Bearer ${this.options.authToken}`,
            'content-type': 'application/json',
        };

        const requestOptions = {
            method: method,
            headers: Object.assign({}, requestHeaders, headers || {}),
            body: body,
            retries: this.options.retries || 5,
            retryDetail: this.options.timeout || 1000,
        };

        return fetch(url, requestOptions).then(response => response.json());
    }

    /**
     * Creates a new release with the specified version number.
     */
    createRelease(version) {
        const body = {
            version: version,
        };

        if (this.options.ref) {
            body.ref = this.options.ref;
        }

        if (this.options.refs) {
            body.refs = this.options.refs;
        }

        if (this.options.commits) {
            body.commits = this.options.commit;
        }

        return this.request('POST', '/releases/', JSON.stringify(body));
    }

    /**
     * Uploads a file as part of a release.
     */
    uploadFile(version, filePath, publicPath, name) {
        const form = new FormData();
        form.append('file', fs.createReadStream(filePath));
        form.append('name', `~${path.join(publicPath, name)}`);
        form.append('header', `Sourcemap:${name}.map`);

        return this.request(
            'POST',
            `/releases/${version}/files/`,
            form,
            form.getHeaders(),
        );
    }

    /**
     * Finalizes a release with the specified version number.
     */
    finalizeRelease(version) {
        const body = {
            projects: [this.options.project],
            dateReleased: new Date().toISOString(),
        };

        return this.request(
            'PUT',
            `/releases/${version}/`,
            JSON.stringify(body),
        );
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
        // don't run if the user wants this disabled
        if (this.options.enabled === false) {
            return callback();
        }

        const isJSFileOrMap = fileName =>
            fileName.endsWith('.js') || fileName.endsWith('.map');

        // iterate over all chunks and find all JS files that
        // were emitted during the build
        const files = {};
        compilation.chunks.forEach(chunk => {
            Object.assign(
                files,
                _.pick(compilation.assets, chunk.files.filter(isJSFileOrMap)),
            );
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
                            this.options.publicPaths[fileName] || publicPath,
                            fileName,
                        ).catch((error) => compilation.warnings.push(
			    `\Failed to upload source maps for: ${fileName}`
			))
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
