'use strict';

const NeDbClient = require('./clients/nedbclient');

/**
 * Connect to current database
 *
 * @param {String} url
 * @param {CamoNedbConnectOptions} options
 * @returns {Promise}
 */
exports.connect = function(url, options = {}) {
    if (url.indexOf('nedb://') > -1) {
        // url example: nedb://path/to/file/folder
        return NeDbClient.connect(url, options).then(function(db) {
            global.CLIENT = db;
            return db;
        });
    } else {
        return Promise.reject(new Error('Unrecognized DB connection url.'));
    }
};

/**
 * @typedef {Object} CamoNedbConnectOptions
 * @property {typeof Datastore} [NedbDatastoreClass] optional, Datastore class to use instead of requiring 'Datastore' from
 *                                                             the optional nedb dependency. Useful when using a fork of nedb.
 */
