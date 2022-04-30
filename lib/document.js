import {hasOwnProp} from './util.js';
import {getClientInstance as DB, isNativeId} from './client.js';
import {BaseDocument, SCHEMA_NON_REF_EMBD_KEYS, SCHEMA_REF_EMBD_KEYS} from './base-document.js';
import {isArray, isReferenceable, isEmbeddedDocument, IS_DOCUMENT, IS_EMBEDDED} from './validate.js';

/**
 * @abstract
 */
export class Document extends BaseDocument {
    
    constructor() {
        super();
        
        if (arguments.length) {
            throw new Error('No arguments allowed for Document');
        }
    }

    /**
     * Save (upsert) current document
     *
     * TODO: The method is too long and complex, it is necessary to divide...
     * @returns {Promise}
     */
    async save() {
        await this._getHookPromises('preValidate', true);

        this.validate();     // Validate the assigned type, choices, and min/max
        this.canonicalize(); // Ensure all data types are saved in the same encodings
        
        await this._getHookPromises('postValidate', true);
        await this._getHookPromises('preSave', true);
        
        // TODO: We should instead track what has changed and
        //  only update those values. Maybe make that._changed object to do this.
        //  Also, this might be really slow for objects with lots of references. Figure out a better way.
        let docToSave = this._toData();

        // Reference our objects, but only non-embedded ones
        for (const key of this._schema[SCHEMA_NON_REF_EMBD_KEYS]) {
            if (key === '_id') {
                continue;
            }

            let val = this[key],
                isNonEmptyArray = isArray(val) && val.length;
            
            if (isReferenceable(val) || (isNonEmptyArray && isReferenceable(val[0]))) {
                if (isNonEmptyArray) {
                    docToSave[key] = this[key].map(v => isNativeId(v) ? v : v._id);
                } else if (isNativeId(val)) {
                    docToSave[key] = val;
                } else {
                    docToSave[key] = val._id;
                }
            }
        }

        // Replace EmbeddedDocument references with just their data
        for (const key of this._schema[SCHEMA_REF_EMBD_KEYS]) {
            let val = this[key];
            if (!val) {
                continue;
            }
            if (val[IS_EMBEDDED]) {
                docToSave[key] = val._toData();
            } else if (isArray(val) && val.length && isEmbeddedDocument(val[0])) {
                docToSave[key] = val.map(v => v._toData());
            }
        }

        let newId = await DB().save(this.collectionName(), this._id, docToSave);
        
        if (this._id === null) {
            this._id = newId;
        } 
        
        await this._getHookPromises('postSave', true);
            
        return this;
    }

    /**
     * Delete current document
     *
     * @returns {Promise<number>} # of deleted documents
     */
    async delete() {
        await Promise.all(this._getHookPromises('preDelete'));
        let totalDeleted = await DB().delete(this.collectionName(), this._id);
        await Promise.all(this._getHookPromises('postDelete'));
        return totalDeleted;
    }

    /**
     * Delete one document in current collection
     *
     * @param {Object} query Query
     * @returns {Promise}
     */
    static deleteOne(query) {
        return DB().deleteOne(this.collectionName(), query);
    }

    /**
     * Delete many documents in current collection
     *
     * @param {Object} [query] Query
     * @returns {Promise}
     */
    static deleteMany(query) {
        if (query === undefined || query === null) {
            query = {};
        }

        return DB().deleteMany(this.collectionName(), query);
    }

    /**
     * Find one document in current collection
     *
     * TODO: Need options to specify whether references should be loaded
     *
     * @param {Object} query Query
     * @returns {Promise}
     */
    static findOne(query, options) {
        const that = this;

        let populate = hasOwnProp(options, 'populate') ? options.populate : true;

        return DB().findOne(this.collectionName(), query)
            .then(function (data) {
                if (!data) {
                    return null;
                }
                
                let doc = that._fromData(data);
                if (populate === true || (isArray(populate) && populate.length)) {
                    return that.populate(doc, populate);
                }
                
                return doc;
            }).then(doc => doc || null).catch(err => console.error(err));
    }
    
