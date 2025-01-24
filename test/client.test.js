import {it, describe, beforeEach} from 'vitest';
import {expect} from 'chai';
import {Document} from '../lib/document.js';
import {getData1, getData2, validateId, validateData1, Data} from './util.js';
import {initMochaHooksForNedb} from './database.js';
import {isNativeId} from '../lib/client.js';

describe('Client', function () {

    initMochaHooksForNedb();
    
    describe('#save()', function () {
        it('should persist the object and its members to the database', async function () {

            let data = getData1();

            await data.save().then(function () {
                validateId(data);
                validateData1(data);
            });
        });
    });

    class Address extends Document {
        static SCHEMA = {
            street: String,
            city: String,
            zipCode: Number
        };

        static collectionName() {
            return 'addresses';
        }
    }

    class Pet extends Document {
        static SCHEMA = {
            type: String,
            name: String
        };
    }

    class User extends Document {
        static SCHEMA = {
            firstName: String,
            lastName: String,
            pet: Pet,
            address: Address
        };
    }

    describe('#findOne()', function () {
        it('should load a single object from the collection', async () => {

            let data = getData1();

            await data.save().then(function () {
                validateId(data);
                return Data.findOne({item: 99});
            }).then(function (d) {
                validateId(d);
                validateData1(d);
            });
        });

        it('should populate all fields', async () => {
            let address = Address.create({
                street: '123 Fake St.',
                city: 'Cityville',
                zipCode: 12345
            });

            let dog = Pet.create({
                type: 'dog',
                name: 'Fido'
            });

            let user = User.create({
                firstName: 'Billy',
                lastName: 'Bob',
                pet: dog,
                address: address
            });

            await Promise.all([address.save(), dog.save()]).then(function () {
                validateId(address);
                validateId(dog);
                return user.save();
            }).then(function () {
                validateId(user);
                return User.findOne({_id: user._id}, {populate: true});
            }).then(function (u) {
                expect(u.pet).to.be.an.instanceof(Pet);
                expect(u.address).to.be.an.instanceof(Address);
            });
        });

        it('should not populate any fields', async () => {
            let address = Address.create({
                street: '123 Fake St.',
                city: 'Cityville',
                zipCode: 12345
            });

            let dog = Pet.create({
                type: 'dog',
                name: 'Fido'
            });

            let user = User.create({
                firstName: 'Billy',
                lastName: 'Bob',
                pet: dog,
                address: address
            });

            await Promise.all([address.save(), dog.save()]).then(function () {
                validateId(address);
                validateId(dog);
                return user.save();
            }).then(function () {
                validateId(user);
                return User.findOne({_id: user._id}, {populate: false});
            }).then(function (u) {
                expect(isNativeId(u.pet)).to.be.true;
                expect(isNativeId(u.address)).to.be.true;
            });
        });

        it('should populate specified fields', async () => {
            let address = Address.create({
                street: '123 Fake St.',
                city: 'Cityville',
                zipCode: 12345
            });

            let dog = Pet.create({
                type: 'dog',
                name: 'Fido'
            });

            let user = User.create({
                firstName: 'Billy',
                lastName: 'Bob',
                pet: dog,
                address: address
            });

            await Promise.all([address.save(), dog.save()]).then(function () {
                validateId(address);
                validateId(dog);
                return user.save();
            }).then(function () {
                validateId(user);
                return User.findOne({_id: user._id}, {populate: ['pet']});
            }).then(function (u) {
                expect(u.pet).to.be.an.instanceof(Pet);
                expect(isNativeId(u.address)).to.be.true;
            });
        });
    });

    describe('#findOneAndUpdate()', function () {
        it('should load and update a single object from the collection', async () => {

            let data = getData1();

            await data.save().then(function () {
                validateId(data);
                return Data.findOneAndUpdate({number: 1}, {source: 'wired'});
            }).then(function (d) {
                validateId(d);
                expect(d.number).to.equal(1);
                expect(d.source).to.equal('wired');
            });
        });

        it('should insert a single object to the collection', async () => {
            await Data.findOne({number: 1}).then(function (d) {
                expect(d).to.be.null;
                return Data.findOneAndUpdate({number: 1}, {number: 1}, {upsert: true});
            }).then(function (data) {
                validateId(data);
                expect(data.number).to.equal(1);
                return Data.findOne({number: 1});
            }).then(function (d) {
                validateId(d);
                expect(d.number).to.equal(1);
            });
        });
    });

    describe('#findOneAndDelete()', function () {
        it('should load and delete a single object from the collection', async () => {

            let data = getData1();

            await data.save().then(function () {
                validateId(data);
                return Data.count({number: 1});
            }).then(function (count) {
                expect(count).to.be.equal(1);
                return Data.findOneAndDelete({number: 1});
            }).then(function (numDeleted) {
                expect(numDeleted).to.equal(1);
                return Data.count({number: 1});
            }).then(function (count) {
                expect(count).to.equal(0);
            });
        });
    });

    describe('#find()', function () {
        class City extends Document {
            static SCHEMA = {
                name: String,
                population: Number
            };
            static collectionName() {
                return 'cities';
            }
        }

        var Springfield, SouthPark, Quahog;

        beforeEach(async () => {
            Springfield = City.create({
                name: 'Springfield',
                population: 30720
            });

            SouthPark = City.create({
                name: 'South Park',
                population: 4388
            });

            Quahog = City.create({
                name: 'Quahog',
                population: 800
            });

            await Promise.all([Springfield.save(), SouthPark.save(), Quahog.save()])
                .then(function () {
                    validateId(Springfield);
                    validateId(SouthPark);
                    validateId(Quahog);
                });
        });

        it('should load multiple objects from the collection', async () => {
            await City.find({}).then(function (cities) {
                expect(cities).to.have.length(3);
                validateId(cities[0]);
                validateId(cities[1]);
                validateId(cities[2]);
            });
        });

        it('should load all objects when query is not provided', async () => {
            await City.find().then(function (cities) {
                expect(cities).to.have.length(3);
                validateId(cities[0]);
                validateId(cities[1]);
                validateId(cities[2]);
            });
        });

        it('should sort results in ascending order', async () => {
            await City.find({}, {sort: 'population'}).then(function (cities) {
                expect(cities).to.have.length(3);
                validateId(cities[0]);
                validateId(cities[1]);
                validateId(cities[2]);
                expect(cities[0].population).to.be.equal(800);
                expect(cities[1].population).to.be.equal(4388);
                expect(cities[2].population).to.be.equal(30720);
            });
        });

        it('should sort results in descending order', async () => {
            await City.find({}, {sort: '-population'}).then(function (cities) {
                expect(cities).to.have.length(3);
                validateId(cities[0]);
                validateId(cities[1]);
                validateId(cities[2]);
                expect(cities[0].population).to.be.equal(30720);
                expect(cities[1].population).to.be.equal(4388);
                expect(cities[2].population).to.be.equal(800);
            });
        });

        it('should sort results using multiple keys', async () => {
            let AlphaVille = City.create({
                name: 'Alphaville',
                population: 4388
            });

            let BetaTown = City.create({
                name: 'Beta Town',
                population: 4388
            });

            await Promise.all([AlphaVille.save(), BetaTown.save()]).then(function () {
                return City.find({}, {sort: ['population', '-name']});
            }).then(function (cities) {
                expect(cities).to.have.length(5);
                validateId(cities[0]);
                validateId(cities[1]);
                validateId(cities[2]);
                validateId(cities[3]);
                validateId(cities[4]);
                expect(cities[0].population).to.be.equal(800);
                expect(cities[0].name).to.be.equal('Quahog');
                expect(cities[1].population).to.be.equal(4388);
                expect(cities[1].name).to.be.equal('South Park');
                expect(cities[2].population).to.be.equal(4388);
                expect(cities[2].name).to.be.equal('Beta Town');
                expect(cities[3].population).to.be.equal(4388);
                expect(cities[3].name).to.be.equal('Alphaville');
                expect(cities[4].population).to.be.equal(30720);
                expect(cities[4].name).to.be.equal('Springfield');
            });
        });

        it('should limit number of results returned', async () => {
            await City.find({}, {limit: 2}).then(function (cities) {
                expect(cities).to.have.length(2);
                validateId(cities[0]);
                validateId(cities[1]);
            });
        });

        it('should skip given number of results', async () => {
            await City.find({}, {sort: 'population', skip: 1}).then(function (cities) {
                expect(cities).to.have.length(2);
                validateId(cities[0]);
                validateId(cities[1]);
                expect(cities[0].population).to.be.equal(4388);
                expect(cities[1].population).to.be.equal(30720);
            });
        });

        it('should populate all fields', async () => {
            let address = Address.create({
                street: '123 Fake St.',
                city: 'Cityville',
                zipCode: 12345
            });

            let dog = Pet.create({
                type: 'dog',
                name: 'Fido'
            });

            let user1 = User.create({
                firstName: 'Billy',
                lastName: 'Bob',
                pet: dog,
                address: address
            });

            let user2 = User.create({
                firstName: 'Sally',
                lastName: 'Bob',
                pet: dog,
                address: address
            });

            await Promise.all([address.save(), dog.save()]).then(function () {
                validateId(address);
                validateId(dog);
                return Promise.all([user1.save(), user2.save()]);
            }).then(function () {
                validateId(user1);
                validateId(user2);
                return User.find({}, {populate: true});
            }).then(function (users) {
                expect(users[0].pet).to.be.an.instanceof(Pet);
                expect(users[0].address).to.be.an.instanceof(Address);
                expect(users[1].pet).to.be.an.instanceof(Pet);
                expect(users[1].address).to.be.an.instanceof(Address);
            });
        });

        it('should not populate any fields', async () => {
            let address = Address.create({
                street: '123 Fake St.',
                city: 'Cityville',
                zipCode: 12345
            });

            let dog = Pet.create({
                type: 'dog',
                name: 'Fido'
            });

            let user1 = User.create({
                firstName: 'Billy',
                lastName: 'Bob',
                pet: dog,
                address: address
            });

            let user2 = User.create({
                firstName: 'Sally',
                lastName: 'Bob',
                pet: dog,
                address: address
            });

            await Promise.all([address.save(), dog.save()]).then(function () {
                validateId(address);
                validateId(dog);
                return Promise.all([user1.save(), user2.save()]);
            }).then(function () {
                validateId(user1);
                validateId(user2);
                return User.find({}, {populate: false});
            }).then(function (users) {
                expect(isNativeId(users[0].pet)).to.be.true;
                expect(isNativeId(users[0].address)).to.be.true;
                expect(isNativeId(users[1].pet)).to.be.true;
                expect(isNativeId(users[1].address)).to.be.true;
            });
        });

        it('should populate specified fields', async () => {
            let address = Address.create({
                street: '123 Fake St.',
                city: 'Cityville',
                zipCode: 12345
            });

            let dog = Pet.create({
                type: 'dog',
                name: 'Fido'
            });

            let user1 = User.create({
                firstName: 'Billy',
                lastName: 'Bob',
                pet: dog,
                address: address
            });

            let user2 = User.create({
                firstName: 'Sally',
                lastName: 'Bob',
                pet: dog,
                address: address
            });

            await Promise.all([address.save(), dog.save()]).then(function () {
                validateId(address);
                validateId(dog);
                return Promise.all([user1.save(), user2.save()]);
            }).then(function () {
                validateId(user1);
                validateId(user2);
                return User.find({}, {populate: ['pet']});
            }).then(function (users) {
                expect(users[0].pet).to.be.an.instanceof(Pet);
                expect(isNativeId(users[0].address)).to.be.true;
                expect(users[1].pet).to.be.an.instanceof(Pet);
                expect(isNativeId(users[1].address)).to.be.true;
            });
        });
    });

    describe('#count()', function () {
        it('should return 0 objects from the collection', async () => {

            let data1 = getData1();
            let data2 = getData2();

            await Promise.all([data1.save(), data2.save()]).then(function () {
                validateId(data1);
                validateId(data2);
                return Data.count({number: 3});
            }).then(function (count) {
                expect(count).to.be.equal(0);
            });
        });

        it('should return 2 matching objects from the collection', async () => {

            let data1 = getData1();
            let data2 = getData2();

            await Promise.all([data1.save(), data2.save()]).then(function () {
                validateId(data1);
                validateId(data2);
                return Data.count({});
            }).then(function (count) {
                expect(count).to.be.equal(2);
            });
        });
    });

    describe('#delete()', function () {
        it('should remove instance from the collection', async () => {

            let data = getData1();

            await data.save().then(function () {
                validateId(data);
                return data.delete();
            }).then(function (numDeleted) {
                expect(numDeleted).to.be.equal(1);
                return Data.findOne({item: 99});
            }).then(function (d) {
                expect(d).to.be.null;
            });
        });
    });

    describe('#deleteOne()', function () {
        it('should remove the object from the collection', async () => {

            let data = getData1();

            await data.save().then(function () {
                validateId(data);
                return Data.deleteOne({number: 1});
            }).then(function (numDeleted) {
                expect(numDeleted).to.be.equal(1);
                return Data.findOne({number: 1});
            }).then(function (d) {
                expect(d).to.be.null;
            });
        });
    });

    describe('#deleteMany()', function () {
        it('should remove multiple objects from the collection', async () => {

            let data1 = getData1();
            let data2 = getData2();

            await Promise.all([data1.save(), data2.save()]).then(function () {
                validateId(data1);
                validateId(data2);
                return Data.deleteMany({});
            }).then(function (numDeleted) {
                expect(numDeleted).to.be.equal(2);
                return Data.find({});
            }).then(function (datas) {
                expect(datas).to.have.length(0);
            });
        });

        it('should remove all objects when query is not provided', async () => {

            let data1 = getData1();
            let data2 = getData2();

            await Promise.all([data1.save(), data2.save()]).then(function () {
                validateId(data1);
                validateId(data2);
                return Data.deleteMany();
            }).then(function (numDeleted) {
                expect(numDeleted).to.be.equal(2);
                return Data.find({});
            }).then(function (datas) {
                expect(datas).to.have.length(0);
            });
        });
    });

    describe('#clearCollection()', function () {
        it('should remove all objects from the collection', async () => {

            let data1 = getData1();
            let data2 = getData2();

            await Promise.all([data1.save(), data2.save()]).then(function () {
                validateId(data1);
                validateId(data2);
                return Data.clearCollection();
            }).then(function () {
                return Data.find();
            }).then(function (datas) {
                expect(datas).to.have.length(0);
            });
        });
    });


});
