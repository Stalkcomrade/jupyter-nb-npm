const browserify = require("/app/node_modules/browserify")
const babelify   = require('/app/node_modules/babelify')
const aliasify   = require('/app/node_modules/aliasify')
const html = require('/app/node_modules/browserify-html')

var fs  = require('fs')

// const LayerCake = require("/app/node_modules/layercake")

const bunlde = browserify({       
    entries:['/app/node_modules/layercake/src/layercake.js'],                                                    
    debug:true,                                                                   
    // paths: ["/app/node_modules"]
})
    .transform(html, {
        exts: ['html', 'tpl'], // default
        minify: { // html-minifier options, see more: https://github.com/kangax/html-minifier#options-quick-reference
            removeComments: true,
            collapseWhitespace: true,
            collapseBooleanAttributes: true,
            removeRedundantAttributes: true,
            removeEmptyAttributes: true
        }
    })
  .transform("babelify", {presets: ["@babel/preset-env"]})
  .transform(aliasify, {
    aliases: {
        "svelte": "/app/node_modules/svelte"
    },
    verbose: false
})
  .bundle()
  .pipe(fs.createWriteStream("/app/bundle.js"));