    /**
     * Find one document and update it in current collection
     *
     * @param {Object} query Query
     * @param {Object} values
     * @param {Object} options
     * @returns {Promise}
     */
    static findOneAndUpdate(query, values, options) {
        const that = this;

        if (arguments.length < 2) {
            throw new Error('findOneAndUpdate requires at least 2 arguments. Got ' + arguments.length + '.');
        }

        if (!options) {
            options = {};
        }

        let populate = true;
        if (hasOwnProp(options, 'populate')) {
            populate = options.populate;
        }

        return DB().findOneAndUpdate(this.collectionName(), query, values, options)
            .then(function (data) {
                if (!data) {
                    return null;
                }

                let doc = that._fromData(data);
                if (populate) {
                    return that.populate(doc);
                }

                return doc;
            }).then(function (doc) {
                if (doc) {
                    return doc;
                }
                return null;
            });
    }

    /**
     * Find one document and delete it in current collection
     *
     * @param {Object} query Query
     * @param {Object} options
     * @returns {Promise}
     */
    static findOneAndDelete(query, options) {
        if (arguments.length < 1) {
            throw new Error(`findOneAndDelete requires at least 1 argument. Got ${arguments.length}.`);
        }

        if (!options) {
            options = {};
        }

        return DB().findOneAndDelete(this.collectionName(), query, options);
    }

    /**
     * Find documents
     *
     * TODO: Need options to specify whether references should be loaded
     *
     * @param {Object} query Query
     * @param {Object} options
     * @returns {Promise}
     */
    static find(query, options) {
        const that = this;

        if (query === undefined || query === null) {
            query = {};
        }

        if (options === undefined || options === null) {
            // Populate by default
            options = {populate: true};
        }

        return DB().find(this.collectionName(), query, options)
            .then(function (datas) {
                let docs = that._fromData(datas);

                if (options.populate === true ||
                    (isArray(options.populate) && options.populate.length > 0)) {
                    return that.populate(docs, options.populate);
                }

                return docs;
            }).then(function (docs) {
                // Ensure we always return an array
                return [].concat(docs);
            });
    }

    /**
     * Get count documents in current collection by query
     *
     * @param {Object} query Query
     * @returns {Promise<number>}
     */
    static count(query) {
        return DB().count(this.collectionName(), query);
    }

    /**
     * Creates indexes.
     * Invoked only once per document class, just after the derived class' _schema was added to its prototype. 
     * @override
     * @internal
     */
    _createIndexesOnce() {
        for (const key of Object.keys(this._schema)) {
            if (this._schema[key].unique) {
                console.log(`Created index for field "${key}" of collection "${this.constructor.collectionName()}"`);
                DB().createIndex(this.constructor.collectionName(), key, {unique: true});
            }
        }
    }

    // TODO revisit. for now, overriding _fromData just to delegate to super made no sense 
    // static _fromData(datas) {
    //     let instances = super._fromData(datas);
    //     // This way we preserve the original structure of the data. Data
    //     // that was passed as an array is returned as an array, and data
    //     // passes as a single object is returned as single object
    //     let datasArray = [].concat(datas);
    //     let instancesArray = [].concat(instances);
    //
    //     /*for (let i = 0; i < instancesArray.length; i++) {
    //         if (datasArray[i].hasOwnProperty('_id')) {
    //             instancesArray[i]._id = datasArray[i]._id;
    //         } else {
    //             instancesArray[i]._id = null;
    //         }
    //     }*/
    //
    //     return instances;
    // }

    /**
     * Clear current collection
     *
     * @returns {Promise}
     */
    static clearCollection() {
        return DB().clearCollection(this.collectionName());
    }

}

Document[IS_DOCUMENT] = true;
Document.prototype[IS_DOCUMENT] = true;
