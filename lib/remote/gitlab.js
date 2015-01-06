var prompt = require('prompt');
var Promise = require('bluebird');
var find = require('../find');
var fs = require('fs');
var path = require('path');
var exists = fs.existsSync;
var write = fs.writeFileSync;
var read = fs.readFileSync;
var _ = require('lodash');

function resolveGroup(options, gitlab) {

    if (options.group) {
        return Promise.resolve(options.group);
    }

    return new Promise(function(resolve, reject) {
        gitlab.groups.all(function(ret) {
            if (!ret || !ret.length) {
                return reject('所选用户下面没有 groups 或者 token 不对');
            }

            var found = null;
            ret.every(function(item) {
                if (options.ns === item.name || options.ns === item.path || options.ns === item.id) {
                    found = item;
                    return false;
                }
                return true;
            });

            if (found) {
                options.group = found;
                resolve();
            } else {
                reject('group 设置不正确！');
            }
        });
    });
}

function resolveProject(options, gitlab) {
    if (options.project) {
        return Promise.resolve(options.project);
    }

    return new Promise(function(resolve, reject) {
        gitlab.projects.show(options.group.path + '/' + options.name, function(ret) {
            options.project = ret;
            resolve(ret);
        });
    });
}

function deploy(dir, options, callback) {

    var gitlab = require('gitlab')({
        url: options.url,
        token: options.token
    });

    extendGitlab(gitlab);

    return Promise

        .bind(this)

        // resolve ns id.
        .then(function() {
            debugger;
            return resolveGroup(options, gitlab);
        })

        .then(function() {
            return resolveProject(options, gitlab)

                // 不存在，则创建
                .then(function(exist) {
                    if (exist && exist.id) {
                        return exist;
                    }

                    return new Promise(function(resolve, reject) {
                        gitlab.projects.create({
                            name: options.name,
                            namespace_id: options.group.id,
                            description: 'Forked from ' + options.repos
                        }, function(ret) {
                            if (!ret || !ret.id) {
                                return reject('创建失败！');
                            }
                            options.project = ret;
                            resolve(ret);
                        });
                    });
                })
        })

        // 确定 master 存在
        .then(function(){
            var project = options.project;
            return new Promise(function(resolve, reject) {
                gitlab.projects.repository.showBranch(project.id, 'master', function(ret) {

                    if (!ret) {

                        var readme = path.join(dir, 'README.md');

                        if (!exists(readme)) {
                            write(readme, 'Forked from ' + options.repos);
                        }

                        var exec = require('child_process').exec;
                        var command = 'git init && git add README.md && git commit -m "init" && git remote add origin ' +project.http_url_to_repo + ' && git push -u origin master';
                        console.log(command);

                        var child = exec(command, {
                            cwd: dir
                        }, function(err) {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(project);
                            }
                        });

                        child.stderr.pipe(process.stderr);
                        child.stdout.pipe(process.stdout);
                    } else {
                        resolve(project);
                    }
                });
            });
        })

        // 删除所有文件，除了 README.md
        .then(function() {
            var project = options.project;
            var delRemote = function(folder) {
                return new Promise(function(resolve, reject) {

                    gitlab.projects.repository.listTree(project.id, {
                        path: folder,
                        ref_name: 'master'
                    }, function(ret) {
                        if (!ret || !ret.length) {
                            return resolve();
                        }

                        Promise

                            .reduce(ret, function(_, item) {
                                if (item.name === 'README.md') {
                                    return Promise.resolve();
                                } else if (item.type === 'tree') {
                                    return delRemote(path.join(folder, item.name));
                                }

                                return new Promise(function(resolve, reject) {

                                    gitlab.projects.repository.deleteFile({
                                        projectId: project.id,
                                        file_path: path.join(folder, item.name),
                                        commit_message: 'by robot',
                                        branch_name: 'master'
                                    }, function(ret) {
                                        process.stdout.write('.');
                                        resolve();
                                    });
                                });
                            }, null)

                            .then(resolve);
                    });

                });
            };

            return delRemote('');
        })


        // deploy
        .then(function() {
            var files = find(dir, '**');
            var project = options.project;

            if (!files.length) {
                throw new Error('nothing to deploy');
            }

            return Promise

                .reduce(files, function(_, file) {
                    if (!file.relative) {
                        return;
                    }

                    return new Promise(function(resolve, reject) {
                        var retryCount = 3;

                        function saveFile() {
                            gitlab.projects.repository.showFile(project.id, {
                                file_path: file.relative,
                                ref: 'master'
                            }, function(ret) {
                                if (ret) {
                                    var content = read(file.absolute, 'utf8');

                                    var raw = ret.content;

                                    if (ret.encoding === 'base64') {
                                        raw = new Buffer(raw, 'base64').toString();
                                    }

                                    if (raw === content) {
                                        return resolve();
                                    }

                                    gitlab.projects.repository.updateFile({
                                        projectId: project.id,
                                        file_path: file.relative,
                                        branch_name: 'master',
                                        encoding: 'base64',
                                        content: new Buffer(read(file.absolute, 'utf8')).toString('base64'),
                                        commit_message: 'by robot',
                                    }, function(ret) {
                                        if (ret && ret.file_path) {
                                            process.stdout.write('.');
                                            resolve()
                                        } else {
                                            fail('文件修改失败');
                                        }
                                    });
                                } else {

                                    gitlab.projects.repository.createFile({
                                        projectId: project.id,
                                        file_path: file.relative,
                                        branch_name: 'master',
                                        encoding: 'base64',
                                        content: new Buffer(read(file.absolute, 'utf8')).toString('base64'),
                                        commit_message: 'by robot',
                                    }, function(ret) {
                                        if (ret && ret.file_path) {
                                            process.stdout.write('.');
                                            resolve()
                                        } else {
                                            fail('文件添加失败')
                                        }
                                    });
                                }

                            });
                        }

                        function fail(reason) {
                            if (--retryCount) {
                                console.log('\n 保存 %s 文件失败，2 秒后重试', file.relative);
                                setTimeout(saveFile, 2000);
                            } else {
                                reject(reason);
                            }
                        }

                        saveFile();
                    });
                }, null)

                .then(function() {
                    return project;
                });
        })


        // 打 tag
        .then(function() {
            var project = options.project;

            if (!options.version) {
                return project;
            }

            return new Promise(function(resolve, reject) {
                gitlab.projects.repository.createTag({
                    projectId: project.id,
                    tag_name: options.version,
                    ref: 'master'
                }, function(ret) {
                    if (!ret || !ret.name) {
                        reject('tag 添加失败')
                    } else {
                        resolve(project);
                    }
                })
            });
        })


        .then(function() {
            console.log('deploy to gitlab success.')
            callback();
        });
}

