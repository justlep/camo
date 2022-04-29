/** @type {DatabaseClient} */
let _dbClient;

// exporting frequently used client methods here, available once the client instance is set up.
// indirections via getClientInstance().toNativeId() are wasting cycles
// TODO think of nicer solution; remove most/all DB()... indirections where allowed

export let toCanonicalId;
export let isNativeId;

/**
 * @param {DatabaseClient} client
 * @throws Error if the client was already set, or the given client is no valid DatabaseClient
 */
export function setClientInstance(client) {
    if (_dbClient) {
        throw new Error('Client was already set');
    }
    if (!(client instanceof DatabaseClient)) {
        throw new Error('Invalid client');
    }
    _dbClient = client;
    
    toCanonicalId = _dbClient.toCanonicalId;
    isNativeId = _dbClient.isNativeId;
}

/**
 * @return {DatabaseClient}
 * @throws Error if {@link setClientInstance} wasn't called yet
 */
export const getClientInstance = () => {
    if (!_dbClient) {
        throw new Error('You must first call \'connect\' before loading/saving documents.');
    }
    return _dbClient;
};


/**
 * @abstract
 */
export class DatabaseClient {

    /**
     * @param {string} url
     */
    constructor(url) {
        this._url = url;
        setClientInstance(this);
    }

    save(collection, query, values) {
        throw new TypeError('You must override save.');
    }

    delete(collection) {
        throw new TypeError('You must override delete.');
    }

    deleteOne(collection, query) {
        throw new TypeError('You must override deleteOne.');
    }

    deleteMany(collection, query) {
        throw new TypeError('You must override deleteMany.');
    }

    findOne(collection, query) {
        throw new TypeError('You must override findOne.');
    }

    findOneAndUpdate(collection, query, values, options) {
        throw new TypeError('You must override findOneAndUpdate.');
    }

    findOneAndDelete(collection, query, options) {
        throw new TypeError('You must override findOneAndDelete.');
    }

    find(collection, query, options) {
        throw new TypeError('You must override findMany.');
    }

    count(collection, query) {
        throw new TypeError('You must override count.');
    }

    createIndex(collection, field, options) {
        throw new TypeError('You must override createIndex.');
    }

    static connect(url, options) {
        throw new TypeError('You must override connect (static).');
    }

    close() {
        throw new TypeError('You must override close.');
    }

    clearCollection(collection) {
        throw new TypeError('You must override clearCollection.');
    }

    dropDatabase() {
        throw new TypeError('You must override dropDatabase.');
    }

    toCanonicalId(id) {
        throw new TypeError('You must override toCanonicalId.');
    }

    isNativeId(value) {
        throw new TypeError('You must override isNativeId.');
    }

    toNativeId(id) {
        return this.nativeIdType()(id);
    }

    nativeIdType() {
        throw new TypeError('You must override nativeIdType.');
    }

    driver() {
        throw new TypeError('You must override driver.');
    }
}
