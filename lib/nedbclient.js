import fs from 'node:fs';
import path from 'node:path';
import {DatabaseClient} from './client.js';
import {hasOwnProp} from './util.js';
import {isArray} from './validate.js';

const NON_ID_CHAR_REGEX = /[^0-9a-z]/i;

/** @type {typeof Datastore} - the datastore class defined during {@link connect} */
let Datastore;

/**
 * Connect to current database
 * 
 * @param {String} url - example: 'nedb://path/to/file/folder' or 'nedb://memory' 
 * @param {typeof Datastore} datastoreClass - an Nedb `Datastore` class to use;
 *                                            can origin from the original 'nedb' package or a fork like '@justlep/nedb'
 * @returns {Promise<NeDbClient>}
 */
export async function connect(url, datastoreClass) {
    let pathOrMemory = url.startsWith('nedb://') ? url.substr(7).trim() : null;
    if (!pathOrMemory) {
        throw new Error('Unrecognized DB connection url. Expected nedb://memory or nedb:///path/to/dbfiles');
    }
    
    // brief duck-typing of the given Datastore class should suffice
    if (typeof datastoreClass !== 'function' || typeof datastoreClass.prototype.loadDatabase !== 'function') {
        throw new Error('Invalid NeDB Datastore class');
    }
    if (Datastore && datastoreClass !== Datastore) {
        throw new Error('Cannot change NeDB Datastore class after first connect');
    }
    
    Datastore = datastoreClass;

    return new NeDbClient(pathOrMemory);
}


export class NeDbClient extends DatabaseClient {

    /**
     * @param {string} pathOrMemory - 'memory' for in-memory, otherwise path to the folder of the .db files 
     */
    constructor(pathOrMemory) {
        super(pathOrMemory);
        this._inMemory = pathOrMemory === 'memory';
        this._path = this._inMemory ? null : pathOrMemory;
        this._collections = Object.create(null);
    }

    /**
     * @param {string} name - the collection name
     * @return {string} - the path to the .db file
     */
    _getDbFilePath(name) {
        return this._inMemory ? name : path.join(this._path, name + '.db');
    }
    
    /**
     * @param {string} name - the collection name
     * @return {Datastore}
     */
    _getDb(name) {
        if (!hasOwnProp(this._collections, name)) {
            let collection;
            if (this._inMemory) {
                collection = new Datastore({inMemoryOnly: true});
            } else {
                collection = new Datastore({
                    filename: this._getDbFilePath(name), 
                    autoload: true
                });
            }
            this._collections[name] = collection;
        }
        return this._collections[name];
    }
    
    /**
     * Save (upsert) document
     *
     * @param {String} collection Collection's name
     * @param {ObjectId?} id Document's id
     * @param {Object} values Data for save
     * @returns {Promise} Promise with result insert or update query
     */
    save(collection, id, values) {
        return new Promise((resolve, reject) => {
            const db = this._getDb(collection);

            // TODO: I'd like to just use update with upsert:true, but I'm
            // note sure how the query will work if id == null. Seemed to
            // have some problems before with passing null ids.
            if (id === null) {
                db.insert(values, (error, result) => error ? reject(error) : resolve(result._id));
            } else {
                db.update({_id: id}, {$set: values}, {upsert: true}, (error, result) => error ? reject(error) : resolve(result));
            }
        });
    }

    /**
     * Delete document
     *
     * @param {String} collection Collection's name
     * @param {?string} id Document's id
     * @returns {Promise<number>} number of deleted documents
     */
    delete(collection, id) {
        if (id === null || id === undefined) {
            return Promise.resolve(0);
        }
        return new Promise((resolve, reject) => {
            const db = this._getDb(collection);
            db.remove({_id: id}, (error, numRemoved) => error ? reject(error) : resolve(numRemoved));
        });
    }

    /**
     * Delete one document by query
     *
     * @param {String} collection Collection's name
     * @param {Object} query Query
     * @returns {Promise<number>} number of deleted documents
     */
    deleteOne(collection, query) {
        return new Promise((resolve, reject) => {
            const db = this._getDb(collection);
            db.remove(query, (error, numRemoved) => error ? reject(error) : resolve(numRemoved));
        });
    }

    /**
     * Delete many documents by query
     *
     * @param {String} collection Collection's name
     * @param {Object} query Query
     * @returns {Promise<number>} number of deleted documents
     */
    deleteMany(collection, query) {
        return new Promise((resolve, reject) => {
            const db = this._getDb(collection);
            db.remove(query, {multi: true}, (error, numRemoved) => error ? reject(error) : resolve(numRemoved));
        });
    }

    /**
     * Find one document
     *
     * @param {String} collection Collection's name
     * @param {Object} query Query
     * @returns {Promise<?Document>}
     */
    findOne(collection, query) {
        return new Promise((resolve, reject) => {
            const db = this._getDb(collection);
            db.findOne(query, (error, result) => error ? reject(error) : resolve(result));
        });
    }

