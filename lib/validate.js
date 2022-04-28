import _ from 'lodash';
import {getClientInstance as DB} from './client.js';

export const isString = (s) => _.isString(s);

export const isNumber = function (n) {
    return _.isNumber(n) && _.isFinite(n) && !isString(n);
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

export const isArray = function (a) {
    return _.isArray(a);
};

export const isDocument = function (m) {
    return m && m.documentClass && m.documentClass() === 'document';
};

export const isEmbeddedDocument = function (e) {
    return e && e.documentClass && e.documentClass() === 'embedded';
};

export const isReferenceable = function (r) {
    return isDocument(r) || isNativeId(r);
};

export const isNativeId = function (n) {
    return DB().isNativeId(n);
};

export const isSupportedType = function (t) {
    return (t === String || t === Number || t === Boolean ||
        t === Buffer || t === Date || t === Array ||
        isArray(t) || t === Object || t instanceof Object ||
        typeof t.documentClass === 'function');
};

export const isType = function (value, type) {
    if (type === String) {
        return isString(value);
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
    } else if (type.documentClass && type.documentClass() === 'document') {
        return isDocument(value) || DB().isNativeId(value);
    } else if (type.documentClass && type.documentClass() === 'embedded') {
        return isEmbeddedDocument(value);
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
            for (let i = 0; i < value.length; i++) {
                let v = value[i];
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

export const isInChoices = function (choices, choice) {
    if (!choices) {
        return true;
    }
    return choices.indexOf(choice) > -1;
};

export const isEmptyValue = function (value) {
    return typeof value === 'undefined' || (!(typeof value === 'number' || value instanceof Date || typeof value === 'boolean')
        && !Object.keys(value).length);
};
