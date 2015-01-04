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

Component.prototype.run = function(options, callback) {

    return Promise

        .bind(this)

        .then(function() {
            if (this.config.useGitClone) {
                return this.gitcloneAsync();
            } else {
                return this.downloadAsync();
            }
        })

        .then(this.buildAsync)

        .then(this.deliverAsync)

        .then(function() {
            if (options.convertAMDToCommonJs) {
                return this.convertAsync();
            }

            return;
        })

        .then(this.createJsonAsync)

        .then(callback)
};

Component.prototype.gitclone = function(callback) {
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


Component.prototype.download = function(callback) {
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
    var rGithub = /github.com(?:\/|\:)([^\/]+)\/(.*)\.git$/i;
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

Component.prototype.build = function(value, callback) {
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

Component.prototype.deliver = function(value, callback) {
    var config = this.config;
    var Scaffold = require('fis-scaffold-kernel');
    var scaffold = new Scaffold({
        type: 'github',
        log: {
            level: 0
        }
    });
    var self = this;

    console.log('filter...');

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

Component.prototype.convert = function(callback) {
    var self = this;
    var jses = require('./find')(this.tmpDir, '**/*.js');

    if (jses.length) {
        console.log('converting...')

        require('./convert.js')(jses, function() {
            // 处理 shim

            if (self.config.shim) {
                var shim = self.config.shim;

                Object.keys(shim).forEach(function(key) {
                    var obj = shim[key];
                    var filepath = path.join(self.tmpDir, key);

                    if (!exists(filepath)) {
                        return;
                    }

                    if (Array.isArray(obj)) {
                        obj = {
                            deps: obj
                        }
                    }

                    var prefix = '';
                    var affix = '';

                    if (obj.deps) {
                        obj.deps.forEach(function(dep) {
                            prefix += 'require(\'' + dep + '\');\n';
                        });
                    }

                    if (obj.init) {
                        affix = 'modules.exports = ('+obj.init+')('+(function() {
                            var deps = [];

                            if (obj.deps) {
                                obj.deps.forEach(function(dep) {
                                    deps.push('require(\''+ dep +'\')');
                                });
                            }

                            return deps.join(', ');
                        })()+');\n' + affix;
                    } else if (obj.exports) {
                        affix = '\nmodule.exports = ' + obj.exports + ';\n' + affix;
                    }

                    write(filepath, prefix + read(filepath, 'utf8') + affix);
                });
            }

            callback();
        });
    } else {
        callback();
    }
};

Component.prototype.createJson = function(value, callback) {
    console.log('createing json...')

    var jsonFile = path.join(this.tmpDir, 'component.json');
    var config = _.assign({}, this.config);

    delete config.mapping;
    delete config.useGitClone;

    write(jsonFile, JSON.stringify(config, null, 4));
    callback();
};

Component.prototype.deploy = function(options, callback) {
    console.log('deploy...')

    options.name = this.config.name;
    options.version = this.config.version;
    options.repos = this.config.repos;

    if (options.remote === 'gitlab') {
        require('./deploy/gitlab.js')(this.tmpDir, options, callback);
    } else {
        throw new Error('暂时不支持 deploy 到其他平台');
    }
};

module.exports = Component;
