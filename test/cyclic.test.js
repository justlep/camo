import {expect} from 'chai';
import {validateId} from './util.js';
import {Foo} from './cyclic/foo.js';
import {Bar} from './cyclic/bar.js';
import {initMochaHooksForNedb} from './database.js';


describe('Cyclic', function () {

    initMochaHooksForNedb();
    

    describe('schema', function () {
        it('should allow cyclic dependencies', function (done) {
            let f = Foo.create();
            f.num = 26;
            let b = Bar.create();
            b.num = 99;

            f.save().then(function (foo) {
                b.foo = foo;
                return b.save();
            }).then(function (bar) {
                f.bar = b;
                return f.save();
            }).then(function (foo) {
                return Foo.findOne({num: 26});
            }).then(function (foo) {
                validateId(foo);
                validateId(foo.bar);
                expect(foo.num).to.be.equal(26);
                expect(foo.bar.num).to.be.equal(99);
                return Bar.findOne({num: 99});
            }).then(function (bar) {
                validateId(bar);
                validateId(bar.foo);
                expect(bar.num).to.be.equal(99);
                expect(bar.foo.num).to.be.equal(26);
            }).then(done, done);

        });
    });
});
