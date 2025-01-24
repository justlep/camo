import {it, describe, expect, assert, afterEach} from 'vitest';
import {Document} from '../lib/document.js';
import {fail, validateId, expectError, Data} from './util.js';
import {
    isDocument,
    isEmbeddedDocument,
    isReferenceable,
    ValidationError
} from '../lib/validate.js';
import {initMochaHooksForNedb} from './database.js';
import {IS_BASE_DOCUMENT, IS_DOCUMENT, IS_EMBEDDED} from '../lib/symbols.js';
import {setUnknownDataKeyBehavior} from '../lib/base-document.js';


describe('Document', function () {

    initMochaHooksForNedb();

    describe('instantiation', function () {
        it('should allow creation of instance', async () => {

            class User extends Document {
                static SCHEMA = {
                    firstName: String,
                    lastName: String
                };
            }

            let user = User.create();
            user.firstName = 'Billy';
            user.lastName = 'Bob';

            expect(isDocument(user)).to.be.true;
            expect(isEmbeddedDocument(user)).to.be.false;
            expect(isReferenceable(user)).to.be.true;

            expect(user[IS_DOCUMENT]).to.be.true;
            expect(user[IS_EMBEDDED]).to.be.undefined;
            expect(user[IS_BASE_DOCUMENT]).to.be.true;

            await user.save().then(function () {
                validateId(user);
            });
        });

        it('should allow schema declaration via method', async () => {

            class User extends Document {
                static SCHEMA = {
                    firstName: String,
                    lastName: String
                };
            }

            let user = User.create();
            user.firstName = 'Billy';
            user.lastName = 'Bob';

            await user.save().then(function () {
                validateId(user);
            });
        });

        it('should allow creation of instance with data', () => {

            class User extends Document {
                static SCHEMA = {
                    firstName: String,
                    lastName: String,
                    nicknames: [String]
                };
            }

            let user = User.create({
                firstName: 'Billy',
                lastName: 'Bob',
                nicknames: ['Bill', 'William', 'Will']
            });

            expect(user.firstName).to.be.equal('Billy');
            expect(user.lastName).to.be.equal('Bob');
            expect(user.nicknames).to.have.length(3);
            expect(user.nicknames).to.include('Bill');
            expect(user.nicknames).to.include('William');
            expect(user.nicknames).to.include('Will');
        });

        it('should allow creation of instance with references', async () => {

            class Coffee extends Document {
                static SCHEMA = {
                    temp: Number
                };
            }

            class User extends Document {
                static SCHEMA = {
                    drinks: [Coffee]
                };
            }

            let coffee = Coffee.create();
            coffee.temp = 105;

            await coffee.save().then(function () {
                let user = User.create({drinks: [coffee]});
                expect(user.drinks).to.have.length(1);
            });
        });

    });
    
    describe('instantiation w/ unknown data keys', () => {

        afterEach(() => setUnknownDataKeyBehavior('default'));
        
        it('should throw by default', () => {
            class Foo extends Document {
                static SCHEMA = {
                    name: String
                };
            }

            expect(() => Foo.create({name: 'Tom'})).not.to.throw();
            expect(() => Foo.create({name: 'Beelz', xxx: 666})).to.throw('Unknown data key "xxx" for new Foo');
        });
        
        it('should behave as configured by setUnknownDataKeyBehavior()', () => {
            class Foo extends Document {
                static SCHEMA = {
                    name: String
                };
            }
            
            let foo;
            
            // expect 'throw' as default
            expect(() => Foo.create({name: 'Tom'})).not.to.throw();
            expect(() => Foo.create({name: 'Beelz', xxx: 666})).to.throw('Unknown data key "xxx" for new Foo');
            
            setUnknownDataKeyBehavior('throw');
            expect(() => Foo.create({name: 'Tom'})).not.to.throw();
            expect(() => Foo.create({name: 'Beelz', xxx: 666})).to.throw('Unknown data key "xxx" for new Foo');

            setUnknownDataKeyBehavior('ignore');
            expect(() => Foo.create({name: 'Tom'})).not.to.throw();
            expect(() => foo = Foo.create({name: 'Beelz', xxx: 666})).not.to.throw();
            assert.isUndefined(foo.xxx);
            
            setUnknownDataKeyBehavior('logAndIgnore');
            expect(() => Foo.create({name: 'Tom'})).not.to.throw();
            expect(() => foo = Foo.create({name: 'Beelz', xxx: 666})).not.to.throw();
            assert.isUndefined(foo.xxx);
            
            setUnknownDataKeyBehavior('accept');
            expect(() => Foo.create({name: 'Tom'})).not.to.throw();
            expect(() => foo = Foo.create({name: 'Beelz', xxx: 666})).not.to.throw();
            assert.equal(foo.xxx, 666);

            setUnknownDataKeyBehavior('logAndAccept');
            expect(() => Foo.create({name: 'Tom'})).not.to.throw();
            expect(() => foo = Foo.create({name: 'Beelz', xxx: 666})).not.to.throw();
            assert.equal(foo.xxx, 666);
        });

        it('can accept unknown data keys by overriding onUnknownData()', async () => {
            let totalUnkownKeys = 0;

            class Foo extends Document {
                static SCHEMA = {
                    name: String
                };
                /** @override */
                onUnknownData(dataKey, dataVal) {
                    this[dataKey] = dataVal;
                    totalUnkownKeys++;
                }
            }

            let foo;
            expect(() => foo = Foo.create({name: 'Tom', xxx: 666})).not.to.throw();
            assert.equal(foo.name, 'Tom');
            assert.equal(foo.xxx, 666);
            assert.equal(totalUnkownKeys, 1);

            await foo.save().then(function () {
                let {_id} = foo;
                return Foo.findOne({_id});
            }).then(f => {
                expect(f).to.be.instanceof(Foo);
                assert.notEqual(f, foo);
                assert.equal(f.name, foo.name);

                // xxx was not persisted, so it shouldn't be in f, and 'onUnknownKeys' should not have been called for it
                assert.isUndefined(f.xxx);
                assert.equal(totalUnkownKeys, 1);
            });
        });

        it('can ignore unknown data keys by overriding onUnknownData()', async () => {
            let totalUnkownKeys = 0;

            class Foo extends Document {
                static SCHEMA = {
                    name: String
                };
                /** @override */
                onUnknownData(dataKey, dataVal) {
                    totalUnkownKeys++; // just count, but discard key/value
                }
            }

            let foo = Foo.create({name: 'Tom', xxx: 666});
            assert.equal(foo.name, 'Tom');
            assert.isUndefined(foo.xxx);
            assert.equal(totalUnkownKeys, 1);

            await foo.save().then(() => Foo.findOne({_id: foo._id})).then(f => {
                expect(f).to.be.instanceof(Foo);
                assert.notEqual(f, foo);
                assert.equal(f.name, foo.name);

                // xxx was not persisted, so it shouldn't be in f, and 'onUnknownKeys' should not have been called for it
                assert.isUndefined(f.xxx);
                assert.equal(totalUnkownKeys, 1);
            });
        });

        it('should never cause unknown keys getting persisted', async () => {
            const COMMON_COLLECTION_NAME = 'people99';

            let totalUnkown = 0,
                lastUnkownKey;

            class NameOnlyPerson extends Document {
                static SCHEMA = {
                    name: String
                };
                static collectionName() {
                    return COMMON_COLLECTION_NAME;
                }
                /** @override */
                onUnknownData(key, val) {
                    this[key] = val; // accept unknown keys first
                    totalUnkown++;
                    lastUnkownKey = key;
                }
            }

            class Person extends NameOnlyPerson {
                static SCHEMA = {
                    name: String,
                    birthday: Date
                };
                static collectionName() {
                    return COMMON_COLLECTION_NAME;
                }
            }

            let person = Person.create({
                    name: 'foo',
                    birthday: new Date(),
                    otherProp: 'bar'
                }),
                _id;

            await person.save().then(function () {
                assert.equal(person.name, 'foo');
                assert.equal(person.otherProp, 'bar'); // still the same, non-re-loaded instance
                _id = person._id;

                assert.equal(totalUnkown, 1);
                assert.equal(lastUnkownKey, 'otherProp');

                return Person.findOne({_id});
            }).then(p => {
                expect(p).to.be.instanceof(Person);
                assert.notEqual(p, person);
                assert.equal(p._id, _id);
                assert.equal(p.name, person.name);
                assert.equal(p.birthday.getTime(), person.birthday.getTime());
                assert.isUndefined(p.otherProp);

                assert.equal(totalUnkown, 1);

                NameOnlyPerson.prototype.onUnknownData = (key,val) => {
                    totalUnkown++;
                    lastUnkownKey = key;
                }; // ignore unknown values from now

                return NameOnlyPerson.findOne({_id});
            }).then(p2 => {
                expect(p2).to.be.instanceof(NameOnlyPerson);
                assert.notEqual(p2, person);
                assert.equal(p2._id, _id);
                assert.equal(p2.name, person.name);

                assert.equal(totalUnkown, 2);
                assert.equal(lastUnkownKey, 'birthday');

                assert.isUndefined(p2.birthday);
                assert.isUndefined(p2.otherProp);

            });

        });
        
    });

    describe('class', function () {
        it('should allow use of member variables in getters', async () => {

            class User extends Document {
                static SCHEMA = {
                    firstName: String,
                    lastName: String
                };

                get fullName() {
                    return this.firstName + ' ' + this.lastName;
                }
            }

            let user = User.create();
            user.firstName = 'Billy';
            user.lastName = 'Bob';

            await user.save()
                .then(() => User.findOne({_id: user._id}))
                .then(u => {
                    validateId(u);
                    expect(u.fullName).to.be.equal('Billy Bob');
                    expect(user.fullName).to.be.equal('Billy Bob');
                });
        });

        it('should allow use of member variables in setters', async () => {

            class User extends Document {
                static SCHEMA = {
                    firstName: String,
                    lastName: String
                };
                
                get fullName() {
                    return this.firstName + ' ' + this.lastName;
                }

                set fullName(name) {
                    let nameArr = name.split(' ');
                    this.firstName = nameArr[0];
                    this.lastName = nameArr[1];
                }
            }

            let user = User.create();
            user.fullName = 'Billy Bob';
            
            await user.save()
                .then(() => User.findOne({_id: user._id}))
                .then(u => {
                    validateId(u);
                    expect(u.firstName).to.be.equal('Billy');
                    expect(u.lastName).to.be.equal('Bob');
                    expect(user.firstName).to.be.equal('Billy');
                    expect(user.lastName).to.be.equal('Bob');
                });
        });

        it('should allow use of member variables in methods', async () => {

            class User extends Document {
                static SCHEMA = {
                    firstName: String,
                    lastName: String
                };
                fullName() {
                    return this.firstName + ' ' + this.lastName;
                }
            }

            let user = User.create();
            user.firstName = 'Billy';
            user.lastName = 'Bob';
            expect(user.fullName()).to.be.equal('Billy Bob');

            await user.save()
                .then(() => User.findOne({_id: user._id}))
                .then(u => {
                    validateId(u);
                    expect(u.fullName()).to.be.equal('Billy Bob');
                });
        });

        it('should allow schemas to be extended', async () => {

            class User extends Document {
                static SCHEMA = {
                    firstName: String,
                    lastName: String
                };
            }

            class ProUser extends User {
                static SCHEMA = {
                    paymentMethod: String
                };
            }

            let user = ProUser.create();
            user.firstName = 'Billy';
            user.lastName = 'Bob';
            user.paymentMethod = 'cash';

            await user.save()
                .then(() => ProUser.findOne({_id: user._id}))
                .then(p => {
                    validateId(user);
                    expect(p.firstName).to.be.equal('Billy');
                    expect(p.lastName).to.be.equal('Bob');
                    expect(p.paymentMethod).to.be.equal('cash');
                });
        });

        it('should allow schemas to be overridden', async () => {

            class Vehicle extends Document {
                static SCHEMA = {
                    numWheels: {
                        type: Number,
                        default: 4
                    }
                };
            }

            class Motorcycle extends Vehicle {
                static SCHEMA = {
                    numWheels: {
                        type: Number,
                        default: 2
                    }
                };
            }

            let bike = Motorcycle.create();

            await bike.save()
                .then(() => Motorcycle.findOne({_id: bike._id}))
                .then(b => {
                    validateId(b);
                    expect(b.numWheels).to.be.equal(2);
                });
        });

        it('should not use the parent static SCHEMA in derived class w/ schema-init by constructor', function () {

            class Vehicle extends Document {
                static SCHEMA = {
                    name: {
                        type: String,
                        default: 'nice vehicle'
                    }
                };
            }

            class Motorcycle extends Vehicle {
                constructor() {
                    super();
                    this.name = {
                        type: String,
                        default: 'even nicer motorcycle'
                    };
                    this.doors = {
                        type: Number,
                        default: 0
                    };
                }
            }

            let bike = Motorcycle.create();
            assert.equal(bike.name, 'even nicer motorcycle');
            assert.equal(bike.doors, 0);
            
            assert.equal(Vehicle.create().name, 'nice vehicle');
            assert.isUndefined(Vehicle.create().doors);
        });
        
        it('should provide default collection name based on class name', function () {

            class User extends Document {}

            let user = User.create();

            expect(user.collectionName()).to.be.equal('users');
            expect(User.collectionName()).to.be.equal('users');
        });

        it('should provide default collection name based on subclass name', function () {

            class User extends Document {}

            class ProUser extends User {}

            let pro = ProUser.create();

            expect(pro.collectionName()).to.be.equal('prousers');
            expect(ProUser.collectionName()).to.be.equal('prousers');
        });

        it('should not inherit collection names of parent classes', function () {

            class User extends Document {}
            class ProUser extends User {}

            let user = User.create(),
                pro = ProUser.create();

            expect(user.collectionName()).to.be.equal('users');
            expect(User.collectionName()).to.be.equal('users');
            expect(pro.collectionName()).to.be.equal('prousers');
            expect(ProUser.collectionName()).to.be.equal('prousers');
        });
        
        it('should allow custom collection name', function () {

            class User extends Document {
                static collectionName() {
                    return 'sheeple';
                }
            }

            let user = User.create();
            expect(user.collectionName()).to.be.equal('sheeple');
            expect(User.collectionName()).to.be.equal('sheeple');
        });
        
        it('should allow custom collection name in derived classes', async () => {

            class UserWithUnique extends Document {
                static SCHEMA = {
                    name: {
                        type: String,
                        unique: true
                    },
                    foo: {
                        type: Number,
                        unique: true
                    }
                };
            }

            class ProUser extends UserWithUnique {
                static collectionName() {
                    return 'prousersx';
                }
            }
            
            let proUser = ProUser.create();

            expect(proUser.collectionName()).to.be.equal('prousersx');
            expect(ProUser.collectionName()).to.be.equal('prousersx');

            /** saving just to avoid erratic behavior in afterEach cleanup; see comment in {@link NeDbClient._dropDatabase} */
            await proUser.save(); 
        });

        it('should inherit custom collection names', function () {

            class User extends Document {
                static collectionName() {
                    return 'users';
                }
            }
            
            class ProUser extends User {}

            let proUser = ProUser.create(),
                user = User.create();
            
            expect(user.collectionName()).to.be.equal('users');
            expect(User.collectionName()).to.be.equal('users');
            expect(proUser.collectionName()).to.be.equal('users');
            expect(proUser.collectionName()).to.be.equal('users');
        });
    });

    describe('types', function () {
        it('should allow reference types', async () => {

            class ReferenceeModel extends Document {
                static SCHEMA = {
                    str: String
                };

                static collectionName() {
                    return 'referencee1';
                }
            }

            class ReferencerModel extends Document {
                static SCHEMA = {
                    ref: ReferenceeModel,
                    num: Number
                };
                static collectionName() {
                    return 'referencer1';
                }
            }

            let data = ReferencerModel.create();
            data.ref = ReferenceeModel.create();
            data.ref.str = 'some data';
            data.num = 1;

            await data.ref.save().then(function () {
                validateId(data.ref);
                return data.save();
            }).then(function () {
                validateId(data);
                return ReferencerModel.findOne({num: 1});
            }).then(function (d) {
                validateId(d);
                validateId(d.ref);
                expect(d.ref).to.be.an.instanceof(ReferenceeModel);
                expect(d.ref.str).to.be.equal('some data');
            });
        });

        it('should allow array of references', async () => {

            class ReferenceeModel extends Document {
                static SCHEMA = {
                    str: String
                };

                static collectionName() {
                    return 'referencee2';
                }
            }

            class ReferencerModel extends Document {
                static SCHEMA = {
                    refs: [ReferenceeModel],
                    num: Number
                };
                static collectionName() {
                    return 'referencer2';
                }
            }

            let data = ReferencerModel.create();
            data.refs.push(ReferenceeModel.create());
            data.refs.push(ReferenceeModel.create());
            data.refs[0].str = 'string1';
            data.refs[1].str = 'string2';
            data.num = 1;

            await data.refs[0].save().then(function () {
                validateId(data.refs[0]);
                return data.refs[1].save();
            }).then(function () {
                validateId(data.refs[1]);
                return data.save();
            }).then(function () {
                validateId(data);
                return ReferencerModel.findOne({num: 1});
            }).then(function (d) {
                validateId(d);
                validateId(d.refs[0]);
                validateId(d.refs[1]);
                expect(d.refs[0]).to.be.an.instanceof(ReferenceeModel);
                expect(d.refs[1]).to.be.an.instanceof(ReferenceeModel);
                expect(d.refs[0].str).to.be.equal('string1');
                expect(d.refs[1].str).to.be.equal('string2');
            });
        });

        it('should allow references to be saved using the object or its id', async () => {
            class ReferenceeModel extends Document {
                static SCHEMA = {
                    str: String
                };
                static collectionName() {
                    return 'referencee3';
                }
            }

            class ReferencerModel extends Document {
                static SCHEMA = {
                    ref1: ReferenceeModel,
                    ref2: ReferenceeModel,
                    num: Number
                };
                static collectionName() {
                    return 'referencer3';
                }
            }

            let data = ReferencerModel.create();
            data.ref1 = ReferenceeModel.create();
            let ref2 = ReferenceeModel.create();
            data.ref1.str = 'string1';
            ref2.str = 'string2';
            data.num = 1;

            await data.ref1.save().then(function () {
                validateId(data.ref1);
                return data.save();
            }).then(function () {
                validateId(data);
                return ref2.save();
            }).then(function () {
                validateId(ref2);
                data.ref2 = ref2._id;
                return data.save();
            }).then(function () {
                return ReferencerModel.findOne({num: 1});
            }).then(function (d) {
                validateId(d.ref1);
                validateId(d.ref2);
                expect(d.ref1.str).to.be.equal('string1');
                expect(d.ref2.str).to.be.equal('string2');
            });
        });

        it('should allow array of references to be saved using the object or its id', async () => {
            class ReferenceeModel extends Document {
                static SCHEMA = {
                    str: String
                };

                static collectionName() {
                    return 'referencee4';
                }
            }

            class ReferencerModel extends Document {
                static SCHEMA = {
                    refs: [ReferenceeModel],
                    num: Number
                };
                static collectionName() {
                    return 'referencer4';
                }
            }

            let data = ReferencerModel.create();
            data.refs.push(ReferenceeModel.create());
            let ref2 = ReferenceeModel.create();
            data.refs[0].str = 'string1';
            ref2.str = 'string2';
            data.num = 1;

            await data.refs[0].save().then(function () {
                validateId(data.refs[0]);
                return data.save();
            }).then(function () {
                validateId(data);
                return ref2.save();
            }).then(function () {
                validateId(ref2);
                data.refs.push(ref2._id);
                return data.save();
            }).then(function () {
                return ReferencerModel.findOne({num: 1});
            }).then(function (d) {
                validateId(d.refs[0]);
                validateId(d.refs[1]);
                expect(d.refs[1].str).to.be.equal('string2');
            });
        });

        it('should allow circular references', async () => {

            class Employee extends Document {
                static SCHEMA = () => ({
                    name: String,
                    boss: Boss
                });
            }

            class Boss extends Document {
                static SCHEMA = {
                    salary: Number,
                    employees: [Employee]
                };
                static collectionName() {
                    return 'bosses';
                }
            }

            let employee = Employee.create();
            employee.name = 'Scott';

            let boss = Boss.create();
            boss.salary = 10000000;

            employee.boss = boss;

            await boss.save().then(function () {
                validateId(boss);

                return employee.save();
            }).then(function () {
                validateId(employee);
                validateId(employee.boss);

                boss.employees.push(employee);

                return boss.save();
            }).then(function () {
                validateId(boss);
                validateId(boss.employees[0]);
                validateId(boss.employees[0].boss);

                return Boss.findOne({salary: 10000000});
            }).then(function (b) {
                // If we had an issue with an infinite loop
                // of loading circular dependencies then the
                // test probably would have crashed by now,
                // so we're good.

                validateId(b);

                // Validate that boss employee ref was loaded
                validateId(b.employees[0]);

                // .findOne should have only loaded 1 level
                // of references, so the boss's reference
                // to the employee is still the ID.
                expect(b.employees[0].boss).to.not.be.null;
                expect(isDocument(b.employees[0].boss)).to.be.false;
            });
        });

        it('should allow string types', async () => {

            class StringModel extends Document {
                static SCHEMA = {
                    str: String
                };
            }

            let data = StringModel.create();
            data.str = 'hello';

            await data.save().then(function () {
                validateId(data);
                expect(data.str).to.be.equal('hello');
            });
        });

        it('should allow number types', async () => {

            class NumberModel extends Document {
                static SCHEMA = {
                    num: {type: Number}
                };

                static collectionName() {
                    return 'numbers1';
                }
            }

            let data = NumberModel.create();
            data.num = 26;

            await data.save().then(function () {
                validateId(data);
                expect(data.num).to.be.equal(26);
            });
        });

        it('should allow boolean types', async () => {

            class BooleanModel extends Document {
                static SCHEMA = {
                    bool: {type: Boolean}
                };
            }

            let data = BooleanModel.create();
            data.bool = true;

            await data.save().then(function () {
                validateId(data);
                expect(data.bool).to.be.equal(true);
            });
        });

        it('should allow date types', async () => {

            class DateModel extends Document {
                static SCHEMA = {
                    date: Date
                };
            }

            let data = DateModel.create();
            let date = new Date();
            data.date = date;

            await data.save().then(function () {
                validateId(data);
                expect(data.date.valueOf()).to.be.equal(date.valueOf());
            });
        });

        it('should allow date type arrays', async () => {

            class DateArrModel extends Document {
                static SCHEMA = {
                    dates: {type: [Date]}
                };
            }

            let data = DateArrModel.create();
            let now = new Date();
            data.dates.push(now, new Date(now.getTime() + 1));

            await data.save().then(function () {
                validateId(data);
                let [d1, d2] = data.dates;
                expect(d1.valueOf()).to.be.equal(now.valueOf());
                expect(d2.valueOf()).to.be.equal(now.valueOf() + 1);
            });
        });

        it('should disallow custom/wildcard object types w/o toData+fromData+validate', function () {

            for (const typeForKey of [Object, {type: Object}, Array, []]) {
                class ObjectModel extends Document {
                    static SCHEMA = {
                        obj: typeForKey
                    };
                }

                expect(() => void ObjectModel.create()).to.throw('is custom-type, requiring [toData,fromData,validate]');
            }
        });
        
        it('should allow custom object types', async () => {

            class CustomObjectModel extends Document {
                static SCHEMA = {
                    obj: {
                        type: Object,
                        fromData: JSON.parse,
                        toData: JSON.stringify,
                        validate: (o) => o && typeof o === 'object' && o.hi === 'bye'
                    }
                };
            }

            let data = CustomObjectModel.create();

            await data.save().then(() => {
                expect.fail(null, Error, 'Expected error, but got none.');
            }).catch(error => {
                expect(error).to.be.instanceof(ValidationError);
                expect(error.message).to.equal('Value for CustomObjectModel.obj was rejected by custom validate()');
                data.obj = {hi: 'foo'};
                return data.save();
            }).then(() => {
                expect.fail(null, Error, 'Expected error, but got none.');
            }).catch(error => {
                expect(error).to.be.instanceof(ValidationError);
                expect(error.message).to.equal('Value for CustomObjectModel.obj was rejected by custom validate()');
                data.obj.hi = 'bye';
                return data.save();
            }).then(() => {
                validateId(data);
                expect(data.obj.hi).to.be.equal('bye');
            });
        });

        it('should allow buffer types', async () => {

            class BufferModel extends Document {
                static SCHEMA = {
                    buf: {type: Buffer}
                };
            }

            let data = BufferModel.create();
            data.buf = new Buffer('hello');

            await data.save().then(function () {
                validateId(data);
                expect(data.buf.toString()).to.be.equal('hello');
            });
        });

        it('should disallow array types with wildcard Object elements', () => {

            class WildcardArrayModel extends Document {
                static SCHEMA = {
                    obj: [Object]
                };
            }

            expect(() => WildcardArrayModel.create()).to.throw('is array-type with custom-type elements');
        });
        
        it('should allow custom-type arrays', async () => {

            class CustomArrayDocument extends Document {
                static SCHEMA = {
                    arr: {
                        type: Object,
                        fromData: a => a,
                        toData: a => a,
                        validate: a => Array.isArray(a) && a.every(elem => typeof elem === 'string' || typeof elem === 'number')
                    }
                };
            }

            let data = CustomArrayDocument.create();

            data.arr = /../;
            
            await data.save().then(() => {
                expect.fail(null, Error, 'Expected error, but got none.');
            }).catch(error => {
                expect(error).to.be.instanceof(ValidationError);
                expect(error.message).to.equal('Value for CustomArrayDocument.arr was rejected by custom validate()');
                data.arr = [1, 'foo', true];
                return data.save();
            }).then(() => {
                expect.fail(null, Error, 'Expected error, but got none.');
            }).catch(error => {
                expect(error).to.be.instanceof(ValidationError);
                expect(error.message).to.equal('Value for CustomArrayDocument.arr was rejected by custom validate()');
                data.arr.pop();
                return data.save();
            }).then(() => {
                validateId(data);
                expect(data.arr).to.deep.equal([1, 'foo']);
            });
        });

        it('should allow typed-array types', async () => {

            class ArrayModel extends Document {
                static SCHEMA = {
                    arr: {type: [String]}
                };
            }

            let data = ArrayModel.create();
            data.arr = ['1', '2', '3'];

            await data.save().then(function () {
                validateId(data);
                expect(data.arr).to.have.length(3);
                expect(data.arr).to.include('1');
                expect(data.arr).to.include('2');
                expect(data.arr).to.include('3');
            });
        });

        it('should reject objects containing values with different types', async () => {

            class NumberModel extends Document {
                static SCHEMA = {
                    num: {type: Number}
                };
                static collectionName() {
                    return 'numbers2';
                }
            }

            let data = NumberModel.create();
            data.num = '1';

            await data.save().then(function () {
                expect.fail(null, Error, 'Expected error, but got none.');
            }).catch(function (error) {
                expect(error).to.be.instanceof(ValidationError);
            });
        });

        it('should reject typed-arrays containing different types', async () => {

            class ArrayModel extends Document {
                static SCHEMA = {
                    arr: [String]
                };
            }

            let data = ArrayModel.create();
            data.arr = [1, 2, 3];

            await data.save().then(function () {
                expect.fail(null, Error, 'Expected error, but got none.');
            }).catch(function (error) {
                expect(error).to.be.instanceof(ValidationError);
            });
        });
    });

    describe('defaults', function () {
        it('should assign default value if unassigned', async () => {

            let data = Data.create();

            await data.save().then(function () {
                validateId(data);
                expect(data.source).to.be.equal('reddit');
            });
        });

        it('should assign default value via function if unassigned', async () => {

            let data = Data.create();

            await data.save().then(() => new Promise(resolve => setTimeout(resolve, 5))).then(function () {
                validateId(data);
                expect(data.date).to.be.lessThan(new Date());
            });
        });

        it('should be undefined if unassigned and no default is given', async () => {

            class Person extends Document {
                static SCHEMA = {
                    name: String,
                    age: Number
                };
                static collectionName() {
                    return 'people';
                }
            }

            let person = Person.create({
                name: 'Scott'
            });

            await person.save().then(function () {
                validateId(person);
                return Person.findOne({name: 'Scott'});
            }).then(function (p) {
                validateId(p);
                expect(p.name).to.be.equal('Scott');
                expect(p.age).to.be.undefined;
            });
        });
        
        // TODO add tests for default = (string|number|Date|function) on Date-type properties 
    });

    describe('choices', function () {
        it('should accept value specified in choices', async () => {

            let data = Data.create();
            data.source = 'wired';

            await data.save().then(function () {
                validateId(data);
                expect(data.source).to.be.equal('wired');
            });
        });

        it('should reject values not specified in choices', async () => {

            let data = Data.create();
            data.source = 'google';

            await data.save().then(function () {
                expect.fail(null, Error, 'Expected error, but got none.');
            }).catch(function (error) {
                expect(error).to.be.instanceof(ValidationError);
            });
        });
    });

    describe('min', function () {
        it('should accept value > min', async () => {

            let data = Data.create();
            data.item = 1;

            await data.save().then(function () {
                validateId(data);
                expect(data.item).to.be.equal(1);
            });
        });

        it('should accept value == min', async () => {

            let data = Data.create();
            data.item = 0;

            await data.save().then(function () {
                validateId(data);
                expect(data.item).to.be.equal(0);
            });
        });

        it('should reject value < min', async () => {

            let data = Data.create();
            data.item = -1;

            await data.save().then(function () {
                expect.fail(null, Error, 'Expected error, but got none.');
            }).catch(function (error) {
                expect(error).to.be.instanceof(ValidationError);
            });
        });
    });

    describe('max', function () {
        it('should accept value < max', async () => {

            let data = Data.create();
            data.item = 99;

            await data.save().then(function () {
                validateId(data);
                expect(data.item).to.be.equal(99);
            });
        });

        it('should accept value == max', async () => {

            let data = Data.create();
            data.item = 100;

            await data.save().then(function () {
                validateId(data);
                expect(data.item).to.be.equal(100);
            });
        });

        it('should reject value > max', async () => {

            let data = Data.create();
            data.item = 101;

            await data.save().then(function () {
                expect.fail(null, Error, 'Expected error, but got none.');
            }).catch(function (error) {
                expect(error).to.be.instanceof(ValidationError);
            });
        });
    });

    describe('match', function () {
        it('should accept value matching regex', async () => {

            class Product extends Document {
                static SCHEMA = {
                    name: String,
                    cost: {
                        type: String,
                        match: /^\$?[\d,]+(\.\d*)?$/
                    }
                };
            }

            let product = Product.create();
            product.name = 'Dark Roast Coffee';
            product.cost = '$1.39';

            await product.save().then(function () {
                validateId(product);
                expect(product.name).to.be.equal('Dark Roast Coffee');
                expect(product.cost).to.be.equal('$1.39');
            });
        });

        it('should reject value not matching regex', async () => {

            class Product extends Document {
                static SCHEMA = {
                    name: String,
                    cost: {
                        type: String,
                        match: /^\$?[\d,]+(\.\d*)?$/
                    }
                };
            }

            let product = Product.create();
            product.name = 'Light Roast Coffee';
            product.cost = '$1..39';

            await product.save().then(function () {
                fail(null, Error, 'Expected error, but got none.');
            }).catch(function (error) {
                expectError(error);
            });
        });
    });

    describe('validate', function () {
        it('should accept value that passes custom validator', async () => {

            class Person extends Document {
                static SCHEMA = {
                    name: {
                        type: String,
                        validate: function (value) {
                            return value.length > 4;
                        }
                    }
                };
                static collectionName() {
                    return 'people';
                }
            }

            let person = Person.create({
                name: 'Scott'
            });

            await person.save().then(function () {
                validateId(person);
                expect(person.name).to.be.equal('Scott');
            });
        });

        it('should reject value that fails custom validator', async () => {

            class Person extends Document {
                static SCHEMA = {
                    name: {
                        type: String,
                        validate: (value) => value.length > 4
                    }
                };
                static collectionName() {
                    return 'people';
                }
            }

            let person = Person.create({
                name: 'Matt'
            });

            await person.save().then(function () {
                fail(null, Error, 'Expected error, but got none.');
            }).catch(function (error) {
                expectError(error);
            });
        });
    });

    describe('Document.create() with Date-type properties', function () {
        
        it('should ensure timestamp dates are auto-converted to Date objects', async () => {

            class Person extends Document {
                static SCHEMA = {
                    birthday: Date
                };
                static collectionName() {
                    return 'people';
                }
            }

            let now = new Date();

            let person = Person.create({
                birthday: now
            });

            await person.save().then(function () {
                validateId(person);
                expect(person.birthday.valueOf()).to.be.equal(now.valueOf());
            });
        });

        it('should ensure date strings are converted to Date objects', async () => {

            class Person extends Document {
                static SCHEMA = {
                    birthday: Date,
                    graduationDate: Date,
                    weddingDate: Date
                };
                static collectionName() {
                    return 'people';
                }
            }

            let birthday = new Date(Date.UTC(2016, 1, 17, 5, 6, 8, 0));
            let graduationDate = new Date(2016, 1, 17, 0, 0, 0, 0);
            let weddingDate = new Date(2016, 1, 17, 0, 0, 0, 0);

            let person = Person.create({
                birthday: '2016-02-17T05:06:08+00:00',
                graduationDate: 'February 17, 2016',
                weddingDate: '2016/02/17'
            });

            await person.save().then(function () {
                validateId(person);
                expect(person.birthday).to.be.instanceOf(Date);
                expect(person.graduationDate).to.be.instanceOf(Date);
                expect(person.weddingDate).to.be.instanceOf(Date);
                
                expect(person.birthday.valueOf()).to.be.equal(birthday.valueOf());
                expect(person.graduationDate.valueOf()).to.be.equal(graduationDate.valueOf());
                expect(person.weddingDate.valueOf()).to.be.equal(weddingDate.valueOf());
            });
        });
        
        it('should not fix any wrong-typed Date values AFTER Document.create()', async () => {
            const D = new Date();
            
            class DPerson extends Document {
                static SCHEMA = {
                    birthday: Date
                };
                static collectionName() {
                    return 'people';
                }
            }

            let person = DPerson.create({
                birthday: Date.now()
            });
            
            assert.instanceOf(person.birthday, Date); // auto-conversion during create()
            assert.doesNotThrow(() => person.validate());
            person.birthday = new Date().toISOString();
            expect(() => person.validate()).to.throw('DPerson.birthday should be Date, but is string');
            person.birthday = Date.now();
            expect(() => person.validate()).to.throw('DPerson.birthday should be Date, but is number');

            await person.save().then(() => {
                expect.fail(null, Error, 'Expected error, but got none.');
            }).catch(error => {
                expect(error).to.be.instanceof(ValidationError);
                expect(error.message).to.equal('Value for DPerson.birthday should be Date, but is number');
                person.birthday = D;
                return person.save();
            }).then(() => {
                assert.isTrue(person.birthday === D); // left untouched by save()
                return DPerson.findOne({'_id': person._id});
            }).then(p => {
                expect(p).to.be.instanceOf(DPerson);
                expect(p).not.to.equal(person);
                expect(p._id).to.equal(person._id);
                assert.equal(p.birthday.getTime(), person.birthday.getTime());
            });
            
        });
    });

    describe('required', function () {
        it('should accept empty value that is not required', async () => {

            class Person extends Document {
                static SCHEMA = {
                    name: {
                        type: String,
                        required: false
                    }
                };
                static collectionName() {
                    return 'people';
                }
            }

            let person = Person.create({
                name: ''
            });

            await person.save().then(function () {
                validateId(person);
                expect(person.name).to.be.equal('');
            });
        });

        it('should accept value that is not undefined', async () => {

            class Person extends Document {
                static SCHEMA = {
                    name: {
                        type: String,
                        required: true
                    }
                };

                static collectionName() {
                    return 'people';
                }
            }

            let person = Person.create({
                name: 'Scott'
            });

            await person.save().then(function () {
                validateId(person);
                expect(person.name).to.be.equal('Scott');
            });
        });

        it('should accept an empty value if default is specified', async () => {

            class Person extends Document {
                static SCHEMA = {
                    name: {
                        type: String,
                        required: true,
                        default: 'Scott'
                    }
                };
                static collectionName() {
                    return 'people';
                }
            }

            let person = Person.create();

            await person.save().then(function () {
                validateId(person);
                expect(person.name).to.be.equal('Scott');
            });
        });

        it('should accept boolean value', async () => {

            class Person extends Document {
                static SCHEMA = {
                    isSingle: {
                        type: Boolean,
                        required: true
                    },
                    isMarried: {
                        type: Boolean,
                        required: true
                    }
                };
                
                static collectionName() {
                    return 'people';
                }
            }

            let person = Person.create({
                isMarried: true,
                isSingle: false
            });

            await person.save().then(function () {
                validateId(person);
                expect(person.isMarried).to.be.true;
                expect(person.isSingle).to.be.false;
            });
        });

        it('should accept date value', async () => {

            class Person extends Document {
                static SCHEMA = {
                    birthDate: {
                        type: Date,
                        required: true
                    }
                };
                static collectionName() {
                    return 'people';
                }
            }

            let myBirthDate = new Date();

            let person = Person.create({
                birthDate: myBirthDate
            });

            await person.save().then(function (savedPerson) {
                validateId(person);
                expect(savedPerson.birthDate.valueOf()).to.equal(myBirthDate.valueOf());
            });
        });

        it('should accept any number value', async () => {

            class Person extends Document {
                static SCHEMA = {
                    age: {
                        type: Number,
                        required: true
                    },
                    level: {
                        type: Number,
                        required: true
                    }
                };

                static collectionName() {
                    return 'people';
                }
            }

            let person = Person.create({
                age: 21,
                level: 0
            });

            await person.save().then(function (savedPerson) {
                validateId(person);
                expect(savedPerson.age).to.equal(21);
                expect(savedPerson.level).to.equal(0);
            });
        });

        it('should reject value that is undefined', async () => {

            class Person extends Document {
                static SCHEMA = {
                    name: {
                        type: String,
                        required: true
                    }
                };
                static collectionName() {
                    return 'people';
                }
            }

            let person = Person.create();

            await person.save().then(function () {
                fail(null, Error, 'Expected error, but got none.');
            }).catch(function (error) {
                expectError(error);
            });
        });

        it('should reject value if specified default empty value', async () => {

            class Person extends Document {
                static SCHEMA = {
                    name: {
                        type: String,
                        required: true,
                        default: ''
                    }
                };
                static collectionName() {
                    return 'people';
                }
            }

            let person = Person.create();

            await person.save().then(function () {
                fail(null, Error, 'Expected error, but got none.');
            }).catch(function (error) {
                expectError(error);
            });
        });

        it('should reject value that is null', async () => {

            class Person extends Document {
                static SCHEMA = {
                    name: {
                        type: Object,
                        toData: x => x,
                        fromData: x => x,
                        validate: () => true,
                        required: true
                    }
                };

                static collectionName() {
                    return 'people';
                }
            }

            let person = Person.create({
                name: null
            });

            await person.save().then(function () {
                fail(null, Error, 'Expected error, but got none.');
            }).catch(function (error) {
                expectError(error);
            });
        });

        it('should reject value that is an empty array', async () => {

            class Person extends Document {
                static SCHEMA = {
                    names: {
                        type: Array,
                        toData: x => x,
                        fromData: x => x,
                        validate: () => true, // 'required'-check is run first, so validate() never gets called during this test
                        required: true
                    }
                };

                static collectionName() {
                    return 'people';
                }
            }

            let person = Person.create({
                names: []
            });

            await person.save().then(function () {
                fail(null, Error, 'Expected error, but got none.');
            }).catch(function (error) {
                expectError(error);
            });
        });

        it('should reject value that is an empty string', async () => {

            class Person extends Document {
                static SCHEMA = {
                    name: {
                        type: String,
                        required: true
                    }
                };

                static collectionName() {
                    return 'people';
                }
            }

            let person = Person.create({
                name: ''
            });

            await person.save().then(function () {
                fail(null, Error, 'Expected error, but got none.');
            }).catch(function (error) {
                expectError(error);
            });
        });

        it('should reject value that is an empty object', async () => {

            class Person extends Document {
                static SCHEMA = {
                    names: {
                        type: Object,
                        fromData: x => x,
                        toData: x => x,
                        validate: () => true, // is run AFTER required-check, so is never called in this test
                        required: true
                    }
                };

                static collectionName() {
                    return 'people';
                }
            }

            let person = Person.create({
                names: {}
            });

            await person.save().then(function () {
                fail(null, Error, 'Expected error, but got none.');
            }).catch(function (error) {
                expectError(error);
            });
        });
    });

    describe('hooks', function () {
        it('should call all pre and post functions', async () => {

            let preValidateCalled = false;
            let preSaveCalled = false;
            let preDeleteCalled = false;

            let postValidateCalled = false;
            let postSaveCalled = false;
            let postDeleteCalled = false;

            class Person extends Document {

                static collectionName() {
                    return 'people';
                }

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

            let person = Person.create();

            await person.save().then(function () {
                validateId(person);

                // Pre/post save and validate should be called
                expect(preValidateCalled).to.be.equal(true);
                expect(preSaveCalled).to.be.equal(true);
                expect(postValidateCalled).to.be.equal(true);
                expect(postSaveCalled).to.be.equal(true);

                // Pre/post delete should not have been called yet
                expect(preDeleteCalled).to.be.equal(false);
                expect(postDeleteCalled).to.be.equal(false);

                return person.delete();
            }).then(function (numDeleted) {
                expect(numDeleted).to.be.equal(1);

                expect(preDeleteCalled).to.be.equal(true);
                expect(postDeleteCalled).to.be.equal(true);
            });
        });
    });

    describe('serialize', function () {
        it('should serialize data to JSON', async () => {
            class Person extends Document {
                static SCHEMA = {
                    name: String,
                    age: Number,
                    isAlive: Boolean,
                    children: [String],
                    spouse: {
                        type: String,
                        default: null
                    }
                };
                static collectionName() {
                    return 'people';
                }
            }

            let person = Person.create({
                name: 'Scott',
                age: 28,
                isAlive: true,
                children: ['Billy', 'Timmy'],
                spouse: null
            });

            await person.save().then(function () {
                validateId(person);
                expect(person.name).to.be.equal('Scott');
                expect(person.age).to.be.equal(28);
                expect(person.isAlive).to.be.equal(true);
                expect(person.children).to.have.length(2);
                expect(person.spouse).to.be.null;

                let json = person.toJSON();

                expect(json.name).to.be.equal('Scott');
                expect(json.age).to.be.equal(28);
                expect(json.isAlive).to.be.equal(true);
                expect(json.children).to.have.length(2);
                expect(json.spouse).to.be.null;
                expect(json._id).to.be.equal(person._id.toString());
            });
        });

        it('should serialize data to JSON', async () => {
            class Person extends Document {
                static SCHEMA = {
                    name: String,
                    children: [Person],
                    spouse: {
                        type: Person,
                        default: null
                    }
                };
                static collectionName() {
                    return 'people';
                }
            }

            let person = Person.create({
                name: 'Scott'
            });

            let spouse = Person.create({
                name: 'Jane'
            });

            let kid1 = Person.create({
                name: 'Billy'
            });

            let kid2 = Person.create({
                name: 'Timmy'
            });

            await spouse.save().then(function () {
                return kid1.save();
            }).then(function () {
                return kid2.save();
            }).then(function () {
                person.spouse = spouse;
                person.children.push(kid1);
                person.children.push(kid2);

                return person.save();
            }).then(function () {
                validateId(person);
                validateId(spouse);
                validateId(kid1);
                validateId(kid2);

                expect(person.name).to.be.equal('Scott');
                expect(person.children).to.have.length(2);
                expect(person.spouse.name).to.be.equal('Jane');
                expect(person.children[0].name).to.be.equal('Billy');
                expect(person.children[1].name).to.be.equal('Timmy');
                expect(person.spouse).to.be.an.instanceof(Person);
                expect(person.children[0]).to.be.an.instanceof(Person);
                expect(person.children[1]).to.be.an.instanceof(Person);

                let json = person.toJSON();

                expect(json.name).to.be.equal('Scott');
                expect(json.children).to.have.length(2);
                expect(json.spouse.name).to.be.equal('Jane');
                expect(json.children[0].name).to.be.equal('Billy');
                expect(json.children[1].name).to.be.equal('Timmy');
                expect(json.spouse).to.not.be.an.instanceof(Person);
                expect(json.children[0]).to.not.be.an.instanceof(Person);
                expect(json.children[1]).to.not.be.an.instanceof(Person);
            });
        });

        it('should serialize data to JSON and ignore methods', function () {
            class Person extends Document {
                static SCHEMA = {
                    name: String
                };

                static collectionName() {
                    return 'people';
                }
            }

            let person = Person.create({
                name: 'Scott'
            });

            let json = person.toJSON();
            expect(json).to.have.keys(['_id', 'name']);
        });
    });

    it('can delete values by assigning null or undefined', async function () {

        class User extends Document {
            static SCHEMA = {
                firstName: String,
                lastName: String
            };
        }

        let user = User.create();
        user.firstName = 'Billy';
        user.lastName = 'Bob';

        await user.save()
            .then(() => User.findOne({_id: user._id}))
            .then(u => {
                validateId(u);
                expect(u._id).to.equal(user._id);
                expect(u.firstName).to.equal('Billy');
                expect(u.lastName).to.equal('Bob');
                u.lastName = null; // delete value in the db by setting null
                return u.save();
            })
            .then(() => User.findOne({_id: user._id}))
            .then(u2 => {
                validateId(u2);
                expect(u2._id).to.equal(user._id);
                expect(u2.firstName).to.equal('Billy');
                expect(u2.lastName).to.be.undefined;
                u2.firstName = undefined; // delete value in the db by setting undefined
                u2.lastName = 'foo';
                return u2.save();
            })
            .then(() => User.findOne({_id: user._id}))
            .then(u3 => {
                validateId(u3);
                expect(u3._id).to.equal(user._id);
                expect(u3.firstName).to.be.undefined;
                expect(u3.lastName).to.equal('foo');
            });
    });
});
