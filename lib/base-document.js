import _ from 'lodash';
import {
    isSupportedType,
    isValidType,
    isEmptyValue,
    isInChoices,
    isArray,
    isEmbeddedDocument,
    isNumber,
    isDate, IS_BASE_DOCUMENT, IS_EMBEDDED, IS_DOCUMENT
} from './validate.js';
import {getClientInstance as DB, isNativeId} from './client.js';
import {ValidationError} from './errors.js';
import {deprecate, hasOwnProp} from './util.js';

const REF_1_KEYS = Symbol('ref1keys');
const REF_N_KEYS = Symbol('refNkeys');

/**
 * @typedef {Object} CamoPopulateTarget
 * @property {BaseDocument[]|string[]} ref1DocsAndProps - like [doc1, 'foo', doc2, 'bar', ...]
 * @property {(BaseDocument|string)[]} refNDocsAndProps - as above, but foo and bar are array properties of doc1/doc2
 */

/**
 * @type {Map<typeof BaseDocument, Object.<string, CamoPopulateTarget>>}
 */
let docClassToIdPopTargetMap = new Map();


const normalizeType = function (property) {
    // TODO: Only copy over stuff we support

    let typeDeclaration = {};
    if (property.type) {
        typeDeclaration = property;
    } else if (isSupportedType(property)) {
        typeDeclaration.type = property;
    } else {
        throw new Error(`Unsupported type or bad variable. Remember, non-persisted objects must start with an underscore (_). Got: ${property}`);
    }

    return typeDeclaration;
};

export class BaseDocument {
    
    constructor() {
        // Defines document structure/properties
        this._schema = {
            _id: {type: DB().nativeIdType()}
        };

        this._id = null;
    }

    collectionName() {
        // DEPRECATED
        // Getting ready to remove this functionality
        if (this._meta) {
            return this._meta.collection;
        }

        return this.constructor.collectionName();
    }

    /**
     * Get current collection name
     *
     * @returns {String}
     */
    static collectionName() {
        // DEPRECATED
        // Getting ready to remove this functionality
        let instance = new this();
        if (instance._meta) {
            return instance._meta.collection;
        }

        return this.name.toLowerCase() + 's';
    }

    get id() {
        deprecate('Document.id - use Document._id instead');
        return this._id;
    }

    set id(id) {
        deprecate('Document.id - use Document._id instead');
        this._id = id;
    }

    /**
     * set schema
     * @param {Object} extension
     */
    schema(extension) {
        const that = this;

        if (!extension) {
            return;
        }
        _.keys(extension).forEach(function (k) {
            that[k] = extension[k];
        });
    }

    /*
     * Pre/post Hooks
     *
     * To add a hook, the extending class just needs
     * to override the appropriate hook method below.
     */

    preValidate() {
    }

    postValidate() {
    }

    preSave() {
    }

    postSave() {
    }

    preDelete() {
    }

    postDelete() {
    }

    /**
     * Generate this._schema from fields
     *
     * TODO : EMBEDDED
     * Need to share this with embedded
     */
    generateSchema() {
        /** @type {Set<string>} - contains keys which reference 1 Document-type entity */
        this._schema[REF_1_KEYS] = new Set();
        /** @type {Set<string>} - contains keys which reference arrays of Document-type entities */
        this._schema[REF_N_KEYS] = new Set();

        for (const key of Object.keys(this)) {
            if (key[0] === '_') {
                continue; // ignore private variables
            }

            // Normalize the type format
            this._schema[key] = normalizeType(this[key]);

            let schemaType = this._schema[key].type;

            // Assign a default if needed
            if (isArray(schemaType)) {
                this[key] = this.getDefault(key) || [];
                if (schemaType[0]?.[IS_DOCUMENT]) {
                    this._schema[REF_N_KEYS].add(key);
                }
            } else {
                this[key] = this.getDefault(key);
                if (schemaType[IS_DOCUMENT]) {
                    this._schema[REF_1_KEYS].add(key);
                }
            }
        }
    }

