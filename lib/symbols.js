
export const COLLECTION_NAME = Symbol('collName');

export const IS_BASE_DOCUMENT = Symbol('isDocOrEmb');
export const IS_DOCUMENT = Symbol('isDoc');
export const IS_EMBEDDED = Symbol('isEmb');

// ST_ prefix === SCHEMA_TYPE_*
export const ST_IS_CUSTOM_TYPE = Symbol('isCustomType');
export const ST_IS_TYPED_ARRAY = Symbol('isTypedArray');
export const ST_IS_EMBED_ARRAY = Symbol('s_Embed[]');

export const SCHEMA_REF_1_DOC_KEYS = Symbol('s_ref1');
export const SCHEMA_REF_N_DOCS_KEYS = Symbol('s_refN');
export const SCHEMA_ARRAY_KEYS = Symbol('s_arr');
export const SCHEMA_1PROP_KEYS = Symbol('s_1');
export const SCHEMA_ALL_KEYS = Symbol('s_keys');
export const SCHEMA_REF_1_OR_N_EMBD_KEYS = Symbol('s_ref');

export const SCHEMA_ALL_ENTRIES = Symbol('s_entries');
export const SCHEMA_ALL_ENTRIES_NO_ID = Symbol('s_entries_noid');
export const SCHEMA_ALL_ENTRIES_FOR_JSON = Symbol('s_entries_json');

export const SCHEMA_BASIC_FROM_DATA = Symbol('s_basicFromData');