    /**
     * Find one document and update it
     *
     * @param {String} collection Collection's name
     * @param {Object} query Query
     * @param {Object} values
     * @param {Object} options
     * @returns {Promise<?Document>} document that was updated (or upserted), null if none found or upserted 
     */
    findOneAndUpdate(collection, query, values, options) {
        if (!options) {
            options = {};
        }

        // Since this is 'findOne...' we'll only allow user to update
        // one document at a time
        options.multi = false;

        return new Promise((resolve, reject) => {
            const db = this._getDb(collection);

            // TODO: Would like to just use 'Collection.update' here, but
            // it doesn't return objects on update (but will on insert)...
            /*db.update(query, values, options, function(error, numReplaced, newDoc) {
                if (error) return reject(error);
                resolve(newDoc);
            });*/

            this.findOne(collection, query).then(data => {
                if (!data) {
                    if (options.upsert) {
                        return db.insert(values, (error, result) => error ? reject(error) : resolve(result));
                    }
                    return resolve(null);
                }

                db.update(query, {$set: values}, (error, result) => {
                    if (error) {
                        return reject(error);
                    }
                    // Fixes issue #55. Remove when NeDB is updated to v1.8+
                    //   ^-- Nedb 1.8.0 still won't pass documents to update() callbacks  
                    db.findOne({_id: data._id}, (error, doc) => error ? reject(error) : resolve(doc));
                });
            });
        });
    }

    /**
     * Find one document and delete it
     *
     * @param {String} collection Collection's name
     * @param {Object} query Query
     * @param {Object} options
     * @returns {Promise<number>} number of removed documents
     */
    findOneAndDelete(collection, query, options) {
        if (!options) {
            options = {};
        }

        // Since this is 'findOne...' we'll only allow user to update
        // one document at a time
        options.multi = false;

        return new Promise((resolve, reject) => {
            const db = this._getDb(collection);
            db.remove(query, options, (error, numRemoved) => error ? reject(error) : resolve(numRemoved));
        });
    }

    /**
     * Find documents
     * 
     * @param {String} collection Collection's name
     * @param {Object} query Query
     * @param {Object} options
     * @returns {Promise}
     */
    find(collection, query, options = {}) {
        return new Promise((resolve, reject) => {
            let cursor = this._getDb(collection).find(query);

            let {sort, skip, limit} = options;
            
            if (sort && (isArray(sort) || typeof sort === 'string')) {
                let sortOptions = Object.create(null);
                for (let s of isArray(sort) ? sort : [sort]) {
                    if (typeof s !== 'string') {
                        continue;
                    }
                    if (s[0] === '-') {
                        sortOptions[s.substring(1)] = -1;
                    } else {
                        sortOptions[s] = 1;
                    }
                }
                cursor = cursor.sort(sortOptions);
            }
            if (typeof skip === 'number' && Number.isFinite(skip) && skip > 0) {
                cursor = cursor.skip(skip);
            }
            if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
                cursor = cursor.limit(limit);
            }
            cursor.exec((error, result) => error ? reject(error) : resolve(result));
        });
    }

    /**
     * Get count of collection by query
     *
     * @param {String} collection Collection's name
     * @param {Object} query Query
     * @returns {Promise<number>} # of matching documents
     */
    count(collection, query) {
        return new Promise((resolve, reject) => {
            this._getDb(collection).count(query, (error, count) => error ? reject(error) : resolve(count));
        });
    }

    /**
     * Create index
     *
     * @param {String} collection Collection's name
     * @param {String} field Field name
     * @param {Object} options Options
     * @returns {Promise}
     */
    createIndex(collection, field, options) {
        options = options || {};
        options.unique = options.unique || false;
        options.sparse = options.sparse || false;

        this._getDb(collection).ensureIndex({fieldName: field, unique: options.unique, sparse: options.sparse});
    }

    /**
     * Close current connection
     *
     * @returns {Promise}
     */
    close() {
        // Nothing to do for NeDB
    }

    /**
     * Drop collection
     *
     * @param {String} collection
     * @returns {Promise<number>} -  number of deleted documents
     */
    clearCollection(collection) {
        return this.deleteMany(collection, {});
    }

    /**
     * Drop current database
     *
     * @returns {Promise}
     */
    dropDatabase() {
        if (this._inMemory) {
            Object.keys(this._collections).forEach(key => delete this._collections[key]);
            return Promise.resolve();
        }
        return Promise.all(Object.keys(this._collections).map(collectionName => new Promise((resolve, reject) => {
            let dbFilePath = this._getDbFilePath(collectionName);
            
            // Delete the file, but only if it exists
            fs.stat(dbFilePath, (err, stat) => {
                if (!err) {
                    if (stat && !stat.isFile()) {
                        return reject(`Cannot drop collection, path is not a file: ${dbFilePath}`);
                    } 
                    fs.unlink(dbFilePath, (err) => {
                        if (err) {
                            reject(err);
                        }
                        delete this._collections[collectionName];
                        resolve();
                    });
                } else {
                    resolve();
                }
            });
        })));
    }

    toCanonicalId(id) {
        return id;
    }

    /**
     * @param {*} value
     * @return {boolean}
     * @override
     */
    isNativeId(value) {
        return typeof value === 'string' && value.length === 16 && !NON_ID_CHAR_REGEX.test(value);
    }

    nativeIdType() {
        return String;
    }

    driver() {
        return this._collections;
    }

}

