var tmp = require('tmp');
var Promise = require('bluebird');
var fs = require('fs');
var path = require('path');
var exists = fs.existsSync;
var write = fs.writeFileSync;
var read = fs.readFileSync;
var _ = require('lodash');

function Component(config) {
    this.config = config;
    Promise.promisifyAll(this);
}

Component.prototype.run = function(callback) {

    this.downloadDir = '/var/folders/36/dtb54xfx4js6wg1q7276hcdw0000gn/T/tmp-10431dlfce6o';
    this.tmpDir = '/var/folders/36/dtb54xfx4js6wg1q7276hcdw0000gn/T/tmp-11239isabb7k';

    return Promise

        .bind(this)

        // .then(this.downloadAsync)

        // .then(this.gitcloneAsync)

        // .then(this.buildAsync)

        // .then(this.deliverAsync)

        // .then(this.convertAsync)

        // .then(this.createJsonAsync)

        .then(callback)
};

Component.prototype.gitclone = function(error, callback) {
    var self = this;

    tmp.dir(function(error, dir) {

        if (error) {
            return callback(error);
        }

        self.downloadDir = dir;

        var exec = require('child_process').exec;
        var command = 'git clone ' + self.config.repos + ' ./ && git checkout ' + (self.config.tag || self.config.version);
        console.log(command);
        var child = exec(command, {
            cwd: self.downloadDir
        }, callback);

        child.stderr.pipe(process.stderr);
        child.stdout.pipe(process.stdout);

    });
};


Component.prototype.download = function(error, callback) {
    var self = this;
    var SimpleTick = require('./ticker.js');
    var ProgressBar = require('progress');

    var bar;
    var progress = function(percent, loaded, total) {
        if (total) {
            bar = bar || new ProgressBar('downloading `' + remote + '` [:bar] :percent :etas', {
                complete: '=',
                incomplete: ' ',
                width: 20,
                total: total,
                clear: true
            });

            bar.update(percent);
        } else {
            bar = bar || new SimpleTick('downloading `' + remote + '` ');
            bar.tick();

            percent>=1 && (bar.clear(), bar = null);
        }
    };

    var config = this.config;
    var rGithub = /\/\/github.com\/([^\/]+)\/(.*)\.git$/i;
    var m = rGithub.exec(config.repos);

    if (!m) {
        return callback('Unsupport repos: `'+config.repos+'`');
    }

    var remote = m[1] + '/' + m[2] + '@' + (config.tag || config.version);

    var Scaffold = require('fis-scaffold-kernel');
    var scaffold = new Scaffold({
        type: 'github',
        log: {
            level: 0
        }
    });

    scaffold.download(remote, function(error, location) {
        if (error) {
            return callback(error);
        }

        self.downloadDir = location;
        callback(null);
    }, progress);
};

Component.prototype.build = function(error, callback) {
    var config = this.config;

    if (!config.build) {
        return callback()
    }

    var exec = require('child_process').exec;

    console.log(config.build);
    var child = exec(config.build, {
        cwd: this.downloadDir
    }, callback);

    child.stderr.pipe(process.stderr);
    child.stdout.pipe(process.stdout);
};

Component.prototype.deliver = function(error, callback) {
    var config = this.config;
    var Scaffold = require('fis-scaffold-kernel');
    var scaffold = new Scaffold({
        type: 'github',
        log: {
            level: 0
        }
    });
    var self = this;

    tmp.dir(function(error, dir) {
        if (error) {
            return callback(error);
        }

        var mapping = config.mapping || [{
            reg: '*',
            release: '$&'
        }];

        scaffold.deliver(self.downloadDir, dir, mapping);
        self.tmpDir = dir;
        callback();
    });
};

Component.prototype.convert = function(error, callback) {
    var jses = require('./find')(this.tmpDir, '**/*.js');

    if (jses.length) {
        require('./convert.js')(jses, callback);
    } else {
        callback();
    }
};

Component.prototype.createJsonAsync = function(error, callback) {
    var jsonFile = path.join(this.tmpDir, 'component.json');
    var config = _.assign({}, this.config);

    delete config.mapping;
    write(jsonFile, JSON.stringify(config, null, 4));
};

Component.prototype.deploy = function(options) {
    console.log(options, this.tmpDir);
};

module.exports = Component;