var token;
function resolveToken(callback) {
    // token = 'XsYDeyqyFD777qgovh15'

    if (!token) {
        prompt.start();
        prompt.get([
            {
                name: 'token',
                required: true,
                'default': 'XsYDeyqyFD777qgovh15',
                description: 'Enter the gitlab token'
            }
        ], function (err, result) {

            if (err) {
                return callback(err);
            }

            token = result.token;
            callback(null, token);
        });
    } else {
        callback(null, token);
    }
}

module.exports = function(dir, options, callback) {
    token = token || options.token;

    resolveToken(function(error, token) {
        if (error) {
            return callback(error);
        }
        options.token = token;
        deploy(dir, options, callback);
    });
};

module.exports.deploy = module.exports;

module.exports.tagExists = function(options, callback) {
    token = token || options.token;

    resolveToken(function(error, token) {
        if (error) {
            return callback(error);
        }

        var gitlab = require('gitlab')({
            url: options.url,
            token: token
        });

        return resolveGroup(options, gitlab)

            .then(function() {
                return resolveProject(options, gitlab);
            })

            .then(function() {
                if (!options.project || !options.project.id) {
                    return callback(null, false);
                }

                gitlab.projects.listTags({id: options.project.id}, function(ret) {
                    if (!ret || !ret.length) {
                        return callback(null, false);
                    }

                    var found = null;
                    options.tags = ret;
                    ret.every(function(item) {
                        if (item.name === options.version) {
                            found = true;
                            return false;
                        }
                        return true;
                    });

                    callback(null, found);
                });
            })
    });
};


// 有些功能实现的不完善，在此扩充他
function extendGitlab(instance) {
    function parseProjectId(projectId) {
        if (typeof projectId === "number") {
        return projectId;
      } else if (projectId.indexOf("/") !== -1) {
        return projectId = encodeURIComponent(projectId);
      } else {
        return projectId = parseInt(projectId);
      }
    }

    instance.projects.repository.createTag = function(params, fn) {
      if (params == null) {
        params = {};
      }
      if (fn == null) {
        fn = null;
      }
      this.debug("Projects::createTag()");
      return this.post("projects/" + parseProjectId(params.projectId) + "/repository/tags", params, (function(_this) {
        return function(data) {
          if (fn) {
            return fn(data);
          }
        };
      })(this));
    };

    instance.groups.transferProject = function(params, fn) {
        params = params || {};
        this.debug('Groups::transferGroup');

        return this.post("groups/" + params.id + "/projects/" + parseProjectId(params.projectId), params, (function(_this) {
            return function(data) {
              if (fn) {
                return fn(data);
              }
            };
        })(this));
    };

    instance.projects.repository.deleteFile = function(params, fn) {
        params = params || {};
        this.debug('Projects::deleteFile');

        var opt = this.client.options;

        opt.method = 'DELETE';
        opt.path = "projects/" + parseProjectId(params.projectId) + "/repository/files";
        opt.data = params;

        delete params.projectId;

        requestAPI(opt, function(error, ret) {
            fn(ret || true);
        });
    };
}

var request = require('request');
function requestAPI(opt, callback) {

    request({
        method: opt.method,
        uri: opt.url + '/' + path.join(opt.base_url, opt.path) + '?private_token=' + opt.token,
        json: true,
        body: opt.data,
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'request',
            'PRIVATE-TOKEN': opt.token
        }
    }, function(error, response, body) {
        if (!response || response.statusCode !== 200) {
            var ret = response && response.body;
            callback(ret && ret.message || ret || 'net error');
        } else {
            callback(false, body);
        }
    });
}
