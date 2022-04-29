import {connect} from '../lib/nedbclient.js';
import {resolveProjectPath} from './util.js';

// common settings for all tests:

const IN_MEMORY = 1;

const NEDB_PACKAGE_NAME = 1 ? '@justlep/nedb' : 'nedb'; // eslint-disable-line


/** @type {NeDbClient} */
let _database;

/**
 * Adds the mocha 'before' & 'afterEach' hooks,
 * initializing the database (once) at the start of each test suite,
 * flushing the database after each test, regardless if it failed or not.
 */
export function initMochaHooksForNedb() {

    const nedbConnectUrl = `nedb://${IN_MEMORY ? 'memory' : resolveProjectPath('test/nedbdata')}`;

    before(done => _database ? done() : void import(NEDB_PACKAGE_NAME)
        .catch(err => {
            console.error(`Missing package ${NEDB_PACKAGE_NAME}. ` +
                          `Did you install it via "npm i -g ${NEDB_PACKAGE_NAME}", `+
                          `and made it accessible via "npm link ${NEDB_PACKAGE_NAME}"?`);
            throw err;
        })
        .then(nedbModule => nedbModule.Datastore || nedbModule.default) // unlike nedb, @justlep/nedb has no default export
        .then(Datastore => connect(nedbConnectUrl, Datastore))
        .then(db => {_database = db; done();}, done));
    
    afterEach(done => void _database.dropDatabase().then(() => done(), done));
}

// const MONGO_URL = 'mongodb://localhost/camo_test'
