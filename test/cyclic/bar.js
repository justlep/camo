import {Document} from '../../lib/document.js';
import {Foo} from './foo.js';

export class Bar extends Document {
    static SCHEMA = () => ({
        foo: Foo,
        num: Number
    });
}
