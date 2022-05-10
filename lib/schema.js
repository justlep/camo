import {
    IS_BASE_DOCUMENT, ST_IS_CUSTOM_TYPE,
    IS_DOCUMENT, IS_EMBEDDED, ST_IS_TYPED_ARRAY,
    SCHEMA_1PROP_KEYS,
    SCHEMA_ALL_KEYS, SCHEMA_ARRAY_KEYS,
    ST_IS_EMBED_ARRAY,
    SCHEMA_NON_REF_EMBD_KEYS, SCHEMA_REF_1_DOC_KEYS, SCHEMA_REF_1_OR_N_EMBD_KEYS,
    SCHEMA_REF_N_DOCS_KEYS, SCHEMA_ALL_ENTRIES, SCHEMA_BASIC_FROM_DATA, SCHEMA_ALL_ENTRIES_NO_ID, SCHEMA_ALL_ENTRIES_FOR_JSON
} from './symbols.js';
import {isArray, isDate, isNumber} from './validate.js';
import {isNativeId} from './client.js';
import {deprecate} from './util.js';

/**
 * Generate a schema for this instance.
 * 
 * @param {BaseDocument} doc
 * @return {CamoSchema}
 */
export const generateSchemaForDocument = (doc) => {
    /** @type {CamoSchema} */
    let schema = Object.create(null);

    // Assumption: schemas of Document subclasses are immutable at runtime, 
    //  so it should be safe to use a shallow copy of the next best _schema off the prototype chain
    for (const key of doc._schema[SCHEMA_ALL_KEYS]) { // NOT Object.keys() since we need _id from the prototype
        schema[key] = doc._schema[key];
    }

    /** @type {string[]} */
    const schemaKeys = [];
    
    /** @type {Object} the schema source object, preferably the overridden static SCHEMA field, or as fallback the instance itself */
    const src = (typeof doc.constructor.SCHEMA === 'function' ? doc.constructor.SCHEMA() : doc.constructor.SCHEMA) || doc;
    
    if (src === doc) {
        deprecate(`Defining schemas in constructors is deprecated. Override static field ${doc.constructor.name}.SCHEMA instead.`);
    }
    
    for (const docProp of Object.keys(src)) {
        if (docProp[0] === '_') {
            continue; // ignore private variables
        }

        let propVal = src[docProp];

        if (propVal?.type) {
            schema[docProp] = assertValidSchemaEntry(docProp, propVal, false);
        } else {
            schema[docProp] = assertValidSchemaEntry(docProp, {type: propVal}, true);
        }
        
        schemaKeys.push(docProp);
    }
    
    /** @type {string[]} - caching all keys of the schema since Object.keys(schema) is ~90% slower than schema[SCHEMA_ALL_KEYS]  */
    schema[SCHEMA_ALL_KEYS] = schemaKeys;
    /** @type {string[]} - keys which reference 1 Document-type entity */
    schema[SCHEMA_REF_1_DOC_KEYS] = schemaKeys.filter(k => schema[k].type[IS_DOCUMENT]); 
    /** @type {string[]} - keys which reference arrays of Document-type entities */
    schema[SCHEMA_REF_N_DOCS_KEYS] = schemaKeys.filter(k => schema[k].type[ST_IS_TYPED_ARRAY] && schema[k].type.elementType[IS_DOCUMENT]);
    /** @type {string[]} - keys which reference single OR arrays of Embedded-type entities */
    schema[SCHEMA_REF_1_OR_N_EMBD_KEYS] = schemaKeys.filter(k => schema[k].type[IS_EMBEDDED] || schema[k].type.elementType?.[IS_EMBEDDED]);
    /** @type {string[]} - keys of array properties */
    schema[SCHEMA_ARRAY_KEYS] = schemaKeys.filter(k => schema[k].type[ST_IS_TYPED_ARRAY]);
    /** @type {string[]} - keys of non-array properties */
    schema[SCHEMA_1PROP_KEYS] = schemaKeys.filter(k => !schema[k].type[ST_IS_TYPED_ARRAY]);

    /** @type {string[]} - an non-embedded keys, i.e. SCHEMA_NON_REF_EMBD_KEYS + SCHEMA_REF_EMBD_KEYS === SCHEMA_ALL_KEYS */
    schema[SCHEMA_NON_REF_EMBD_KEYS] = schemaKeys.filter(k => !~schema[SCHEMA_REF_1_OR_N_EMBD_KEYS].indexOf(k));
    // if (!schema[SCHEMA_ALL_KEYS].every(key => schema[SCHEMA_NON_REF_EMBD_KEYS].includes(key) ^ schema[SCHEMA_REF_EMBD_KEYS].includes(key))) {
    //     throw new Error('hmm, every key should be either in ref-embd keys XOR non-ref-embd keys');
    // }
    
    /** @type {CamoSchemaEntry[]} */
    schema[SCHEMA_ALL_ENTRIES] = Object.values(schema);
    /** @type {CamoSchemaEntry[]} */
    schema[SCHEMA_ALL_ENTRIES_NO_ID] = schema[SCHEMA_ALL_ENTRIES].filter(en => en._key !== '_id'); 
    /** @type {CamoSchemaEntry[]} */
    schema[SCHEMA_ALL_ENTRIES_FOR_JSON] = schema[SCHEMA_ALL_ENTRIES].filter(en => !en.private); 
    
    if (doc[IS_EMBEDDED] && (schema[SCHEMA_REF_N_DOCS_KEYS].length + schema[SCHEMA_REF_1_DOC_KEYS].length)) {
        /** forbid for now, as {@link Document.save} won't handle this case currently */ 
        throw new Error(`EmbeddedDocument classes must not have Document-type references (found in: ${doc.constructor.name})`);  
    }
    
    return schema;
};


