import {Document} from '../lib/document.js';
import {initMochaHooksForNedb} from './database.js';
import {EmbeddedDocument} from '../lib/embedded-document.js';
import {expect, assert} from 'chai';
import {
    ST_IS_CUSTOM_TYPE,
    ST_IS_TYPED_ARRAY,
    SCHEMA_ALL_KEYS,
    SCHEMA_ARRAY_KEYS,
    ST_IS_EMBED_ARRAY, SCHEMA_NON_REF_EMBD_KEYS, SCHEMA_REF_1_DOC_KEYS,
    SCHEMA_REF_1_OR_N_EMBD_KEYS, SCHEMA_REF_N_DOCS_KEYS
} from '../lib/symbols.js';

describe('Document', function () {

    initMochaHooksForNedb();

    describe('schema generation', function () {
        it('should work for basic types', function () {

            class Emb extends EmbeddedDocument {
                static SCHEMA = {
                    foo: Number
                };
            }
            
            class User extends Document {
                static SCHEMA = {
                    titles: [String],
                    firstName: String,
                    lastName: String,
                    embs: [Emb]
                };
            }

            let user = User.create(),
                s = user._schema;
            
            assert.isObject(s);
            assert.isObject(s.titles);
            assert.isTrue(s.titles[ST_IS_TYPED_ARRAY]);
            assert.isTrue(s.titles.type[ST_IS_TYPED_ARRAY]);
            assert.isUndefined(s.titles[ST_IS_EMBED_ARRAY]);
            assert.isUndefined(s.titles.type[ST_IS_EMBED_ARRAY]);
            assert.equal(s.titles.type.elementType, String);
            
            assert.isObject(s.firstName);
            assert.isObject(s.lastName);
            assert.equal(s.firstName.type, String);
            assert.equal(s.lastName.type, String);
            assert.isObject(s.embs);
            assert.isTrue(s.embs[ST_IS_EMBED_ARRAY]);
            assert.isTrue(s.embs.type[ST_IS_EMBED_ARRAY]);
            assert.deepEqual(s[SCHEMA_ALL_KEYS], ['titles', 'firstName', 'lastName', 'embs']);
            assert.deepEqual(s[SCHEMA_REF_1_DOC_KEYS], []);
            assert.deepEqual(s[SCHEMA_REF_N_DOCS_KEYS], []);
            assert.deepEqual(s[SCHEMA_REF_1_OR_N_EMBD_KEYS], ['embs']);
            assert.deepEqual(s[SCHEMA_ARRAY_KEYS], ['titles', 'embs']);
            assert.deepEqual(s[SCHEMA_NON_REF_EMBD_KEYS], ['titles', 'firstName', 'lastName']);
        });

        it('should prefer static SCHEMA field over instance as source of truth for schema definition', function () {

            class Emb extends EmbeddedDocument {
                static SCHEMA = {
                    foo: Number
                };
                
                constructor() {
                    super();
                    this.foo = String; // shall be ignored
                }
            }

            class User extends Document {
                static SCHEMA = {
                    titles: [String],
                    firstName: String,
                    lastName: String,
                    embs: [Emb]
                };
                
                constructor() {
                    super();

                    this.titles = Object;     // shall be ignored
                    this.firstName = Boolean; // shall be ignored
                    this.lastName = Array;    // shall be ignored
                    this.embs = String;       // shall be ignored
                }
            }

            let user = User.create({lastName: 'huhu'}),
                s = user._schema;

            user.embs.push(Emb.create({foo: 123}));
            
            assert.isObject(s);
            assert.isObject(s.titles);
            assert.isTrue(s.titles[ST_IS_TYPED_ARRAY]);
            assert.isTrue(s.titles.type[ST_IS_TYPED_ARRAY]);
            assert.isUndefined(s.titles[ST_IS_EMBED_ARRAY]);
            assert.isUndefined(s.titles.type[ST_IS_EMBED_ARRAY]);
            assert.equal(s.titles.type.elementType, String);

            assert.isObject(s.firstName);
            assert.isObject(s.lastName);
            assert.equal(s.firstName.type, String);
            assert.equal(s.lastName.type, String);
            assert.isObject(s.embs);
            assert.isTrue(s.embs[ST_IS_EMBED_ARRAY]);
            assert.isTrue(s.embs.type[ST_IS_EMBED_ARRAY]);
            assert.deepEqual(s[SCHEMA_ALL_KEYS], ['titles', 'firstName', 'lastName', 'embs']);
            assert.deepEqual(s[SCHEMA_REF_1_DOC_KEYS], []);
            assert.deepEqual(s[SCHEMA_REF_N_DOCS_KEYS], []);
            assert.deepEqual(s[SCHEMA_REF_1_OR_N_EMBD_KEYS], ['embs']);
            assert.deepEqual(s[SCHEMA_ARRAY_KEYS], ['titles', 'embs']);
            assert.deepEqual(s[SCHEMA_NON_REF_EMBD_KEYS], ['titles', 'firstName', 'lastName']);
            
            assert.equal(user.firstName, undefined);
            assert.deepEqual(user.titles, []);
            assert.deepEqual(user.embs[0].foo, 123);
            assert.equal(user.lastName, 'huhu');
        });
        
        it('should require toData/fromData/validate function for custom-types', () => {
            
            function makeClassAndExpectErrorOnInstantiate(customPropName, customPropVal, matchErr) {
                class CustomClass extends Document {
                    static SCHEMA = {
                        [customPropName]: customPropVal
                    };
                }
                expect(() => CustomClass.create()).to.throw(matchErr || new RegExp(`${customPropName}.+requiring \\[toData,fromData,validate]`));
            }
            
            makeClassAndExpectErrorOnInstantiate('obj', Object);
            makeClassAndExpectErrorOnInstantiate('emptyArr', []);
            makeClassAndExpectErrorOnInstantiate('arr', Array);
            makeClassAndExpectErrorOnInstantiate('typeArr', {type: Array});
            makeClassAndExpectErrorOnInstantiate('typeEmptyArr', {type: []});
            
            makeClassAndExpectErrorOnInstantiate('objArray', [Object], 'Document property \'objArray\' is array-type with custom-type elements. Custom-type Object/Array entries must be defined as: {objArray: {type: Object, validate: {function}, fromData: {function}, toData: {function}}}');
        });
        
        it('should work with custom types', () => {
            class A extends Document {
                static SCHEMA = {
                    foo: {
                        type: Object,
                        toData: o => o,
                        fromData: o => o,
                        validate: () => true
                    },
                    bar: String
                };
            }
            let a;
            expect(() => a = A.create()).not.to.throw();
            let s = a._schema;
            assert.isObject(s.foo);
            assert.isTrue(s.foo[ST_IS_CUSTOM_TYPE]);
            assert.isTrue(s.foo.type[ST_IS_CUSTOM_TYPE]);
            assert.deepEqual(s[SCHEMA_ALL_KEYS], ['foo', 'bar']);
            assert.deepEqual(s[SCHEMA_REF_1_DOC_KEYS], []);
            assert.deepEqual(s[SCHEMA_REF_N_DOCS_KEYS], []);
            assert.deepEqual(s[SCHEMA_REF_1_OR_N_EMBD_KEYS], []);
            assert.deepEqual(s[SCHEMA_ARRAY_KEYS], []);
            assert.deepEqual(s[SCHEMA_NON_REF_EMBD_KEYS], ['foo', 'bar']);
        });
    });
});