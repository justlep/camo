import {expect, config}  from 'chai';
import {join, resolve} from 'path';
import {fileURLToPath} from 'url';
import {Document} from '../lib/document.js';

config.truncateThreshold = 0; // disable '...' truncating in chai console output

const PROJECT_ROOT_PATH = resolve(fileURLToPath(import.meta.url), '../..');

/**
 * @param {string} [relPath]
 * @return {string}
 */
export const resolveProjectPath = (relPath) => relPath ? join(PROJECT_ROOT_PATH, relPath) : PROJECT_ROOT_PATH;

export const validateId = function(obj) {
    expect(obj).to.not.be.null;
    expect(obj).to.be.a('object');
    expect(obj._id.toString()).to.be.a('string');
    expect(obj._id.toString()).to.have.length.of.at.least(1);
};

export class Data extends Document {
    static SCHEMA = {
        number: {
            type: Number
        },
        source: {
            type: String,
            choices: ['reddit', 'hacker-news', 'wired', 'arstechnica'],
            default: 'reddit'
        },
        item: {
            type: Number,
            min: 0,
            max: 100
        },
        values: {
            type: [Number]
        },
        date: {
            type: Date,
            default: Date.now
        }
    };
}

export const getData1 = function() {
    let data = Data.create();
    data.number = 1;
    data.source = 'arstechnica';
    data.item = 99;
    data.values = [33, 101, -1];
    data.date = new Date(1434304033241);
    return data;
};

export const validateData1 = function(d) {
    expect(d.number).to.be.equal(1);
    expect(d.source).to.be.equal('arstechnica');
    expect(d.item).to.be.equal(99);
    expect(d).to.have.property('values').with.length(3);
    expect(d.date.valueOf()).to.be.equal(1434304033241);
};

export const getData2 = function() {
    let data = Data.create();
    data.number = 2;
    data.source = 'reddit';
    data.item = 26;
    data.values = [1, 2, 3, 4];
    data.date = new Date(1434304039234);
    return data;
};

export const validateData2 = function(d) {
    expect(d.number).to.be.equal(2);
    expect(d.source).to.be.equal('reddit');
    expect(d.item).to.be.equal(26);
    expect(d).to.have.property('values').with.length(4);
    expect(d.date.valueOf()).to.be.equal(1434304039234);
};

// If we expect an error (and check for it in 'catch'), then 
// we end up catching the error thrown when calling expect.fail.
// This means we'll actually catch the wrong error and give
// a false positive.
//
// This is my dumb way of getting around that.
class  FailError extends Error {
    constructor(expected, actual, message) {
        super(message);
        this.name = 'FailError';
        this.expected = expected;
        this.actual = actual;
        Error.captureStackTrace(this, FailError);
    }
}

export const fail = function(expected, actual, message) {
    throw new FailError(expected, actual, message);
};

export const expectError = function(error) {
    if (error instanceof FailError) {
        expect.fail(error.expected, error.actual, error.message);
        return;
    }
    expect(error).to.be.instanceof(Error);
};