    /**
     * Validate current document
     *
     * The method throw errors if document has invalid value
     *
     * TODO: This is not the right approach. The method needs to collect all
     * errors in array and return them.
     */
    validate() {
        const that = this;

        _.keys(that._schema).forEach(function (key) {
            let value = that[key];

            // TODO: This should probably be in Document, not BaseDocument
            if (value !== null && value !== undefined) {
                if (value[IS_EMBEDDED]) {
                    value.validate();
                    return;
                } 
                if (isArray(value) && value.length && value[0][IS_EMBEDDED]) {
                    value.forEach(v => v && v.validate());
                    return;
                }
            }

            if (!isValidType(value, that._schema[key].type)) {
                // TODO: Formatting should probably be done somewhere else
                let typeName = null;
                let valueName = null;
                if (Array.isArray(that._schema[key].type) && that._schema[key].type.length > 0) {
                    typeName = '[' + that._schema[key].type[0].name + ']';
                } else if (Array.isArray(that._schema[key].type) && that._schema[key].type.length === 0) {
                    typeName = '[]';
                } else {
                    typeName = that._schema[key].type.name;
                }

                if (Array.isArray(value)) {
                    // TODO: Not descriptive enough! Strings can look like numbers
                    try {
                        valueName = '[' + value.toString() + ']'; // prototype-less array items will throw
                    } catch (err) {
                        valueName = `[${value.map(v => typeof v).join(',')}]`;
                    }
                } else {
                    valueName = typeof value;
                }
                throw new ValidationError('Value assigned to ' + that.collectionName() + '.' + key +
                    ' should be ' + typeName + ', got ' + valueName);
            }

            if (that._schema[key].required && isEmptyValue(value)) {
                throw new ValidationError('Key ' + that.collectionName() + '.' + key +
                    ' is required' + ', but got ' + value);
            }

            if (that._schema[key].match && typeof value === 'string' && !that._schema[key].match.test(value)) {
                throw new ValidationError('Value assigned to ' + that.collectionName() + '.' + key +
                    ' does not match the regex/string ' + that._schema[key].match.toString() + '. Value was ' + value);
            }

            if (!isInChoices(that._schema[key].choices, value)) {
                throw new ValidationError('Value assigned to ' + that.collectionName() + '.' + key +
                    ' should be in choices [' + that._schema[key].choices.join(', ') + '], got ' + value);
            }

            if (isNumber(that._schema[key].min) && value < that._schema[key].min) {
                throw new ValidationError('Value assigned to ' + that.collectionName() + '.' + key +
                    ' is less than min, ' + that._schema[key].min + ', got ' + value);
            }

            if (isNumber(that._schema[key].max) && value > that._schema[key].max) {
                throw new ValidationError('Value assigned to ' + that.collectionName() + '.' + key +
                    ' is less than max, ' + that._schema[key].max + ', got ' + value);
            }

            if (typeof that._schema[key].validate === 'function' && !that._schema[key].validate(value)) {
                throw new ValidationError('Value assigned to ' + that.collectionName() + '.' + key +
                    ' failed custom validator. Value was ' + value);
            }
        });
    }

    /*
     * Right now this only canonicalizes dates (integer timestamps
     * get converted to Date objects), but maybe we should do the
     * same for strings (UTF, Unicode, ASCII, etc)?
     */
    canonicalize() {
        const that = this;

        _.keys(that._schema).forEach(function (key) {
            let value = that[key];

            if (that._schema[key].type === Date && isDate(value)) {
                that[key] = new Date(value);
            } else if (value && value[IS_EMBEDDED]) {
                // TODO: This should probably be in Document, not BaseDocument
                value.canonicalize();
                return; // TODO superfluous or falsely meant as 'break'? check later
            }
        });
    }

    /**
     * Create new document from data
     *
     * @param {Object} [data]
     * @returns {BaseDocument}
     */
    static create(data) {
        this.createIndexes();

        if (typeof data !== 'undefined') {
            return this._fromData(data);
        }

        return this._instantiate();
    }

    static createIndexes() {
    }

    /**
     * Create new document from self
     *
     * @returns {BaseDocument}
     * @private
     */
    static _instantiate() {
        let instance = new this();
        instance.generateSchema();
        return instance;
    }

