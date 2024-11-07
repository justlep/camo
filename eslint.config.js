import js from '@eslint/js';
import globals from 'globals';
import process from 'node:process';

function getPluginsAndProcessor() {
    if (process.argv.indexOf('--format=checkstyle') >= 0) {
        return {};
    }

    let count = 0;
    
    const logFilenamesPlugin = {
        processors: {
            log: {
                preprocess: function(text, filename) {
                    console.log(++count + '. Linting ' + filename);
                    return [text];
                },
                postprocess: function(messages /*, filename */) {
                    return [].concat(...messages);
                },
                supportsAutofix: true
            }
        }
    };
    
    return {
        plugins: {
            logFilenamesPlugin
        },
        processor: 'logFilenamesPlugin/log'
    };
}

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022
        },
        ...getPluginsAndProcessor(),
        'rules': {
            'eqeqeq': 2,
            'curly': [2, 'all'],
            'brace-style': [2, '1tbs', {'allowSingleLine': true}],
            'comma-dangle': ['error', 'never'],
            'max-len': [2, {'code': 150, 'ignoreRegExpLiterals': true, 'ignoreTemplateLiterals': true, 'ignoreStrings': true}],
            'quotes': [2, 'single'],
            'no-mixed-spaces-and-tabs': [2],
            'no-multi-assign': 2,
            'no-whitespace-before-property': 2,
            'no-alert': 2,
            'no-eval': 2,
            'no-trailing-spaces': 0,
            'no-unused-expressions': 0,
            'no-tabs': 2,
            'no-console': 0,
            'no-unused-vars': [2, {vars: 'local', args: 'none', caughtErrors: 'none'}],
            'no-else-return': 2,
            'no-useless-catch': 0,
            'space-unary-ops': [2, {'words': true, 'nonwords': false}],
            'linebreak-style': [0, 'unix'],
            'semi': [2, 'always'],
            'no-cond-assign': [2, 'always'],
            'no-lonely-if': 2,
            'array-bracket-spacing': [2, 'never'],
            'camelcase': [2, {'properties': 'always'}],
            'object-curly-spacing': [2, 'never'],
            'eol-last': 0,
            'no-path-concat': 2,
            'radix': 2,
            'wrap-iife': [2, 'inside'],
            'yoda': [2, 'never'],
            'no-implicit-globals': 2
        }
    },
    {
        files: [
            'lib/**/*.js',
            'index.js'
        ],
        languageOptions: {
            globals: {
                ...globals.node
            }
        }
    },
    {
        files: [
            'test/**/*.js'
        ],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.mocha
            }
        }
    }
];
