var path = require('path');
var jses = require('../lib/find')(path.join(__dirname, 'fixtures'), '**/*.js');

jses = jses.map(function(info) {
    info.dest = info.absolute + '.cmd';

    return info;
});

require('../lib/convert.js')(jses, function() {

});
