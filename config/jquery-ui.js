'use strict';

module.exports = (function() {
    return [{
        protocol: "gitlab",
        gitlab: {
            author: "fis-components"
        },
        repos: 'https://github.com/jquery/jquery-ui.git',
        version: '1.11.2',
        description: 'jquery-ui',
        dependencies: [
            "jquery@>=1.6"
        ],
        mapping: [
            {
                reg: /\.min\.(js|css)$/,
                release: false
            },
            {
                reg: /^\/ui\/(.*?)$/,
                release: '$1'
            },
            {
                reg: '/themes/**',
                release: '$&'
            },
            {
                reg: '*',
                release: false
            }
        ]
    }];
})();
