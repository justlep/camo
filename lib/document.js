import _ from 'lodash';
import {deprecate, hasOwnProp} from './util.js';
import {getClientInstance as DB, isNativeId} from './client.js';
import {BaseDocument} from './base-document.js';
import {isArray, isReferenceable, isEmbeddedDocument, IS_DOCUMENT} from './validate.js';

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
    save() {
        const that = this;

        let preValidatePromises = this._getHookPromises('preValidate');

        return Promise.all(preValidatePromises).then(() => {
            // Validate the assigned type, choices, and min/max
            this.validate();
            // Ensure all data types are saved in the same encodings
            this.canonicalize();
            
            return Promise.all(this._getHookPromises('postValidate'));
            
        }).then(function () {
            return Promise.all(that._getHookPromises('preSave'));
        }).then(function () {

            // TODO: We should instead track what has changed and
            // only update those values. Maybe make that._changed
            // object to do this.
            // Also, this might be really slow for objects with
            // lots of references. Figure out a better way.
            let toUpdate = that._toData({_id: false});

            // Reference our objects
            _.keys(that._schema).forEach(function (key) {
                // Never care about _id
                if (key === '_id') {
                    return;
                }

                if (isReferenceable(that[key]) ||            // isReferenceable OR
                    (isArray(that[key]) &&              // isArray AND contains value AND value isReferenceable
                        that[key].length > 0 &&
                        isReferenceable(that[key][0]))) {

                    // Handle array of references (ex: { type: [MyObject] })
                    if (isArray(that[key])) {
                        toUpdate[key] = [];
                        that[key].forEach(function (v) {
                            if (isNativeId(v)) {
                                toUpdate[key].push(v);
                            } else {
                                toUpdate[key].push(v._id);
                            }
                        });
                    } else if (DB().isNativeId(that[key])) {
                        toUpdate[key] = that[key];
                    } else {
                        toUpdate[key] = that[key]._id;
                    }
                }
            });

            // TODO use pre-defined schema keys set for embeddable keys
            // Replace EmbeddedDocument references with just their data
            _.keys(that._schema).forEach(function (key) {
                if (isEmbeddedDocument(that[key]) ||               // isEmbeddedDocument OR
                    (isArray(that[key]) &&              // isArray AND contains value AND value isEmbeddedDocument
                        that[key].length > 0 &&
                        isEmbeddedDocument(that[key][0]))) {

                    // Handle array of references (ex: { type: [MyObject] })
                    if (isArray(that[key])) {
                        toUpdate[key] = [];
                        that[key].forEach(function (v) {
                            toUpdate[key].push(v._toData());
                        });
                    } else {
                        toUpdate[key] = that[key]._toData();
                    }

                }
            });

            return DB().save(that.collectionName(), that._id, toUpdate);
        }).then(function (id) {
            if (that._id === null) {
                that._id = id;
            }
        }).then(function () {
            // TODO: hack?
            let postSavePromises = that._getHookPromises('postSave');
            return Promise.all(postSavePromises);
        }).then(function () {
            return that;
        }).catch(function (error) {
            return Promise.reject(error);
        });
    }

    /**
     * Delete current document
     *
     * @returns {Promise}
     */
    delete() {
        const that = this;

        let preDeletePromises = that._getHookPromises('preDelete');

        return Promise.all(preDeletePromises).then(function () {
            return DB().delete(that.collectionName(), that._id);
        }).then(function (deleteReturn) {
            // TODO: hack?
            let postDeletePromises = [deleteReturn].concat(that._getHookPromises('postDelete'));
            return Promise.all(postDeletePromises);
        }).then(function (prevData) {
            let deleteReturn = prevData[0];
            return deleteReturn;
        });
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
     * @param {Object} query Query
     * @returns {Promise}
     */
    static deleteMany(query) {
        if (query === undefined || query === null) {
            query = {};
        }

        return DB().deleteMany(this.collectionName(), query);
    }

    /**
     * @deprecated Use `findOne`
     */
    static loadOne(query, options) {
        deprecate('loadOne - use findOne instead');
        return this.findOne(query, options);
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
     * @deprecated Use `findOneAndUpdate`
     */
    static loadOneAndUpdate(query, values, options) {
        deprecate('loadOneAndUpdate - use findOneAndUpdate instead');
        return this.findOneAndUpdate(query, values, options);
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
     * @deprecated Use `findOneAndDelete`
     */
    static loadOneAndDelete(query, options) {
        deprecate('loadOneAndDelete - use findOneAndDelete instead');
        return this.findOneAndDelete(query, options);
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
     * @deprecated Use `find`
     */
    static loadMany(query, options) {
        deprecate('loadMany - use find instead');
        return this.find(query, options);
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
     * @returns {Promise}
     */
    static count(query) {
        return DB().count(this.collectionName(), query);
    }

    /**
     * Creates indexes
     * @override
     */
    static _createIndexesOnce() {
        if (this._indexesCreated) {
            // TODO doesnt this effectively prevent any sub-sub-classes to ever add additional indexes?
            //  or is sub-sub-classing not supported, apart from being meh anyway? 
            return;
        }
        
        let instance = this._instantiate();
        for (const k of Object.keys(instance._schema)) {
            if (instance._schema[k].unique) {
                DB().createIndex(this.collectionName(), k, {unique: true});
            }
        }
        this._indexesCreated = true;
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
