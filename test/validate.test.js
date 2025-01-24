import {it, describe, assert} from 'vitest';
import {isDate, isNumber} from '../lib/validate.js';

describe('validate', () => {
   
    it('provides isNumber()', () => {
       assert.isFalse(isNumber(null)); 
       assert.isFalse(isNumber(undefined)); 
       assert.isFalse(isNumber(Infinity)); 
       assert.isFalse(isNumber(NaN));
       assert.isFalse(isNumber(new Number(55)));
       assert.isFalse(isNumber('100'));
       assert.isFalse(isNumber(true));
       assert.isFalse(isNumber([]));
       assert.isFalse(isNumber({}));

       assert.isTrue(isNumber(1));
       assert.isTrue(isNumber(0));
       assert.isTrue(isNumber(-1));
       assert.isTrue(isNumber(1.111));
       assert.isTrue(isNumber(1e7));
       assert.isTrue(isNumber(Math.PI));
    });
    
    it('provides isDate()', () => {
        assert.isFalse(isDate(null));
        assert.isFalse(isDate(undefined));
        assert.isFalse(isDate(true));
        assert.isFalse(isDate(false));
        assert.isFalse(isDate({}));
        assert.isFalse(isDate([]));
        assert.isFalse(isDate('foo'));
        assert.isFalse(isDate(123));
        assert.isFalse(isDate(new Date().toISOString()));
        assert.isFalse(isDate(new Date().toLocaleString()));
        assert.isFalse(isDate(Date.now()));
        
        assert.isTrue(isDate(new Date()));
    });
});