/**
 * @typedef {Object.<string, CamoSchemaEntry>} CamoSchema - a mapping a string keys to descriptors about the key's value
 */

/**
 * @typedef {Object} CamoSchemaEntry - an Object specifying the value type & limitations of a Document property 
 * @property {*|TypedArrayType|CustomType} type - some constructor of a supported type
 * @property {function(*):boolean} [validate] custom validator function; returning true means value is fine,
 *                                            (!) required for custom types (Object/[]/Array)
 * @property {CamoDefaultValueCreator|*} [default] - a function generating a default value, or a default value itself
 * @property {boolean} [unique] - if true, a database unique index will be ensured for the respective field
 * @property {boolean} [private]
 * @property {boolean} [required]
 * @property {number} [min] - max value for numbers
 * @property {number} [max] - max value for numbers // TODO check: for Dates as well?
 * @property {*[]} [choices] - array of allowed values
 * @property {RegExp} [match]
 * @property {function(*):*} [toData] - required and only allowed for custom types (Object/[]/Array),
*                                       transforms the current value into an Object to be stored in the database,
 * @property {function(*):*} [fromData] - required and only allowed for custom types (Object/[]/Array),
 *                                        transforms saved value from the database back to a document instance' property value
 * @property {string} _key - filled during schema creation                                       
 */

const ALLOWED_SCHEMA_PROPS = new Set(['type', 'validate', 'default', 'unique', 'private', 'required', 'min', 'max', 'choices', 'match']); 

const isSupportedBasicType = t => t === String || t === Number || t === Boolean || t === Buffer || t === Date || t?.[IS_BASE_DOCUMENT];

/**
 * @param {string} docProp - the property name in the checked Document
 * @param {CamoSchemaEntry} entry 
 * @param {boolean} onlyType - if true, check only the `type` property but not the optional props
 * @return {CamoSchemaEntry} the given entry (o) if valid
 * @throws {Error} if invalid
 */
function assertValidSchemaEntry(docProp, entry, onlyType) {
    let t = entry.type;
    if (isSupportedBasicType(t)) {
        entry[SCHEMA_BASIC_FROM_DATA] = getFromDataMapperFnForClass(t);
        
    } else if (t === Array || t === Object || isArray(t) && !t.length) {
        // wildcard-types, see https://github.com/justlep/camo/issues/1
        // auto-deletes 'fromData' + 'toData' from o
        entry.type = new CustomType(entry, docProp);  
    } else if (isArray(t)) {
        entry.type = new TypedArrayType(entry, docProp);
    } else {
        throw new Error(`Unsupported type or bad variable for property "${docProp}". `+
            `Remember, non-persisted objects must start with an underscore (_). Got: ${t}`);
    }
    
    if (onlyType) {
        entry._key = docProp;
        return entry;
    }
    
    for (const key of Object.keys(entry)) {
        if (!ALLOWED_SCHEMA_PROPS.has(key)) {
            throw new Error(`Unknown schema property "${key}". Allowed properties are: ${[...ALLOWED_SCHEMA_PROPS].join(', ')}`);
        }
    }
    if (entry.validate && typeof entry.validate !== 'function') {
        throwInvalidOptSchemaKeyValue(docProp, 'validate', 'function', entry.validate);
    }

    if (entry.type === Date && typeof entry.default !== 'undefined') {
        let defaultValueOrFn = entry.default,
            needsCheck = true;
        if (typeof defaultValueOrFn === 'function') {
            entry.default = () => ensureDate(defaultValueOrFn());
            needsCheck = false;
        } else if (typeof defaultValueOrFn === 'string' || isNumber(defaultValueOrFn)) {
            entry.default = ensureDate(defaultValueOrFn);
        }
        if (needsCheck && !(entry.default instanceof Date)) {
            throwInvalidOptSchemaKeyValue(docProp, 'default', 'function|Date|number|string', defaultValueOrFn);
        }
    }
    
    for (const prop of ['unique', 'private', 'required']) {
        let val = entry[prop];
        if (val !== undefined && val !== true && val !== false) {
            throwInvalidOptSchemaKeyValue(docProp, prop, 'boolean', val);
        }
    }
    if (typeof entry.choices !== 'undefined') {
        if (!isArray(entry.choices) || !entry.choices.length) {
            throwInvalidOptSchemaKeyValue(docProp, 'choices', 'Array', entry.choices);
        }
        if (t !== String && t !== Number && t !== Date) {
            throw new Error(`Schema property "choices" is only available for types Number|String|Date, but was used for ${t.name}`);
        }
    }
    if (entry.min !== undefined || entry.max !== undefined) {
        for (const prop of ['min', 'max']) {
            let val = entry[prop];
            if (typeof val !== 'undefined') {
                if (!isNumber(val) && !isDate(val)) {
                    throwInvalidOptSchemaKeyValue(docProp, prop, 'number', val);
                }
                if (t !== Number && t !== Date) {
                    throw new Error(`Schema property "${prop}" "is only available for types Number|Date, but was used for ${t.name}`);
                }
            }
        }
    }
    if (typeof entry.match !== 'undefined') {
        if (!(entry.match instanceof RegExp)) {
            throwInvalidOptSchemaKeyValue(docProp, 'match', 'RegExp', entry.match);
        }
        if (t !== String && !(t[ST_IS_TYPED_ARRAY] && t.elementType === String)) {
            throw new Error(`Schema property "match" is only available for types String|String[], but was used for ${t.name}`);
        }
    }
    entry._key = docProp;
    return entry;
}

