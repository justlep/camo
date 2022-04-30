import _ from 'lodash';
import {getClientInstance as DB, isNativeId} from './client.js';
import {IS_BASE_DOCUMENT, IS_DOCUMENT, IS_EMBEDDED} from './symbols.js';

export const isNumber = function (n) {
    return _.isNumber(n) && _.isFinite(n) && typeof n !== 'string';
};

export const isBoolean = function (b) {
    return _.isBoolean(b);
};

export const isDate = function (d) {
    return isNumber(d) || _.isDate(d) || isNumber(Date.parse(d));
};

export const isBuffer = function (b) {
    return typeof b === 'object' || b instanceof Buffer;
};

export const isObject = function (o) {
    return _.isObject(o);
};

export const isArray = Array.isArray;

/**
 * Wherever possible (i.e. null-safe), use o[IS_DOCUMENT] instead
 * @param {*} o
 * @return {boolean}
 */
export const isDocument = (o) => !!(o && o[IS_DOCUMENT]);

/**
 * Wherever possible (i.e. null-safe), use o[IS_EMBEDDED] instead
 * @param {*} o
 * @return {boolean}
 */
export const isEmbeddedDocument = (o) => !!(o && o[IS_EMBEDDED]);

/**
 * @param {*} o
 * @return {boolean}
 */
export const isReferenceable = (o) => !!(o && (o[IS_DOCUMENT] || isNativeId(o))); 


export const isSupportedType = function (t) {
    return t === String || t === Number || t === Boolean ||
           t === Buffer || t === Date || t === Array ||
           isArray(t) || t === Object || t instanceof Object ||
           !!(t && t[IS_BASE_DOCUMENT]);
};

/**
 * @param {*} value - value, never null or undefined
 * @param {Object} type
 * @return {boolean} 
 */
export const isType = function (value, type) {
    if (type === String) {
        return typeof value === 'string';
    } else if (type === Number) {
        return isNumber(value);
    } else if (type === Boolean) {
        return isBoolean(value);
    } else if (type === Buffer) {
        return isBuffer(value);
    } else if (type === Date) {
        return isDate(value);
    } else if (type === Array || isArray(type)) {
        return isArray(value);
    } else if (type === Object) {
        return isObject(value);
    } else if (type[IS_DOCUMENT]) {
        return !!value[IS_DOCUMENT] || isNativeId(value);
    } else if (type[IS_EMBEDDED]) {
        return !!value[IS_EMBEDDED];
    } else if (type === DB().nativeIdType()) {
        return isNativeId(value);
    } 
    throw new Error('Unsupported type: ' + type.name);
};

export const isValidType = function (value, type) {
    // NOTE
    // Maybe look at this: 
    // https://github.com/Automattic/mongoose/tree/master/lib/types

    // TODO: For now, null is okay for all types. May
    // want to specify in schema using 'nullable'?
    if (value === null) {
        return true;
    }

    // Issue #9: To avoid all model members being stored
    // in DB, allow undefined to be assigned. If you want
    // unassigned members in DB, use null.
    if (value === undefined) {
        return true;
    }

    // Arrays take a bit more work
    if (type === Array || isArray(type)) {
        // Validation for types of the form [String], [Number], etc
        if (isArray(type) && type.length > 1) {
            throw new Error(`Unsupported type. Only one type can be specified in arrays, but multiple found: ${type}`);
        }

        if (isArray(type) && type.length === 1 && isArray(value)) {
            let arrayType = type[0];
            for (const v of value) {
                if (!isType(v, arrayType)) {
                    return false;
                }
            }
        } else if (isArray(type) && type.length === 0 && !isArray(value)) {
            return false;
        } else if (type === Array && !isArray(value)) {
            return false;
        }

        return true;
    }

    return isType(value, type);
};

/**
 * @param {*[]} choices
 * @param {*} choice
 * @return {boolean}
 */
export const isInChoices = (choices, choice) => choices ? ~choices.indexOf(choice) : true;


export const isEmptyValue = function (value) {
    return typeof value === 'undefined' || (!(typeof value === 'number' || value instanceof Date || typeof value === 'boolean')
        && !Object.keys(value).length);
};


/**
 * Error indicating document didn't pass validation.
 */
export class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
        Error.captureStackTrace(this, ValidationError);
    }
}
