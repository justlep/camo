import {it, describe, expect} from 'vitest';
import {Document} from '../lib/document.js';
import {resolveProjectPath, validateId} from './util.js';
import {initMochaHooksForNedb, inMemory} from './database.js';
import {readFileSync} from 'node:fs';


describe('NeDbClient', function() {

    initMochaHooksForNedb();
    
    
    /*describe('#dropDatabase()', function() {
        it('should drop the database and delete all its data', async () => {

            console.log('here-2');

            let data1 = getData1();
            let data2 = getData2();

            console.log('here-22');

            await data1.save().then(function(d) {
                console.log('here-1');
                validateId(d);
                return data2.save();
            }).then(function(d) {
                console.log('here00');
                validateId(d);
            }).then(function() {
                console.log('here0');
                // Validate the client CREATED the necessary file(s)
                expect(_.isEmpty(database.driver())).to.not.be.true;
                return new Promise(function(resolve, reject) {
                    console.log('here1');
                    fs.readdir(database._path, function(error, files) {
                        let dbFiles = [];
                        files.forEach(function(f) {
                            if (_.endsWith(f, '.db')) dbFiles.push(f);
                        });
                        expect(dbFiles).to.have.length(1);
                        resolve();
                    });
                });
            }).then(function() {
                console.log('here2');
                return database.dropDatabase();
            }).then(function() {
                console.log('here3');
                // Validate the client DELETED the necessary file(s)
                expect(_.isEmpty(database.driver())).to.be.true;
                return new Promise(function(resolve, reject) {
                    console.log('here4');
                    fs.readdir(database._path, function(error, files) {
                        let dbFiles = [];
                        files.forEach(function(f) {
                            if (_.endsWith(f, '.db')) dbFiles.push(f);
                        });
                        expect(dbFiles).to.have.length(0);
                        resolve();
                    });
                });
            });
        });
    });*/

    describe('id', function() {
        
        it('should allow custom _id values', async () => {
            class School extends Document {
                static SCHEMA = {
                    name: String
                };
            }

            let school = School.create();
            school._id = '1234567890abcdef';
            school.name = 'South Park Elementary';

            await school.save().then(function() {
                validateId(school);
                expect(school._id).to.be.equal('1234567890abcdef');
                return School.findOne();
            }).then(function(s) {
                validateId(s);
                expect(s._id).to.be.equal('1234567890abcdef');
            });
        });
        
    });

    describe('indexes', async () => {
        it('should reject documents with duplicate values in unique-indexed fields', async () => {
            class User extends Document {
                static SCHEMA = {
                    name: String,
                    email: {
                        type: String,
                        unique: true
                    }
                };
            }

            let user1 = User.create();
            user1.name = 'Bill';
            user1.email = 'billy@example.com';

            let user2 = User.create();
            user1.name = 'Billy';
            user2.email = 'billy@example.com';

            await Promise.all([user1.save(), user2.save()]).then(function() {
                expect.fail(null, Error, 'Expected error, but got none.');
            }).catch(function(error) {
                expect(error.errorType).to.be.equal('uniqueViolated');
            });
        });

        it('should accept documents with duplicate values in non-unique, non-indexed fields', async () => {
            class User extends Document {
                static SCHEMA = {
                    name: String,
                    email: {
                        type: String,
                        unique: false
                    }
                };
            }

            let user1 = User.create();
            user1.name = 'Bill';
            user1.email = 'billy@example.com';

            let user2 = User.create();
            user1.name = 'Billy';
            user2.email = 'billy@example.com';

            await Promise.all([user1.save(), user2.save()]).then(function() {
                validateId(user1);
                validateId(user2);
                expect(user1.email).to.be.equal('billy@example.com');
                expect(user2.email).to.be.equal('billy@example.com');
            });
        });
        
        it('should accept documents with duplicate values in non-unique-indexed fields', async () => {
            class User extends Document {
                static SCHEMA = {
                    name: String,
                    email: {
                        type: String,
                        indexed: true
                    }
                };
            }

            let user1 = User.create();
            user1.name = 'Bill';
            user1.email = 'billy@example.com';

            let user2 = User.create();
            user1.name = 'Billy';
            user2.email = 'billy@example.com';

            await Promise.all([user1.save(), user2.save()]).then(function() {
                if (!inMemory) {
                    const dbFileContent = readFileSync(resolveProjectPath('test/nedbdata/users.db')).toString(); 
                    expect(dbFileContent).to.contain('{"$$indexCreated":{"fieldName":"email","unique":false,"sparse":false}}');
                }
                validateId(user1);
                validateId(user2);
                expect(user1.email).to.be.equal('billy@example.com');
                expect(user2.email).to.be.equal('billy@example.com');
            });
        });
    });
});
