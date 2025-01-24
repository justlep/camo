import {it, describe, expect} from 'vitest';
import {Document} from '../lib/document.js';
import {EmbeddedDocument} from '../lib/embedded-document.js';
import {validateId} from './util.js';
import {initMochaHooksForNedb} from './database.js';
import {
    isDocument,
    isEmbeddedDocument,
    isReferenceable,
    ValidationError
} from '../lib/validate.js';
import {IS_BASE_DOCUMENT, IS_DOCUMENT, IS_EMBEDDED} from '../lib/symbols.js';


describe('Embedded', function () {

    initMochaHooksForNedb();


    describe('general', function () {
        it('should not have an _id', async () => {

            class EmbeddedModel extends EmbeddedDocument {
                static SCHEMA = {
                    str: String
                };
            }

            class DocumentModel extends Document {
                static SCHEMA = {
                    mod: EmbeddedModel,
                    num: Number
                };
            }

            let data = DocumentModel.create();
            data.mod = EmbeddedModel.create();
            data.mod.str = 'some data';
            data.num = 1;

            expect(isDocument(data.mod)).to.be.false;
            expect(isEmbeddedDocument(data.mod)).to.be.true;
            expect(isReferenceable(data.mod)).to.be.false;

            expect(data.mod[IS_DOCUMENT]).to.be.undefined;
            expect(data.mod[IS_EMBEDDED]).to.be.true;
            expect(data.mod[IS_BASE_DOCUMENT]).to.be.true;

            await data.save().then(function () {
                expect(data.mod._id).to.be.undefined;
                return DocumentModel.findOne({num: 1});
            }).then(function (d) {
                expect(d.mod._id).to.be.undefined;
            });
        });
    });

    describe('types', function () {
        it('should allow embedded types', async () => {

            class EmbeddedModel extends EmbeddedDocument {
                static SCHEMA = {
                    str: String
                };
            }

            class DocumentModel extends Document {
                static SCHEMA = {
                    mod: EmbeddedModel,
                    num: Number
                };
            }

            let data = DocumentModel.create();
            data.mod = EmbeddedModel.create();
            data.mod.str = 'some data';
            data.num = 1;

            await data.save().then(function () {
                validateId(data);
                return DocumentModel.findOne({num: 1});
            }).then(function (d) {
                validateId(d);
                expect(d.num).to.be.equal(1);
                expect(d.mod).to.be.a('object');
                expect(d.mod).to.be.an.instanceof(EmbeddedModel);
                expect(d.mod.str).to.be.equal('some data');
            });
        });

        it('should allow array of embedded types', async () => {

            class Limb extends EmbeddedDocument {
                static SCHEMA = {
                    type: String
                };
            }

            class Person extends Document {
                static SCHEMA = {
                    limbs: [Limb],
                    name: String
                };

                static collectionName() {
                    return 'people';
                }
            }

            let person = Person.create();
            person.name = 'Scott';
            person.limbs.push(Limb.create());
            person.limbs[0].type = 'left arm';
            person.limbs.push(Limb.create());
            person.limbs[1].type = 'right arm';
            person.limbs.push(Limb.create());
            person.limbs[2].type = 'left leg';
            person.limbs.push(Limb.create());
            person.limbs[3].type = 'right leg';

            await person.save().then(function () {
                validateId(person);
                expect(person.limbs).to.have.length(4);
                return Person.findOne({name: 'Scott'});
            }).then(function (p) {
                validateId(p);
                expect(p.name).to.be.equal('Scott');
                expect(p.limbs).to.be.a('array');
                expect(p.limbs).to.have.length(4);
                expect(p.limbs[0].type).to.be.equal('left arm');
                expect(p.limbs[1].type).to.be.equal('right arm');
                expect(p.limbs[2].type).to.be.equal('left leg');
                expect(p.limbs[3].type).to.be.equal('right leg');
            });
        });

        it('should save nested array of embeddeds', async () => {
            class Point extends EmbeddedDocument {
                static SCHEMA = {
                    x: Number,
                    y: Number
                };
            }

            class Polygon extends EmbeddedDocument {
                static SCHEMA = {
                    points: [Point]
                };
            }

            class WorldMap extends Document {
                static SCHEMA = {
                    polygons: [Polygon]
                };
            }

            let map = WorldMap.create();
            let polygon1 = Polygon.create();
            let polygon2 = Polygon.create();
            let point1 = Point.create({x: 123.45, y: 678.90});
            let point2 = Point.create({x: 543.21, y: 987.60});

            map.polygons.push(polygon1);
            map.polygons.push(polygon2);
            polygon2.points.push(point1);
            polygon2.points.push(point2);

            await map.save().then(function () {
                return WorldMap.findOne();
            }).then(function (m) {
                expect(m.polygons).to.have.length(2);
                expect(m.polygons[0]).to.be.instanceof(Polygon);
                expect(m.polygons[1]).to.be.instanceof(Polygon);
                expect(m.polygons[1].points).to.have.length(2);
                expect(m.polygons[1].points[0]).to.be.instanceof(Point);
                expect(m.polygons[1].points[1]).to.be.instanceof(Point);
            });
        });

        it('should allow nested initialization of embedded types', async () => {

            class Discount extends EmbeddedDocument {
                static SCHEMA = {
                    authorized: Boolean,
                    amount: Number
                };
            }

            class Product extends Document {
                static SCHEMA = {
                    name: String,
                    discount: Discount
                };
            }

            let product = Product.create({
                name: 'bike',
                discount: {
                    authorized: true,
                    amount: 9.99
                }
            });

            await product.save().then(function () {
                validateId(product);
                expect(product.name).to.be.equal('bike');
                expect(product.discount).to.be.a('object');
                expect(product.discount instanceof Discount).to.be.true;
                expect(product.discount.authorized).to.be.equal(true);
                expect(product.discount.amount).to.be.equal(9.99);
            });
        });

        it('should allow initialization of array of embedded documents', async () => {

            class Discount extends EmbeddedDocument {
                static SCHEMA = {
                    authorized: Boolean,
                    amount: Number
                };
            }

            class Product extends Document {
                static SCHEMA = {
                    name: String,
                    discounts: [Discount]
                };
            }

            let product = Product.create({
                name: 'bike',
                discounts: [{
                    authorized: true,
                    amount: 9.99
                },
                    {
                        authorized: false,
                        amount: 187.44
                    }]
            });

            await product.save().then(function () {
                validateId(product);
                expect(product.name).to.be.equal('bike');
                expect(product.discounts).to.have.length(2);
                expect(product.discounts[0] instanceof Discount).to.be.true;
                expect(product.discounts[1] instanceof Discount).to.be.true;
                expect(product.discounts[0].authorized).to.be.equal(true);
                expect(product.discounts[0].amount).to.be.equal(9.99);
                expect(product.discounts[1].authorized).to.be.equal(false);
                expect(product.discounts[1].amount).to.be.equal(187.44);
            });
        });
    });

    describe('defaults', function () {
        it('should assign defaults to embedded types', async () => {

            class EmbeddedModel extends EmbeddedDocument {
                static SCHEMA = {
                    str: {type: String, default: 'hello'}
                };
            }

            class DocumentModel extends Document {
                static SCHEMA = {
                    emb: EmbeddedModel,
                    num: {type: Number}
                };
            }

            let data = DocumentModel.create();
            data.emb = EmbeddedModel.create();
            data.num = 1;

            await data.save().then(function () {
                validateId(data);
                return DocumentModel.findOne({num: 1});
            }).then(function (d) {
                validateId(d);
                expect(d.emb.str).to.be.equal('hello');
            });
        });

        it('should assign defaults to array of embedded types', async () => {

            class Money extends EmbeddedDocument {
                static SCHEMA = {
                    value: {type: Number, default: 100}
                };
            }

            class Wallet extends Document {
                static SCHEMA = {
                    contents: [Money],
                    owner: String
                };
            }

            let wallet = Wallet.create();
            wallet.owner = 'Scott';
            wallet.contents.push(Money.create());
            wallet.contents.push(Money.create());
            wallet.contents.push(Money.create());

            await wallet.save().then(function () {
                validateId(wallet);
                return Wallet.findOne({owner: 'Scott'});
            }).then(function (w) {
                validateId(w);
                expect(w.owner).to.be.equal('Scott');
                expect(w.contents[0].value).to.be.equal(100);
                expect(w.contents[1].value).to.be.equal(100);
                expect(w.contents[2].value).to.be.equal(100);
            });
        });
    });

    describe('validate', function () {

        it('should validate embedded values', async () => {

            class EmbeddedModel extends EmbeddedDocument {
                static SCHEMA = {
                    num: {type: Number, max: 10}
                };
            }

            class DocumentModel extends Document {
                static SCHEMA = {
                    emb: EmbeddedModel
                };
            }

            let data = DocumentModel.create();
            data.emb = EmbeddedModel.create();
            data.emb.num = 26;

            await data.save().then(function () {
                expect.fail(null, Error, 'Expected error, but got none.');
            }).catch(function (error) {
                expect(error).to.be.instanceof(ValidationError);
                expect(error.message).to.contain('max');
            });
        });

        it('should validate array of embedded values', async () => {

            class Money extends EmbeddedDocument {
                static SCHEMA = {
                    value: {
                        type: Number, 
                        choices: [1, 5, 10, 20, 50, 100]
                    }
                };
            }

            class Wallet extends Document {
                static SCHEMA = {
                    contents: [Money]
                };
            }

            let wallet = Wallet.create();
            wallet.contents.push(Money.create());
            wallet.contents[0].value = 5;
            wallet.contents.push(Money.create());
            wallet.contents[1].value = 26;

            await wallet.save().then(function () {
                expect.fail(null, Error, 'Expected error, but got none.');
            }).catch(function (error) {
                expect(error).to.be.instanceof(ValidationError);
                expect(error.message).to.contain('choices');
            });
        });

    });

    describe('canonicalize', function () {
        it('should ensure timestamp dates are converted to Date objects', async () => {
            class Education extends EmbeddedDocument {
                static SCHEMA = {
                    school: String,
                    major: String,
                    dateGraduated: Date
                };

                static collectionName() {
                    return 'people';
                }
            }

            class Person extends Document {
                static SCHEMA = {
                    gradSchool: Education
                };

                static collectionName() {
                    return 'people';
                }
            }

            let now = new Date();

            let person = Person.create({
                gradSchool: {
                    school: 'CMU',
                    major: 'ECE',
                    dateGraduated: now
                }
            });

            await person.save().then(function () {
                validateId(person);
                expect(person.gradSchool.school).to.be.equal('CMU');
                expect(person.gradSchool.dateGraduated.getFullYear()).to.be.equal(now.getFullYear());
                expect(person.gradSchool.dateGraduated.getHours()).to.be.equal(now.getHours());
                expect(person.gradSchool.dateGraduated.getMinutes()).to.be.equal(now.getMinutes());
                expect(person.gradSchool.dateGraduated.getMonth()).to.be.equal(now.getMonth());
                expect(person.gradSchool.dateGraduated.getSeconds()).to.be.equal(now.getSeconds());
            });
        });
    });

    describe('hooks', function () {

        it('should call all pre and post functions on embedded models', async () => {

            let preValidateCalled = false;
            let preSaveCalled = false;
            let preDeleteCalled = false;

            let postValidateCalled = false;
            let postSaveCalled = false;
            let postDeleteCalled = false;

            class Coffee extends EmbeddedDocument {
                preValidate() {
                    preValidateCalled = true;
                }

                postValidate() {
                    postValidateCalled = true;
                }

                preSave() {
                    preSaveCalled = true;
                }

                postSave() {
                    postSaveCalled = true;
                }

                preDelete() {
                    preDeleteCalled = true;
                }

                postDelete() {
                    postDeleteCalled = true;
                }
            }

            class Cup extends Document {
                static SCHEMA = {
                    contents: Coffee
                };
            }

            let cup = Cup.create();
            cup.contents = Coffee.create();

            await cup.save().then(function () {
                validateId(cup);

                // Pre/post save and validate should be called
                expect(preValidateCalled).to.be.equal(true);
                expect(preSaveCalled).to.be.equal(true);
                expect(postValidateCalled).to.be.equal(true);
                expect(postSaveCalled).to.be.equal(true);

                // Pre/post delete should not have been called yet
                expect(preDeleteCalled).to.be.equal(false);
                expect(postDeleteCalled).to.be.equal(false);

                return cup.delete();
            }).then(function (numDeleted) {
                expect(numDeleted).to.be.equal(1);

                expect(preDeleteCalled).to.be.equal(true);
                expect(postDeleteCalled).to.be.equal(true);
            });
        });

        it('should call all pre and post functions on array of embedded models', async () => {

            let preValidateCalled = false;
            let preSaveCalled = false;
            let preDeleteCalled = false;

            let postValidateCalled = false;
            let postSaveCalled = false;
            let postDeleteCalled = false;

            class Money extends EmbeddedDocument {

                preValidate() {
                    preValidateCalled = true;
                }

                postValidate() {
                    postValidateCalled = true;
                }

                preSave() {
                    preSaveCalled = true;
                }

                postSave() {
                    postSaveCalled = true;
                }

                preDelete() {
                    preDeleteCalled = true;
                }

                postDelete() {
                    postDeleteCalled = true;
                }
            }

            class Wallet extends Document {
                static SCHEMA = {
                    contents: [Money]
                };
            }

            let wallet = Wallet.create();
            wallet.contents.push(Money.create());
            wallet.contents.push(Money.create());

            await wallet.save().then(function () {
                validateId(wallet);

                // Pre/post save and validate should be called
                expect(preValidateCalled).to.be.equal(true);
                expect(postValidateCalled).to.be.equal(true);
                expect(preSaveCalled).to.be.equal(true);
                expect(postSaveCalled).to.be.equal(true);

                // Pre/post delete should not have been called yet
                expect(preDeleteCalled).to.be.equal(false);
                expect(postDeleteCalled).to.be.equal(false);

                return wallet.delete();
            }).then(function (numDeleted) {
                expect(numDeleted).to.be.equal(1);

                expect(preDeleteCalled).to.be.equal(true);
                expect(postDeleteCalled).to.be.equal(true);
            });
        });
    });

    describe('serialize', function () {
        it('should serialize data to JSON', async () => {
            class Address extends EmbeddedDocument {
                static SCHEMA = {
                    street: String,
                    city: String,
                    zipCode: Number,
                    isPoBox: Boolean
                };
            }

            class Person extends Document {
                static SCHEMA = {
                    name: String,
                    age: Number,
                    isAlive: Boolean,
                    children: [String],
                    address: Address
                };

                static collectionName() {
                    return 'people';
                }
            }

            class SubPerson extends Person {
            }
            
            let person = Person.create({
                name: 'Scott',
                address: {
                    street: '123 Fake St.',
                    city: 'Cityville',
                    zipCode: 12345,
                    isPoBox: false
                }
            });

            let sub = SubPerson.create({name: 'subbi'});
            
            await Promise.all([person.save(), sub.save()]).then(function () {
                validateId(person);
                expect(person.name).to.be.equal('Scott');
                expect(person.address).to.be.an.instanceof(Address);
                expect(person.address.street).to.be.equal('123 Fake St.');
                expect(person.address.city).to.be.equal('Cityville');
                expect(person.address.zipCode).to.be.equal(12345);
                expect(person.address.isPoBox).to.be.equal(false);

                let json = person.toJSON();
                expect(json._id).not.to.be.undefined;
                
                expect(json.name).to.be.equal('Scott');
                expect(json.address).to.not.be.an.instanceof(Address);
                expect(json.address.street).to.be.equal('123 Fake St.');
                expect(json.address.city).to.be.equal('Cityville');
                expect(json.address.zipCode).to.be.equal(12345);
                expect(json.address.isPoBox).to.be.equal(false);
                
                let subJson = sub.toJSON();
                expect(subJson._id).not.to.be.undefined;
                expect(subJson.name).to.equal('subbi');
            });
        });

        it('should serialize data to JSON and ignore methods', () => {
            class Address extends EmbeddedDocument {
                static SCHEMA = {
                    street: String
                };

                getBar() {
                    return 'bar';
                }
            }

            class Person extends Document {
                static SCHEMA = {
                    name: String,
                    address: Address
                };

                static collectionName() {
                    return 'people';
                }

                getFoo() {
                    return 'foo';
                }
            }

            let person = Person.create({
                name: 'Scott',
                address: {
                    street: 'Bar street'
                }
            });

            let json = person.toJSON();
            expect(json).to.have.keys(['_id', 'name', 'address']);
            expect(json.address).to.have.keys(['street']);
        });
    });
});
