import {Document} from '../../lib/document.js';
import {Bar} from './bar.js';

export class Foo extends Document {
    constructor() {
        super();

        this.bar = Bar;
        this.num = Number;
    }
}
