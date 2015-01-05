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
}

Component.prototype.run = function(options) {
    var config = this.config;

    if (!options.deploy || options.deploy.remote !== 'gitlab') {
        throw new Error('暂时不支持 deploy 到其他平台');
    }

    options = _.assign({}, options);

    options.name = config.name;
    options.version = config.version;
    options.repos = config.repos;
    options.url = options.deploy.url;
    options.token = options.deploy.token;
    options.ns = options.deploy.ns;

    var self = this;

    return new Promise(function(resolve, reject) {

            require('./remote/gitlab.js').tagExists(options, function(error, exists) {

                if (error) {
                    return reject(error);
                }

                resolve(exists);
            });
        })

        .then(function(exists) {
            if (exists) {
                console.log(options.name+'@' + options.version +' 已存在，跳过。。');
                return;
            }

            return Promise

                .bind(self)

                // .then(function() {
                //     if (self.config.useGitClone) {
                //         return self.gitclone();
                //     } else {
                //         return self.download();
                //     }
                // })

                // .then(self.build)

                // .then(self.deliver)

                // .then(function() {
                //     if (options.convertAMDToCommonJs) {
                //         return self.convert();
                //     }

                //     return;
                // })

                // .then(self.createJson)

                .then(function() {
                    return self.deploy(options);
                });
        });
};

Component.prototype.gitclone = function() {
    var self = this;

    return new Promise(function() {
        tmp.dir(function(error, dir) {

            if (error) {
                return reject(error);
            }

            self.downloadDir = dir;

            var exec = require('child_process').exec;
            var command = 'git clone ' + self.config.repos + ' ./ && git checkout ' + (self.config.tag || self.config.version);
            console.log(command);
            var child = exec(command, {
                cwd: self.downloadDir
            }, function(error) {
                error ? reject(error) : resolve();
            });

            child.stderr.pipe(process.stderr);
            child.stdout.pipe(process.stdout);

        });
    });
};


Component.prototype.download = function() {
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
        return Promise.reject('Unsupport repos: `'+config.repos+'`');
    }

    var remote = m[1] + '/' + m[2] + '@' + (config.tag || config.version);

    var Scaffold = require('fis-scaffold-kernel');
    var scaffold = new Scaffold({
        type: 'github',
        log: {
            level: 0
        }
    });

    return new Promise(function(resolve, reject) {
        scaffold.download(remote, function(error, location) {
            if (error) {
                return reject(error);
            }

            self.downloadDir = location;
            resolve();
        }, progress);
    });
};

Component.prototype.build = function(value, callback) {
    var config = this.config;
    var self = this;

    if (!config.build) {
        return Promise.resolve();
    }

    return new Promise(function(resolve, reject) {
        var exec = require('child_process').exec;
        var script = config.build;

        if (!~script.indexOf('npm install')) {
            script = 'npm install && ' + script;
        }

        console.log(script);
        var child = exec(script, {
            cwd: self.downloadDir
        }, function(error) {
            error ? reject(error) : resolve();
        });

        child.stderr.pipe(process.stderr);
        child.stdout.pipe(process.stdout);
    })
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

    return new Promise(function(resolve, reject) {
        tmp.dir(function(error, dir) {
            if (error) {
                return reject(error);
            }

            var mapping = config.mapping || [{
                reg: '*',
                release: '$&'
            }];

            scaffold.deliver(self.downloadDir, dir, mapping);
            self.tmpDir = dir;
            resolve();
        });
    })
};

Component.prototype.convert = function() {
    var self = this;
    var jses = require('./find')(this.tmpDir, '**/*.js');

    if (jses.length) {
        console.log('converting...')

        return new Promise(function(resolve, reject) {
            require('./convert.js')(jses, function() {
                // 处理 shim

                if (self.config.shim) {
                    var shim = self.config.shim;

                    Object.keys(shim).forEach(function(key) {
                        var obj = shim[key];
                        var filepath = path.join(self.tmpDir, key);

                        if (!exists(filepath) && !obj.content) {
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

                        write(filepath, prefix + (obj.content || read(filepath, 'utf8')) + affix);
                    });
                }

                resolve();
            });
        })
    } else {
        return Promise.resolve()
    }
};

Component.prototype.createJson = function(value) {
    console.log('createing json...')

    var jsonFile = path.join(this.tmpDir, 'component.json');
    var config = _.assign({}, this.config);

    delete config.mapping;
    delete config.useGitClone;

    write(jsonFile, JSON.stringify(config, null, 4));

    return Promise.resolve();
};

Component.prototype.deploy = function(options) {
    var self = this;

    return new Promise(function(resolve, reject) {
        console.log('deploy...');
        require('./remote/gitlab.js')(self.tmpDir, options, function(error) {
            error ? reject(error) : resolve();
        });
    });
};

module.exports = Component;
