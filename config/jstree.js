'use strict';

module.exports = (function() {
    return [{
        protocol: "gitlab",
        gitlab: {
            author: "fis-components"
        },
        repos: 'https://github.com/vakata/jstree.git',
        version: '3.0.8',
        name: 'jstree',
        main: 'jstree.js',
        dependencies: [
            "jquery@>=1.9.1"
        ],
        mapping: [
            {
                reg: /\.min\.(js|css)$/,
                release: false
            },
            {
                reg: /^\/dist\/jstree\.js$/,
                release: 'jstree.js'
            },
            {
                reg: /^\/dist\/themes\/(.*)$/,
                release: 'themes/$1'
            },
            {
                reg: /^\/README\.md$/,
                release: '$&'
            },
            {
                reg: '*',
                release: false
            }
        ]
    }]
})();
