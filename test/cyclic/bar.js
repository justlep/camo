import {Document} from '../../lib/document.js';
import {Foo} from './foo.js';

export class Bar extends Document {
    constructor() {
        super();

        this.foo = Foo;
        this.num = Number;
    }
}
