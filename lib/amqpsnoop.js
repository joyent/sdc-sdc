/*
 * amqpsnoop.js: snoop AMQP traffic
 *
 * Copyright 2011 Joyent. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

var mod_path = require('path');
var mod_fs = require('fs');

var mod_amqp = require('amqp');
var mod_getopt = require('posix-getopt');
var mod_util = require('util');
var mod_vm = require('vm');

var aq_broker = aqReadConfig() || {
    host: 'localhost'
};

var aq_usage_message = [
    'usage: amqpsnoop [-h host] [-r routekey] [-f filter...] [-x exchange]',
    '',
    'Snoops AMQP messages sent to routekey <routekey> using broker <host>.',
    'All messages must be JSON-encoded objects.  The following options may ',
    'be specified:',
    '',
    '    -h host        hostname of AMQP broker to use (default: %%HOST%%)',
    '',
    '    -r routekey    routekey to bind to (default: "#")',
    '',
    '    -f filter      filter expression to invoke on each message',
    '                   Multiple filters may be specified.  Each one is a ',
    '                   chunk of JavaScript code to be executed with each ',
    '                   message bound to variable "msg".  The message is ',
    '                   only printed if all filters return true.',
    '',
    '    -o format      output messages with the given format',
    '                   Valid values are "inspect" (uses util.inspect, the)',
    '                   default), "json" and "json0" (JSON with no ',
    '                   indentation).',
    '',
    '    -x exchange    exchange name (default: "amq.topic")',
    '',
    'Example: using broker 10.99.99.5, show all AMQP messages sent to any ',
    'routing key starting with "ca." and whose "ca_subtype" member is not ',
    '"ping":',
    '',
    '    amqpsnoop -h 10.99.99.5 -r "ca.#" -f \'msg.ca_subtype != "ping"\''
].join('\n').replace(/%%HOST%%/g, aq_broker.host);

var aq_routekey = '#';                          /* routing key to listen to */
var aq_exchange = 'amq.topic';                  /* exchange name */
var aq_filters = [];

var aq_queuename;                               /* local queue name */
var aq_amqp;                                    /* amqp connection */
var aq_queue;                                   /* local queue */

var aq_outputters = {
    'inspect': function (msg) {
        console.log(mod_util.inspect(msg, false, null));
    },
    'json': function (msg) {
        console.log(JSON.stringify(msg, null, 2));
    },
    'json0': function (msg) {
        console.log(JSON.stringify(msg, null, 0));
    }
};
var aq_outputter = aq_outputters['inspect'];    /* outputter function */


function main()
{
    if (!aqParseOptions())
        process.exit(1);

    aq_queuename = 'amqpsnoop.' + Math.random() * 10000000;
    aq_amqp = mod_amqp.createConnection(aq_broker);
    aq_amqp.on('ready', function () {
        aq_queue = aq_amqp.queue(aq_queuename,
            { exclusive: true }, function () {
            aq_queue.bind(aq_exchange, aq_routekey);
            aq_queue.subscribe(aqReceiveMessage);
            });
    });
}

function aqUsage()
{
    console.error(aq_usage_message);
    process.exit(1);
}

function aqParseOptions()
{
    var parser, cc;

    parser = new mod_getopt.BasicParser('f:r:h:o:x:', process.argv);
    while ((cc = parser.getopt()) !== undefined) {
        if (cc['error'])
            aqUsage();

        switch (cc['option']) {
        case 'h':
            aq_broker['host'] = cc['optarg'];
            break;

        case 'r':
            aq_routekey = cc['optarg'];
            break;

        case 'f':
            aq_filters.push(
                mod_vm.createScript(cc['optarg']));
            break;

        case 'o':
            aq_outputter = aq_outputters[cc['optarg']];
            if (aq_outputter === undefined) {
                console.error('unknown output format: %s',
                          cc['optarg']);
                aqUsage();
            }
            break;

        case 'x':
            aq_exchange = cc['optarg'];
            break;

        default:
            return (false);
        }
    }
    return (true);
}

function aqReceiveMessage(msg)
{
    var ii;

    for (ii = 0; ii < aq_filters.length; ii++) {
        if (!(aqFilterApply(aq_filters[ii], msg)))
            return;
    }

    aq_outputter(msg);
}

function aqFilterApply(script, msg)
{
    try {
        return (script.runInNewContext({ msg: msg }));
    } catch (ex) {
        console.error('ERROR applying filter: %s', ex.message);
        return (false);
    }
}

function aqReadConfig()
{
    var path = mod_path.join(__dirname, '..', 'etc', 'config.json');
    var cfg;

    try {
        cfg = JSON.parse(mod_fs.readFileSync(path, 'utf8'));
    } catch (ex) {
        return (null);
    }

    if (!cfg || !cfg.rabbitmq)
        return (null);

    var a = cfg.rabbitmq.split(/:/);
    if (a.length !== 4)
        return (null);

    return ({
        login: a[0],
        password: a[1],
        host: a[2],
        port: Number(a[3])
    });
}

main();

/* vim: set ts=4 sts=4 sw=4 et: */
