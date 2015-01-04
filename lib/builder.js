var fs = require('fs');
var path = require('path');
var Promise = require('bluebird');
var exists = fs.existsSync;
var _ = require('lodash');


function Builder(options) {
    this.options = _.assign(_.assign({}, Builder.options), options);
}

// 默认配置
Builder.options = {

    // config 目录，用来读取模块
    configDir: path.resolve(__dirname, '../config/'),

    // 默认处理所有的组件
    components: '**/*.js',

    // 是否将 amd 装换成 commonJs 规范
    convertAMDToCommonJs: true,

    deploy: {
        remote: 'gitlab',
        url: 'http://gitlab.baidu.com',
        ns: 'fisp-components'
    }
};

// 程序入口
Builder.prototype.build = function(done) {
    var self = this;

    return Promise

        // 收集要处理的 modules
        .resolve(self._collect())

        // 读取 config
        .then(function(files) {
            var Config = require('./config.js');

            return files.map(function(info) {
                return new Config(info);
            });
        })

        // 把所有要处理的版本摊开。
        .then(function(configs) {
            var components = [];
            var Component = require('./component.js');

            configs.forEach(function(config) {

                config.versions.forEach(function(item) {
                    components.push(new Component(item))
                });
            });

            return components;
        })

        .then(function(components) {

            // 挨个 build
            return Promise

                .reduce(components, function(initVlalue, item) {
                    return item

                        .run(self.options)

                        .then(function() {
                            return item.deployAsync(self.options.deploy)
                        })
                }, components);
        })

        .then(function(values) {
            done && done(false, values);
        })

        .error(function(reason) {
            done && done(reason)
        });
};

Builder.prototype._collect = function() {
    var options = this.options;
    var dir = options.configDir;

    if (!exists(dir)) {
        return done('Config 目录不存在。');
    }

    return require('./find')(dir, options.components);
};


// expose it.
module.exports = Builder;
