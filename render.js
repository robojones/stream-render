const Duplex = require('stream').Duplex;
const path = require('path');
const fs = require('fs');
const stream = require('stream'),
    Transform = stream.Transform;
const vm = require('vm');
const extend = require('extend');

const startToken = '`';
const endToken = '´';
const lineToken = '@'

const newLine = '\n';
const escNewLine = '\\n';
const whitespace = /\s/g;

module.exports = render;

/**
* create a readstream for the given file and render it as a template into the writable stream
* @param {Object} writable - writable stream
* @param {string|string[]} filePath - path to file or filename in "/views" directory
* @param {Object} data - info that you want to render into the file.
*/

function render(writable, filePath, data) {
    if(!path.isAbsolute(filePath)) {
        filePath = path.join(process.cwd(), 'views', filePath);
    }

    var cont = extend({}, data);
    cont.write = write;
    cont._insert = _insert;
    const context = new vm.createContext(cont);


    var last = '';
    var code = [];
    var html = [];

    var brackets = {
        open: ['(', '{', '['],
        close: [')', '}', ']'],
        count: [0, 0, 0]
    }

    const readable = fs.createReadStream(filePath);
    readable.on('data', function(chunk) {
        const lines = (last + chunk).split(newLine)
        last = lines.pop();

        lines.forEach((line) => {
            if(line.replace(whitespace, '').indexOf(lineToken) === 0) { //codeline
                let c = line.split(lineToken);
                c.shift();
                c = c.join(lineToken);
                code.push(c);
                countBrackets(c);
            } else if (includes(line, startToken, endToken)) { //line with code
                var rest = line;
                while(rest) {
                    let start = rest.indexOf(startToken);
                    let end = rest.indexOf(endToken);
                    if(start === -1 || end === -1) {
                        start = end = rest.length;
                    }

                    let h = rest.substring(0, start);
                    let c = rest.substring(start + startToken.length, end);


                    html.push(h);
                    code.push('_insert(' + (html.length - 1) + ');');

                    if(c) {
                        code.push('write(' + c + ');');
                    }

                    rest = rest.substring(end + endToken.length);
                }

                code.push('write("' + escNewLine + '");');
            } else { //content line
                html.push(line);
                code.push('_insert(' + (html.length - 1) + ');');
                code.push('write("' + escNewLine + '");');
            }


            tryEx()

            function tryEx() {
                if(closed()) {
                    let c = code.join(' ');
                    try {
                        ex(c, context);
                    } catch(err) {
                        console.error(err);
                    }
                    code = [];
                    html = [];
                    return true;
                } else {
                    return false;
                }
            }
        });
    });

	return new Promise((resolve)=>{
		readable.on('end', function() {
		    resolve(writable);
		});
    });
	
    function _insert(i) {
        writable.write(html[i]);
    }

    function write(...things) {
        writable.write(things.join(' '));
    }

    function countBrackets(code) {
        brackets.open.forEach((bracket, i) => {
            brackets.count[i] += count(code, bracket);
        });
        brackets.close.forEach((bracket, i) => {
            brackets.count[i] -= count(code, bracket);
        });
    }

    function closed() {
        return !brackets.count.filter(item => {
            return item
        }).length;
    }
}

function ex(code, context) {
    const script = new vm.Script(code);
    return script.runInContext(context);
}

function includes(string, ...things) {
    return things.filter(thing => {
        return string.indexOf(thing) !== -1;
    }).length === things.length
}

function count(string, thing) {
    var found = 0;
    for(let i = 0; i < string.length; i++) {
        if(string[i] === thing) {
            found++;
        }
    }
    return found;
}
