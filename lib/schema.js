import {
    IS_DOCUMENT, IS_EMBEDDED,
    SCHEMA_1PROP_KEYS,
    SCHEMA_ALL_KEYS, SCHEMA_ARRAY_KEYS,
    SCHEMA_IS_EMBED_ARRAY,
    SCHEMA_NON_REF_EMBD_KEYS, SCHEMA_REF_1_KEYS,
    SCHEMA_REF_EMBD_KEYS, SCHEMA_REF_N_KEYS
} from './symbols.js';
import {isSupportedType, isArray} from './validate.js';

/**
 * Generate a schema for this instance.
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

    for (const key of Object.keys(doc)) {
        if (key[0] === '_') {
            continue; // ignore private variables
        }

        let isEmbeddedArrayType = false;

        // Normalize the type format
        let propVal = doc[key];
        if (propVal.type) {
            schema[key] = propVal;
        } else if (isSupportedType(propVal)) {
            schema[key] = {type: propVal};
        } else {
            throw new Error(`Unsupported type or bad variable. Remember, non-persisted objects must start with an underscore (_). Got: ${propVal}`);
        }

        let schemaType = schema[key].type;

        // Assign a default if needed
        if (isArray(schemaType)) {
            schema[SCHEMA_ARRAY_KEYS].push(key);
            if (schemaType[0]?.[IS_DOCUMENT]) {
                schema[SCHEMA_REF_N_KEYS].push(key);
            } else if (schemaType[0]?.[IS_EMBEDDED]) {
                schema[SCHEMA_REF_EMBD_KEYS].push(key);
                isEmbeddedArrayType = true;
            }
        } else {
            schema[SCHEMA_1PROP_KEYS].push(key);
            if (schemaType[IS_DOCUMENT]) {
                schema[SCHEMA_REF_1_KEYS].push(key);
            } else if (schemaType[IS_EMBEDDED]) {
                schema[SCHEMA_REF_EMBD_KEYS].push(key);
            }
        }

        /** attaching embed-array info to each entry in the schema, as it's frequently looked up in {@link _fromData()} */
        schema[key][SCHEMA_IS_EMBED_ARRAY] = isEmbeddedArrayType;
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
 * @typedef {Object.<string, CamoSchemaKeyInfo>} CamoSchema - a mapping a string keys to descriptors about the key's value
 */

/**
 * @typedef {Object} CamoSchemaKeyInfo
 * @property {typeof Function} type - some constructor of a supported type
 * @property {CamoDefaultValueCreator|*} [default] - a function generating a default value, or a default value itself
 * @property {boolean} [unique] - if true, a database unique index will be ensured for the respective field
 * @property {*[]} [choices] - array of allowed values
 * @property {number} [min] - max value for numbers
 * @property {number} [max] - max value for numbers // TODO check: for Dates as well?
 */

/**
 * @callback CamoDefaultValueCreator
 * @return *
 */
