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
};

module.exports = Config;
