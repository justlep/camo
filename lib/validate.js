import {isNativeId} from './client.js';
import {IS_DOCUMENT, IS_EMBEDDED} from './symbols.js';
import {types} from 'node:util';

export const isNumber = (n) => typeof n === 'number' && Number.isFinite(n);

export const isDate = types.isDate;

export const isArray = Array.isArray;

/**
 * Wherever possible (i.e. null-safe), use o[IS_DOCUMENT] instead.
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

/**
 * Error indicating document didn't pass validation.
 */
export class ValidationError extends Error {
    constructor(instance, key, textForKey) {
        super(`Value for ${instance.constructor.name}.${key} ${textForKey}`);
        this.name = 'ValidationError';
        Error.captureStackTrace(this, ValidationError);
    }
}
