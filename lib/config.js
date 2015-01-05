var path = require('path');

function Config(info) {
    var versions;

    try {
        versions = require(info.absolute);
    } catch (err) {
        versions = [];
    }

    // todo normalize


    //
    this.versions = versions;

    this.versions.forEach(function(version) {
        version.name = version.name || path.basename(info.absolute, '.js');
    });
};

module.exports = Config;
