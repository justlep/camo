import {Document} from '../../lib/document.js';
import {Bar} from './bar.js';

export class Foo extends Document {
    static SCHEMA = () => ({
        bar: Bar,
        num: Number
    });
}
