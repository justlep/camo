import depd from 'depd';

export const deprecate = depd('camo');

export const deepTraverse = function(obj, func) {
    for (let i in obj) {
        func.apply(this, [i, obj[i], obj]);  
        if (obj[i] && typeof obj[i] === 'object') {
            deepTraverse(obj[i], func);
        }
    }
};

const _hasOwnProperty = Object.prototype.hasOwnProperty;

/**
 * @param {*} obj - anything truthy; ignoring 0 or '' here is good enough
 * @param {string} prop
 * @return {boolean}
 */
export const hasOwnProp = (obj, prop) => obj ? _hasOwnProperty.call(obj, prop) : false;
