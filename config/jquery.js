'use strict';

module.exports = (function() {
    return [{
        protocol: "github",
        github: {
            author: "fis-components"
        },
        repos: 'git@github.com:jquery/jquery.git',
        version: '1.9.1',
        name: 'jquery',
        main: 'jquery.js',
        // build: 'npm install && npm install grunt-cli && ./node_modules/.bin/grunt',
        mapping: [
            {
                reg: /\.min\.(js|css)$/,
                release: false
            },
            // {
            //     reg: /^\/dist\/(.*\.js)/,
            //     release: '$1'
            // },

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
        protocol: "github",
        github: {
            author: "fis-components"
        },
        repos: 'git@github.com:jquery/jquery.git',
        version: '2.1.0',
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
