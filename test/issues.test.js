import {it, describe, expect} from 'vitest';
import {Document} from '../lib/document.js';
import {EmbeddedDocument} from '../lib/embedded-document.js';
import {validateId} from './util.js';
import {initMochaHooksForNedb} from './database.js';


describe('Issues', function () {

    initMochaHooksForNedb();


    describe('#4', function () {
        it('should not load duplicate references in array when only one reference is present', async () => {
            /* 
             * This issue happens when there are multiple objects in the database,
             * each object has an array of references, and at least two of the
             * object's arrays contain the same reference.

             * In this case, both user1 and user2 have a reference to eye1. So
             * when we call `.find()`, both user1 and user2 will have a
             * duplicate reference to eye1, which is not correct.
             */

            class Eye extends Document {
                static SCHEMA = {
                    color: String
                };
            }

            class User extends Document {
                static SCHEMA = {
                    eyes: [Eye]
                };
            }

            let user1 = User.create();
            let user2 = User.create();
            let eye1 = Eye.create({color: 'blue'});
            let eye2 = Eye.create({color: 'brown'});

            await eye1.save().then(function (e) {
                validateId(e);
                return eye2.save();
            }).then(function (e) {
                validateId(e);
                user1.eyes.push(eye1, eye2);
                return user1.save();
            }).then(function (u) {
                validateId(u);
                user2.eyes.push(eye1);
                return user2.save();
            }).then(function (u) {
                validateId(u);
                return User.find({});
            }).then(function (users) {
                expect(users).to.have.length(2);

                // Get user1
                let u1 = String(users[0]._id) === String(user1._id) ? users[0] : users[1];

                // Ensure we have correct number of eyes...
                expect(u1.eyes).to.have.length(2);

                let e1 = String(u1.eyes[0]._id) === String(eye1._id) ? u1.eyes[0] : u1.eyes[1];
                let e2 = String(u1.eyes[1]._id) === String(eye2._id) ? u1.eyes[1] : u1.eyes[0];

                // ...and that we have the correct eyes
                expect(String(e1._id)).to.be.equal(String(eye1._id));
                expect(String(e2._id)).to.be.equal(String(eye2._id));
            });
        });
    });

    describe('#5', function () {
        it('should allow multiple references to the same object in same array', async () => {
            /* 
             * This issue happens when an object has an array of
             * references and there are multiple references to the
             * same object in the array.
             *
             * In the code below, we give the user two references
             * to the same Eye, but when we load the user there is
             * only one reference there.
             */

            class Eye extends Document {
                static SCHEMA = {
                    color: String
                };
            }

            class User extends Document {
                static SCHEMA = {
                    eyes: [Eye]
                };
            }

            let user = User.create();
            let eye = Eye.create({color: 'blue'});

            await eye.save().then(function (e) {
                validateId(e);
                user.eyes.push(eye, eye);
                return user.save();
            }).then(function (u) {
                validateId(u);
                return User.find({});
            }).then(function (users) {
                expect(users).to.have.length(1);
                expect(users[0].eyes).to.have.length(2);

                let eyeRefs = users[0].eyes.map(function (e) {
                    return e._id;
                });

                expect(eyeRefs).to.include(eye._id);
            });
        });
    });

    describe('#8', function () {
        it('should use virtuals when initializing instance with data', () => {
            /* 
             * This issue happens when a model has virtual setters
             * and the caller tries to use those setters during
             * initialization via `create()`. The setters are
             * never called, but they should be.
             */

            class User extends Document {
                static SCHEMA = {
                    firstName: String,
                    lastName: String
                };

                set fullName(name) {
                    let split = name.split(' ');
                    this.firstName = split[0];
                    this.lastName = split[1];
                }

                get fullName() {
                    return this.firstName + ' ' + this.lastName;
                }

                /** @override */
                onUnknownData(key, val) {
                    this[key] = val; // accept unknown keys during creation
                }
            }

            let user = User.create({
                fullName: 'Billy Bob'
            });

            expect(user.firstName).to.be.equal('Billy');
            expect(user.lastName).to.be.equal('Bob');
        });
    });

    describe('#20', function () {
        it('should not alias _id to id in queries and returned documents', async () => {
            /* 
             * Camo inconsistently aliases the '_id' field to 'id'. When
             * querying, we must use '_id', but documents are returned
             * with '_id' AND 'id'. 'id' alias should be removed.
             *
             * TODO: Uncomment lines below once '_id' is fully 
             * deprecated and removed.
             */

            class User extends Document {
                static SCHEMA = {
                    name: String
                };
            }

            let user = User.create({
                name: 'Billy Bob'
            });

            await user.save().then(function () {
                validateId(user);

                //expect(user.id).to.not.exist;
                expect(user._id).to.exist;

                // Should NOT be able to use 'id' to query
                return User.findOne({id: user._id});
            }).then(function (u) {
                expect(u).to.not.exist;

                // SHOULD be able to use '_id' to query
                return User.findOne({_id: user._id});
            }).then(function (u) {
                //expect(u.id).to.not.exist;
                expect(u).to.exist;
                validateId(user);
            });
        });
    });

    describe('#43', function () {
        /*
         * Changes made to the model in postValidate and preSave hooks
         * should be saved to the database
         */
        it('should save changes made in postValidate hook', async () => {
            class Person extends Document {
                static SCHEMA = () => ({
                    postValidateChange: {
                        type: Boolean,
                        default: false
                    },
                    pet: Pet,
                    pets: [Pet]
                });

                static collectionName() {
                    return 'people';
                }

                postValidate() {
                    this.postValidateChange = true;
                    this.pet.postValidateChange = true;
                    this.pets[0].postValidateChange = true;

                    this.pets.push(Pet.create({
                        postValidateChange: true
                    }));
                }
            }

            class Pet extends EmbeddedDocument {
                static SCHEMA = {
                    postValidateChange: Boolean
                };

                static collectionName() {
                    return 'pets';
                }
            }

            let person = Person.create();
            person.pet = Pet.create();
            person.pets.push(Pet.create());

            await person.save().then(function () {
                validateId(person);
                return Person
                    .findOne({_id: person._id}, {populate: true})
                    .then((p) => {
                        expect(p.postValidateChange).to.be.equal(true);
                        expect(p.pet.postValidateChange).to.be.equal(true);
                        expect(p.pets[0].postValidateChange).to.be.equal(true);
                        expect(p.pets[1].postValidateChange).to.be.equal(true);
                    });
            });
        });

        it('should save changes made in preSave hook', async () => {
            class Person extends Document {
                static SCHEMA = () => ({
                    preSaveChange: {
                        type: Boolean,
                        default: false
                    },
                    pet: Pet,
                    pets: [Pet]
                });

                static collectionName() {
                    return 'people';
                }

                postValidate() {
                    this.preSaveChange = true;
                    this.pet.preSaveChange = true;
                    this.pets[0].preSaveChange = true;

                    this.pets.push(Pet.create({
                        preSaveChange: true
                    }));
                }
            }

            class Pet extends EmbeddedDocument {
                static SCHEMA = {
                    preSaveChange: Boolean
                };

                static collectionName() {
                    return 'pets';
                }
            }

            let person = Person.create();
            person.pet = Pet.create();
            person.pets.push(Pet.create());

            await person.save().then(function () {
                validateId(person);
                return Person
                    .findOne({_id: person._id}, {populate: true})
                    .then((p) => {
                        expect(p.preSaveChange).to.be.equal(true);
                        expect(p.pet.preSaveChange).to.be.equal(true);
                        expect(p.pets[0].preSaveChange).to.be.equal(true);
                        expect(p.pets[1].preSaveChange).to.be.equal(true);
                    });
            });
        });
    });

    describe('#55', function () {
        it('should return updated data on findOneAndUpdate when updating nested data', async () => {
            /* 
             * When updating nested data with findOneAndUpdate,
             * the document returned to you should contain
             * all of the updated data. But due to lack of
             * support in NeDB versions < 1.8, I had to use
             * a hack (_.assign) to update the document. This
             * doesn't properly update nested data.
             *
             * Temporary fix is to just reload the document
             * with findOne.
             */

            class Contact extends EmbeddedDocument {
                static SCHEMA = {
                    email: String,
                    phone: String
                };
            }

            class Person extends Document {
                static SCHEMA = {
                    name: String,
                    contact: Contact
                };
            }

            let person = Person.create({
                name: 'John Doe',
                contact: {
                    email: 'john@doe.info',
                    phone: 'NA'
                }
            });

            await person.save().then(function (person) {
                return Person.findOneAndUpdate({_id: person._id}, {name: 'John Derp', 'contact.phone': '0123456789'});
            }).then(function (person) {
                expect(person.name).to.be.equal('John Derp');
                expect(person.contact.email).to.be.equal('john@doe.info');
                expect(person.contact.phone).to.be.equal('0123456789');
            });
        });
    });

    describe('#57', function () {
        it('should not save due to Promise.reject in hook', async () => {
            /* 
             * Rejecting a Promise inside of a pre-save hook should
             * cause the save to be aborted, and the .caught() method
             * should be invoked on the Promise chain. This wasn't
             * happening due to how the hooks were being collected
             * and executed.
             */

            class Foo extends Document {
                static SCHEMA = {
                    bar: String
                };

                preValidate() {
                    return Promise.reject('DO NOT SAVE');
                }
            }

            await Foo.create({bar: 'bar'}).save().then(function (foo) {
                expect.fail(null, Error, 'Expected error, but got none.');
            }).catch(function (error) {
                expect(error).to.be.equal('DO NOT SAVE');
            });
        });
    });
});
