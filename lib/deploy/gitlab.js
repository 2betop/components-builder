var prompt = require('prompt');
var Promise = require('bluebird');
var find = require('../find');
var fs = require('fs');
var path = require('path');
var exists = fs.existsSync;
var write = fs.writeFileSync;
var read = fs.readFileSync;
var _ = require('lodash');

function deploy(dir, options, callback) {

    var gitlab = require('gitlab')({
        url: options.url,
        user: options.user,
        token: options.token
    });

    extendGitlab(gitlab);

    return Promise

        .bind(this)

        // resolve ns id.
        .then(function() {
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

                    console.log()

                    if (found) {
                        options.group = found;
                        resolve();
                    } else {
                        reject('group 设置不正确！');
                    }
                });
            });
        })

        // 查看 project 是否存在
        .then(function() {
            return new Promise(function(resolve, reject) {
                gitlab.projects.show(options.group.path + '/' + options.name, function(ret) {
                    resolve(ret);
                });
            });
        })

        // 不存在，则创建
        .then(function(exist) {
            if (exist) {
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

                    resolve(ret);
                });
            });
        })

        // 确定 master 存在
        .then(function(project){
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

        // 检查 tag 是否存在，存在则删除
        .then(function(project) {
            // todo
            return project;
        })

        // 删除所有文件，除了 README.md
        // .then(function(project) {
        //     var delRemote = function(folder, callback) {
        //         gitlab.projects.repository.listTree(project.id, {
        //             path: folder,
        //             ref_name: 'master'
        //         }, function(ret) {
        //             if (!ret || !ret.length) {
        //                 callback();
        //             }

        //             Promise

        //                 .reduce(ret, function(_, item) {
        //                     if (item.name === 'README.md') {
        //                         return;
        //                     }

        //                     return new Promise(function(resolve, reject) {
        //                         gitlab.projects.repository.deleteFile()
        //                     });
        //                 })
        //         });
        //     };

        //     return new Promise(function(resolve, reject) {
        //         delRemote('', function(err) {
        //             err ? reject(err) : resolve(project);
        //         });
        //     });
        // })


        // deploy
        .then(function(project) {
            var files = find(dir, '**');

            if (!files.length) {
                throw new Error('nothing to deploy');
            }

            return Promise

                .reduce(files, function(_, file) {
                    if (!file.relative) {
                        return;
                    }

                    return new Promise(function(resolve, reject) {

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
                                    content: read(file.absolute, 'utf8'),
                                    commit_message: 'by robot',
                                }, function(ret) {
                                    if (ret && ret.file_path) {
                                        resolve()
                                    } else {
                                        reject('文件修改失败');
                                    }
                                });
                            } else {

                                gitlab.projects.repository.createFile({
                                    projectId: project.id,
                                    file_path: file.relative,
                                    branch_name: 'master',
                                    content: read(file.absolute, 'utf8'),
                                    commit_message: 'by robot',
                                }, function(ret) {
                                    if (ret && ret.file_path) {
                                        resolve()
                                    } else {
                                        reject('文件添加失败')
                                    }
                                });
                            }

                        });
                    });
                })

                .then(function() {
                    return project;
                });
        })


        // 打 tag
        .then(function(project) {
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

module.exports = function(dir, options, callback) {

    // options.token = 'XsYDeyqyFD777qgovh15';
    // options.user = 'liaoxuezhi';

    if (!options.token) {
        prompt.start();
        prompt.get([
            {
                name: 'token',
                required: true
            }
        ], function (err, result) {

            if (err) {
                return callback(err);
            }

            options.token = result.token;
            deploy(dir, options, callback);
        });
    } else {
        deploy(dir, options, callback);
    }
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
}
