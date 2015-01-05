var Builder = require('./lib/builder.js');

var builder = new Builder({
    components: process.argv.slice(2)
});

builder.build();