    // TODO: Should probably move some of this to
    // Embedded and Document classes since Base shouldn't
    // need to know about child classes
    static _fromData(data) {
        const that = this;

        if (!isArray(data)) {
            data = [data];
        }

        let documents = [];
        data.forEach(function (d) {
            let instance = that._instantiate();
            _.keys(d).forEach(function (key) {
                let value = null;
                if (d[key] === null) {
                    value = instance.getDefault(key);
                } else {
                    value = d[key];
                }

                // If its not in the schema, we don't care about it... right?
                if (key in instance._schema) {

                    let type = instance._schema[key].type;

                    if (type[IS_EMBEDDED]) {
                        // Initialize EmbeddedDocument
                        instance[key] = type._fromData(value);
                    } else if (isArray(type) && type.length && type[0][IS_EMBEDDED]) {
                        // Initialize array of EmbeddedDocuments
                        instance[key] = value.map(v => type[0]._fromData(v));
                    } else {
                        // Initialize primitive or array of primitives
                        instance[key] = value;
                    }
                } else if (key in instance) {
                    // Handles virtual setters
                    instance[key] = value;
                }
            });

            documents.push(instance);
        });

        if (documents.length === 1) {
            return documents[0];
        }
        return documents;
    }

    populate() {
        return BaseDocument.populate(this);
    }

    /**
     * Populates document references
     *
     * TODO : EMBEDDED
     * @param {BaseDocument[]|BaseDocument} docOrDocs
     * @param {Array} [fields]
     * @returns {Promise}
     */
    static populate(docOrDocs, fields) {
        if (!docOrDocs) {
            return Promise.resolve([]);
        }
        /** @type {BaseDocument[]} */
        let documents = isArray(docOrDocs) ? docOrDocs : [docOrDocs];
        if (!documents.length) {
            return Promise.resolve([]);
        }

        // Load all 1-level-deep references, Find all unique keys needed to be loaded...

        //  Assumption here: all documents in the database will have the same schema
        let firstSchema = documents[0]._schema,
            useFields = fields && Array.isArray(fields) && fields.length;

        docClassToIdPopTargetMap.clear();

        // Handle multi-reference keys (example schema: { myDocs: [MyDocumentClass] })
        for (const key of firstSchema[REF_N_KEYS]) {
            if (useFields && fields.indexOf(key) < 0) {
                continue;
            }
            for (const doc of documents) {
                let referencedIds = doc[key];
                if (isArray(referencedIds) && referencedIds.length) {

                    let referencedDocClass = firstSchema[key].type[0],
                        id2popTarget = docClassToIdPopTargetMap.get(referencedDocClass);

                    if (!id2popTarget) {
                        docClassToIdPopTargetMap.set(referencedDocClass, id2popTarget = Object.create(null));
                    }
                    for (const id of referencedIds) {
                        if (id2popTarget[id]) {
                            id2popTarget[id].refNDocsAndProps.push(doc, key);
                        } else {
                            id2popTarget[id] = {
                                refNDocsAndProps: [doc, key],
                                ref1DocsAndProps: []
                            };
                        }
                    }
                    doc[key] = [];  // flush the ids -> referenced values are pushed in later instead 
                }
            }
        }

        // Handle single reference keys (example schema: { myDoc: MyDocumentClass })
        for (const key of firstSchema[REF_1_KEYS]) {
            if (useFields && fields.indexOf(key) < 0) {
                continue;
            }
            for (const doc of documents) {
                let referencedId = doc[key];
                if (referencedId && isNativeId(referencedId)) {
                    let referencedDocClass = firstSchema[key].type,
                        id2popTarget = docClassToIdPopTargetMap.get(referencedDocClass);

                    if (!id2popTarget) {
                        docClassToIdPopTargetMap.set(referencedDocClass, id2popTarget = Object.create(null));
                    }
                    if (id2popTarget[referencedId]) {
                        id2popTarget[referencedId].ref1DocsAndProps.push(doc, key);
                    } else {
                        id2popTarget[referencedId] = {
                            refNDocsAndProps: [],
                            ref1DocsAndProps: [doc, key]
                        };
                    }
                }
            }
        }

        let loadPromises = [];

        for (const [docClass, id2popTarget] of docClassToIdPopTargetMap.entries()) {
             loadPromises.push(docClass.find({_id: {$in: Object.keys(id2popTarget)}}, {populate: false}).then(foundDocs => {
                 for (const foundDoc of foundDocs) {
                     let {ref1DocsAndProps, refNDocsAndProps} = id2popTarget[foundDoc._id];
                     for (let i = 0, len = ref1DocsAndProps.length; i < len; i++) {
                         let targetDoc = ref1DocsAndProps[i],
                             targetProp = ref1DocsAndProps[++i];
                         targetDoc[targetProp] = foundDoc;
                     }
                     for (let i = 0, len = refNDocsAndProps.length; i < len; i++) {
                         let targetDoc = refNDocsAndProps[i],
                             targetProp = refNDocsAndProps[++i];
                         targetDoc[targetProp].push(foundDoc);
                     }
                 }
             }));
        }

        // ...and finally execute all promises and return our fully loaded documents.
        return Promise.all(loadPromises).then(() => docOrDocs);
    }

