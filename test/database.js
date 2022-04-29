import {connect} from '../lib/nedbclient.js';
import {resolveProjectPath} from './util.js';
import {readFileSync} from 'node:fs';

const inMemory = process.env.npm_config_NEDB_PERSISTENT !== 'true';

const nedbPackageName = (process.env.npm_config_NEDB_VERSION === 'justlep') ? '@justlep/nedb' : 'nedb';

let nedbVersion;
try {
    nedbVersion = JSON.parse(readFileSync(resolveProjectPath(`node_modules/${nedbPackageName}/package.json`))).version;
} catch (err) {
    nedbVersion = '??';
}

let infoStr = `Using NeDB package: ${nedbPackageName}@${nedbVersion} (${inMemory ? 'in-memory' : 'persistent'})`;
console.log(`${'-'.repeat(infoStr.length)}\n${infoStr}\n${'-'.repeat(infoStr.length)}`);

/** @type {NeDbClient} */
let _database;

/**
 * Adds the mocha 'before' & 'afterEach' hooks,
 * initializing the database (once) at the start of each test suite,
 * flushing the database after each test, regardless if it failed or not.
 */
export function initMochaHooksForNedb() {

    const nedbConnectUrl = `nedb://${inMemory ? 'memory' : resolveProjectPath('test/nedbdata')}`;

    before(done => _database ? done() : void import(nedbPackageName)
        .catch(err => {
            console.error(`Missing package ${nedbPackageName}. ` +
                          `Did you install it via "npm i -g ${nedbPackageName}", `+
                          `and made it accessible via "npm link ${nedbPackageName}"?`);
            throw err;
        })
        .then(nedbModule => nedbModule.Datastore || nedbModule.default) // unlike nedb, @justlep/nedb has no default export
        .then(Datastore => connect(nedbConnectUrl, Datastore))
        .then(db => {_database = db; done();}, done));
    
    afterEach(done => void _database.dropDatabase().then(() => done(), done));
}

// const MONGO_URL = 'mongodb://localhost/camo_test'
