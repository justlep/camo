import {
    IS_BASE_DOCUMENT,
    IS_DOCUMENT, IS_EMBEDDED,
    SCHEMA_1PROP_KEYS,
    SCHEMA_ALL_KEYS, SCHEMA_ARRAY_KEYS,
    SCHEMA_IS_EMBED_ARRAY,
    SCHEMA_NON_REF_EMBD_KEYS, SCHEMA_REF_1_KEYS,
    SCHEMA_REF_EMBD_KEYS, SCHEMA_REF_N_KEYS
} from './symbols.js';
import {isArray, isNumber} from './validate.js';

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
    for (const key of Object.keys(doc._schema)) {
        schema[key] = doc._schema[key];
    }

    /** @type {string[]} - keys which reference 1 Document-type entity */
    schema[SCHEMA_REF_1_KEYS] = [];
    /** @type {string[]} - keys which reference arrays of Document-type entities */
    schema[SCHEMA_REF_N_KEYS] = [];
    /** @type {string[]} - keys which reference single or arrays of Embedded-type entities */
    schema[SCHEMA_REF_EMBD_KEYS] = [];
    /** @type {string[]} - keys of array properties */
    schema[SCHEMA_ARRAY_KEYS] = [];
    /** @type {string[]} - keys of non-array properties */
    schema[SCHEMA_1PROP_KEYS] = [];

    for (const docProp of Object.keys(doc)) {
        if (docProp[0] === '_') {
            continue; // ignore private variables
        }

        let isEmbeddedArrayType = false;

        // Normalize the type format
        let propVal = doc[docProp];
        
        if (propVal?.type) {
            assertValidSchemaEntry(docProp, propVal, false);
            schema[docProp] = propVal;
        } else {
            schema[docProp] = {type: propVal};
            assertValidSchemaEntry(docProp, schema[docProp], true);
        }

        let schemaType = schema[docProp].type;

        // Assign a default if needed
        if (isArray(schemaType)) {
            schema[SCHEMA_ARRAY_KEYS].push(docProp);
            if (schemaType[0]?.[IS_DOCUMENT]) {
                schema[SCHEMA_REF_N_KEYS].push(docProp);
            } else if (schemaType[0]?.[IS_EMBEDDED]) {
                schema[SCHEMA_REF_EMBD_KEYS].push(docProp);
                isEmbeddedArrayType = true;
            }
        } else {
            schema[SCHEMA_1PROP_KEYS].push(docProp);
            if (schemaType[IS_DOCUMENT]) {
                schema[SCHEMA_REF_1_KEYS].push(docProp);
            } else if (schemaType[IS_EMBEDDED]) {
                schema[SCHEMA_REF_EMBD_KEYS].push(docProp);
            }
        }

        /** attaching embed-array info to each entry in the schema, as it's frequently looked up in {@link _fromData()} */
        schema[docProp][SCHEMA_IS_EMBED_ARRAY] = isEmbeddedArrayType;
    }
    /** @type {string[]} - caching all keys of the schema since Object.keys(schema) is ~90% slower than schema[SCHEMA_ALL_KEYS]  */
    schema[SCHEMA_ALL_KEYS] = Object.keys(schema);
    /** @type {string[]} - an non-embedded keys, i.e. SCHEMA_NON_REF_EMBD_KEYS + SCHEMA_REF_EMBD_KEYS === SCHEMA_ALL_KEYS */
    schema[SCHEMA_NON_REF_EMBD_KEYS] = schema[SCHEMA_ALL_KEYS].filter(key => !~schema[SCHEMA_REF_EMBD_KEYS].indexOf(key));
    // if (!schema[SCHEMA_ALL_KEYS].every(key => schema[SCHEMA_NON_REF_EMBD_KEYS].includes(key) ^ schema[SCHEMA_REF_EMBD_KEYS].includes(key))) {
    //     throw new Error('hmm, every key should be either in ref-embd keys XOR non-ref-embd keys');
    // }
    return schema;
};


/**
 * @param {*} t
 * @return {boolean}
 */
const isSupportedType = (t) =>  t === String || t === Number || t === Boolean || t === Buffer || t === Date || t === Array ||
                                isArray(t) || t === Object || t instanceof Object || !!(t && t[IS_BASE_DOCUMENT]);

/**
 * @typedef {Object.<string, CamoSchemaEntry>} CamoSchema - a mapping a string keys to descriptors about the key's value
 */

/**
 * @typedef {Object} CamoSchemaEntry - an Object specifying the value type & limitations of a Document property 
 * @property {*} type - some constructor of a supported type
 * @property {function(*):boolean} [validate] custom validator function; returning true means value is fine  
 * @property {CamoDefaultValueCreator|*} [default] - a function generating a default value, or a default value itself
 * @property {boolean} [unique] - if true, a database unique index will be ensured for the respective field
 * @property {boolean} [private]
 * @property {boolean} [required]
 * @property {number} [min] - max value for numbers
 * @property {number} [max] - max value for numbers // TODO check: for Dates as well?
 * @property {*[]} [choices] - array of allowed values
 * @property {RegExp} [match]
 */

const ALLOWED_SCHEMA_PROPS = new Set(['type', 'validate', 'default', 'unique', 'private', 'required', 'min', 'max', 'choices', 'match']); 

/**
 * @param {string} docProp - the property name in the checked Document
 * @param {CamoSchemaEntry} o 
 * @param {boolean} onlyType - if true, check only the `type` property but not the optional props 
 * @throws {Error} if invalid
 */
function assertValidSchemaEntry(docProp, o, onlyType) {
    if (!isSupportedType(o.type)) {
        throw new Error(`Unsupported type or bad variable for property "${docProp}". `+
                        `Remember, non-persisted objects must start with an underscore (_). Got: ${o.type}`);
    }
    if (onlyType) {
        return;
    }
    for (const key of Object.keys(o)) {
        if (!ALLOWED_SCHEMA_PROPS.has(key)) {
            throw new Error(`Unknown schema property "${key}". Allowed properties are: ${[...ALLOWED_SCHEMA_PROPS].join(', ')}`);
        }
    }
    if (o.validate && typeof o.validate !== 'function') {
        throwInvalidOptSchemaKeyValue(docProp, 'validate', 'function', o.validate);
    }
    // not checking o.default here since it can be pretty much anything and will eventually be checked during instance validation
    for (const schemaProp of ['unique', 'private', 'required']) {
        let t = typeof o[schemaProp];
        if (t !== 'undefined' && t !== 'boolean') {
            throwInvalidOptSchemaKeyValue(docProp, schemaProp, 'boolean', o[schemaProp]);
        }
    }
    if (typeof o.choices !== 'undefined' && !isArray(o.choices)) {
        throwInvalidOptSchemaKeyValue(docProp, 'choices', 'Array', o.choices);
    }
    for (const prop of ['min', 'max']) {
        let t = typeof o[prop];
        if (t !== 'undefined' && !isNumber(o[prop])) {
            throwInvalidOptSchemaKeyValue(docProp, prop, 'number', o[prop]);
        }
    }
    if (typeof o.match !== 'undefined' && !(o.match instanceof RegExp)) {
        throwInvalidOptSchemaKeyValue(docProp, 'match', 'RegExp', o.match);
    }
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
