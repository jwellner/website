const path = require('path')
const rollup = require('rollup')

function normalizePath (p) {
  return p.split(path.sep).filter(function filter (q) {
    return typeof q === 'string' && q.length > 0
  }).join('/')
}

function getMetalsmithKey (files, p) {
  let key
  p = normalizePath(p)
  for (key in files) {
    if (files.hasOwnProperty(key) && normalizePath(key) === p) {
      return key
    }
  }
  return null
}

module.exports = function plugin (config, pluginConfig) {
  return function pluginOutput (files, metalsmith, done) {
    rollup.rollup(config)
      .then(function generate (bundle) {
        return bundle.generate(config)
      })
      .then(function finalize (result) {
        output = result.output[0]
        const key = getMetalsmithKey(files, config.output.file) || config.output.file
        files[key] = {
          contents: output.code
        }
        return done()
      })
      .catch(function reject (err) {
        done(err)
      })
  }
}