    /**
     * Get default value
     *
     * @param {String} schemaProp Key of current schema
     * @returns {*}
     */
    getDefault(schemaProp) {
        if (schemaProp === '_id') {
            return null;
        }
        if (schemaProp in this._schema && 'default' in this._schema[schemaProp]) {
            let def = this._schema[schemaProp].default,
                defVal = typeof def === 'function' ? def() : def;

            this[schemaProp] = defVal;  // TODO: Wait... should we be assigning it here?
            return defVal;
        }

        return undefined;
    }

    /**
     * For JSON.Stringify
     *
     * @returns {*}
     */
    toJSON() {
        let values = this._toData({_id: true});
        let schema = this._schema;
        for (let key in schema) {
            if (hasOwnProp(schema, key)) {
                if (schema[key].private) {
                    delete values[key];
                } else if (values[key] && values[key].toJSON) {
                    values[key] = values[key].toJSON();
                } else if (isArray(values[key])) {
                    let newArray = [];
                    values[key].forEach(function (i) {
                        if (i && i.toJSON) {
                            newArray.push(i.toJSON());
                        } else {
                            newArray.push(i);
                        }
                    });
                    values[key] = newArray;
                }
            }
        }

        return values;
    }

    /**
     * TODO refactor
     * @param {?Object} [keep]
     * @returns {{}}
     * @private
     */
    _toData(keep) {
        if (keep === undefined || keep === null) {
            keep = {};
        } else if (keep._id === undefined) {
            keep._id = true;
        }

        let values = {};
        for (const key of Object.keys(this)) {
            if (key[0] === '_') {
                if (key !== '_id' || !keep._id) {
                    continue;
                }
                values[key] = this[key];
            } else if (isEmbeddedDocument(this[key])) {
                values[key] = this[key]._toData();
            } else if (isArray(this[key]) && this[key].length > 0 && isEmbeddedDocument(this[key][0])) {
                values[key] = [];
                this[key].forEach(function (v) {
                    values[key].push(v._toData());
                });
            } else {
                values[key] = this[key];
            }
        }

        return values;
    }

    // TODO refactor
    /**  add Set for embeddable key names to schema (analog to {@link REF_1_KEYS}) */
    _getEmbeddeds() {
        let embeddeds = [];
        for (const v of Object.keys(this._schema)) {
            if (isEmbeddedDocument(this._schema[v].type) || 
                (isArray(this._schema[v].type) && isEmbeddedDocument(this._schema[v].type[0]))) {
                embeddeds = embeddeds.concat(this[v]);
            }
        }
        return embeddeds;
    }

    _getHookPromises(hookName) {
        let embeddeds = this._getEmbeddeds();

        let hookPromises = [];
        hookPromises = hookPromises.concat(_.invokeMap(embeddeds, hookName));
        hookPromises.push(this[hookName]());
        return hookPromises;
    }

}

BaseDocument[IS_BASE_DOCUMENT] = true;
BaseDocument.prototype[IS_BASE_DOCUMENT] = true;
