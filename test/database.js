import {connect} from '../lib/nedbclient.js';
import {resolveProjectPath} from './util.js';
import {readFileSync} from 'node:fs';
import {beforeAll, afterEach} from 'vitest';

export const inMemory = process.env.npm_config_nedb_persistent !== 'true';

const nedbPackageName = (process.env.npm_config_nedb_version === 'justlep') ? '@justlep/nedb' : 'nedb';

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

    beforeAll(() => {
        if (_database) {
            return;
        }

        return import(nedbPackageName)
            .catch(err => {
                console.error(`Missing package ${nedbPackageName}. ` +
                    `Did you install it via "npm i -g ${nedbPackageName}", ` +
                    `and made it accessible via "npm link ${nedbPackageName}"?`);
                throw err;
            })
            .then(nedbModule => nedbModule.Datastore || nedbModule.default) // unlike nedb, @justlep/nedb has no default export
            .then(Datastore => connect(nedbConnectUrl, Datastore))
            .then(db => _database = db);
    });
    
    afterEach(() => _database._dropDatabase().catch(err => console.error(err)));
}

// const MONGO_URL = 'mongodb://localhost/camo_test'