/**
 * @param {string} docProp
 * @param {string} schemaProp
 * @param {string} expected
 * @param {*} actual
 * @return {*}
 */
const throwInvalidOptSchemaKeyValue = (docProp, schemaProp, expected, actual) => {
    throw new Error(`Invalid value for schema.${schemaProp} of Document.${docProp} property. Expected ${expected}, but got ${typeof actual}`);
};

/**
 * @callback CamoDefaultValueCreator
 * @return *
 */

/**
 * Represents a non-basic and non-Document-like custom (wildcard) type for a schema entry.
 * Validation and JSON-transforms are responsibility of the user.
 * That's why this entry type requires explicit, additional function properties 'validate', 'toData', 'fromData',
 * in the raw schema entry.
 * 
 * @param {CamoSchemaEntry} entry
 * @param {string} docProp
 * @constructor
 */
function CustomType(entry, docProp) {
    let typesString = ['toData', 'fromData', 'validate'].map(fnName => typeof entry[fnName]).join(',');
    if (typesString !== 'function,function,function') {
        throw new Error(`Document property '${docProp}' is custom-type, requiring [toData,fromData,validate] function schema properties, but got [${typesString}]`);
    }
    this.toData = entry.toData;
    delete entry.toData;
    this.fromData = entry.fromData;
    delete entry.fromData;
    this.validate = entry.validate;
    entry[ST_IS_CUSTOM_TYPE] = true;
    this[ST_IS_CUSTOM_TYPE] = true;
}

/**
 *
 * @param {CamoSchemaEntry} entry
 * @param {string} docProp
 * @constructor
 */
function TypedArrayType(entry, docProp) {
    let t = entry.type;
    if (t.length !== 1) {
        throw new Array(`Schema definition for array property ${docProp} must contain 1 element, but has ${t.length}`);
    }
    let firstElem = t[0];
    
    if (!isSupportedBasicType(firstElem)) {
        throw new Error(`Document property '${docProp}' is array-type with custom-type elements. `+
                        `Custom-type Object/Array entries must be defined as: {${docProp}: {type: Object, validate: {function}, fromData: {function}, toData: {function}}}`);
    } 
    this.elementType = firstElem;
    
    this.mapFromData = getFromDataMapperFnForClass(firstElem);
    
    entry[ST_IS_TYPED_ARRAY] = true;
    this[ST_IS_TYPED_ARRAY] = true;
    if (firstElem[IS_EMBEDDED]) {
        entry[ST_IS_EMBED_ARRAY] = true;
        this[ST_IS_EMBED_ARRAY] = true;
    }
}

const idem = v => v;
const undef = () => void 0;

/**
 * @param {typeof Function|typeof BaseDocument} clazz
 * @return {function(*):*}
 */
const getFromDataMapperFnForClass = clazz => {
    switch (clazz) {
        case String:
        case Number:
        case Boolean:
            return idem;
        case Date:
            return n => (isNumber(n) || typeof n === 'string') ? new Date(n) : n instanceof Date ? n : undefined;
        case Buffer:
            // TODO check if we really need instanceof-check
            return s => typeof s === 'string' ? Buffer.from(s) : s instanceof Buffer ? s : undefined;
    }
    if (clazz[IS_EMBEDDED]) {
        // TODO check if we really need instanceof-check
        return (o) => o ? (o instanceof clazz ? o : clazz._fromData(o)) : undefined;
    }
    if (clazz[IS_DOCUMENT]) {
        // TODO check if we really need instanceof-check
        return (o) => o ? (isNativeId(o) ? o : o instanceof clazz ? o : clazz._fromData(o)) : undefined;
    }
    return undef;
};

/**
 * @return {function(*): Date}
 */
const ensureDate = getFromDataMapperFnForClass(Date);
