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
     * @param {Object} query Query
     * @param {?DocumentFindOptions} [options]
     * @returns {Promise}
     */
    static async findOne(query, options) {
        let data = await DB().findOne(this.collectionName(), query);
        if (!data) {
            return null;
        }
        
        let doc = this._fromData(data),
            populate = getPopulateOption(options);
        
        return populate ? await this.populate(doc, populate) : doc;
    }
    
    /**
     * Find one document and update it in current collection
     *
     * @param {Object} query Query
     * @param {Object} values
     * @param {{[upsert]: boolean, [multi]: boolean, [populate]: string[]|boolean}} [options]
     * @returns {Promise<?Document>} - the document after update, null if none found to update
     */
    static async findOneAndUpdate(query, values, options = {}) {
        if (arguments.length < 2) {
            throw new Error('findOneAndUpdate requires at least 2 arguments. Got ' + arguments.length + '.');
        }

        let data = await DB().findOneAndUpdate(this.collectionName(), query, values, options);
        if (!data) {
            return null;
        }

        let doc = this._fromData(data),
            populate = getPopulateOption(options);
        
        return populate ? this.populate(doc, populate) : doc;
    }

    /**
     * Find one document and delete it in current collection
     *
     * @param {Object} query Query
     * @param {Object} options
     * @returns {Promise<number>} - number of removed documents
     */
    static findOneAndDelete(query, options) {
        if (arguments.length < 1) {
            throw new Error(`findOneAndDelete requires at least 1 argument. Got ${arguments.length}.`);
        }
        return DB().findOneAndDelete(this.collectionName(), query, options);
    }

    /**
     * Find documents
     *
     * @param {Object} query Query
     * @param {Object} [options]
     * @returns {Promise<Document[]>}
     */
    static async find(query, options = {}) {
        if (query === undefined || query === null) {
            query = {};
        }
        if (typeof options !== 'object') {
            throw new Error('Invalid options');
        }
        
        let data = await DB().find(this.collectionName(), query, options);
        if (!data || isArray(data) && !data.length) {
            return [];
        }
        
        let docOrDocs = this._fromData(data),
            populate = getPopulateOption(options);

        if (populate) {
            await this.populate(docOrDocs, populate);
        }
     
        return isArray(docOrDocs) ? docOrDocs : [docOrDocs];
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

    /**
     * Clear current collection
     *
     * @returns {Promise}
     */
    static clearCollection() {
        return DB().clearCollection(this.collectionName());
    }

}

/**
 * @typedef {Object} DocumentFindOptions
 * @property {boolean|string[]} [populate]
 */

/**
 * Extracts a populate option from a given Object (null allowed).
 * Default return value is true (meaning "populate all") if no populate option was found.  
 * 
 * @param {?DocumentFindOptions} opts - a thing that contains a 'populate' property or not
 * @return {boolean|string[]} - false meaning don't populate at all, true -> populate all, string[] -> only those fields 
 */
const getPopulateOption = (opts) => {
    if (!opts || !hasOwnProp(opts, 'populate') || opts.populate === true) {
        return true;
    }
    return isArray(opts.populate) && opts.populate.length ? opts.populate : false;
};

Document[IS_DOCUMENT] = true;
Document.prototype[IS_DOCUMENT] = true;
