import {BaseDocument} from './base-document.js';
import {IS_EMBEDDED} from './symbols.js';

export class EmbeddedDocument extends BaseDocument {
    static SCHEMA = {};
}

EmbeddedDocument[IS_EMBEDDED] = true;
EmbeddedDocument.prototype[IS_EMBEDDED] = true;
