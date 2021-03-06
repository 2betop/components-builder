'use strict';

module.exports = (function() {
    return [{
        repos: 'git@github.com:jquery/jquery.git',
        version: '1.9.1',
        name: 'jquery',
        main: 'jquery.js',
        mapping: [
            {
                reg: /\.min\.(js|css)$/,
                release: false
            },
            {
                reg: /^\/jquery\.js/,
                release: '$&'
            },
            {
                reg: /^\/README\.md/i,
                release: '$&'
            },
            {
                reg: '*',
                release: false
            }
        ]
    }, {
        repos: 'git@github.com:jquery/jquery.git',
        // useGitClone: true,
        version: '2.1.3',
        build: 'npm run build',
        main: 'jquery.js',
        name: 'jquery',
        mapping: [
            {
                reg: /\.min\.(js|css)$/,
                release: false
            },
            {
                reg: /^\/dist\/(.*\.js)/,
                release: '$1'
            },
            {
                reg: /^\/README\.md/i,
                release: '$&'
            },
            {
                reg: '*',
                release: false
            }
        ]
    }]
})();
